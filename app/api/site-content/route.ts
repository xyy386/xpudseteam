import { env } from "cloudflare:workers";
import { isSiteEditor } from "../../editor-auth";
import { getEditorIdentity } from "../../editor-credentials";
import { getSiteContent, type SiteContent } from "../../content";
import { findPublicationValidationError } from "../../publication-links";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isSiteEditor())) return Response.json({ error: "没有编辑权限" }, { status: 403 });
  return Response.json(await getSiteContent());
}

export async function POST(request: Request) {
  const identity = await getEditorIdentity();
  if (!identity) return Response.json({ error: "没有编辑权限" }, { status: 403 });
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "请求来源无效" }, { status: 403 });
  }
  if (!env.DB) return Response.json({ error: "内容存储尚未就绪" }, { status: 503 });
  try {
    const raw = await request.text();
    if (raw.length > 750_000) return Response.json({ error: "内容过大" }, { status: 413 });
    const content = JSON.parse(raw) as SiteContent;
    if (!content || typeof content.siteName !== "string" || !Array.isArray(content.members)
      || !Array.isArray(content.directions) || !Array.isArray(content.archives)
      || !content.hero || !content.sectionIntros || !content.backgrounds) {
      return Response.json({ error: "内容格式不正确" }, { status: 400 });
    }
    const stored = await getSiteContent();
    if (content.revision !== stored.revision) return Response.json({ error: "网站内容已被其他成员更新，请核对合并结果。", current: stored }, { status: 409 });
    const publicationError = findPublicationValidationError(content.archives);
    if (publicationError) return Response.json({ error: publicationError.message }, { status: 400 });
    const oldArticles = new Map(stored.archives.flatMap((archive) => archive.newsArticles.map((article) => [article.id, article] as const)));
    for (const archive of content.archives) for (const article of archive.newsArticles ?? []) {
      const previous = oldArticles.get(article.id);
      const oldStatus = previous?.status === "draft" ? "draft" : previous ? "published" : "draft";
      const nextStatus = article.status === "draft" ? "draft" : "published";
      if (identity.role !== "owner" && nextStatus !== oldStatus) return Response.json({ error: "新闻稿发布和撤回须由管理员审核" }, { status: 403 });
      if (article.externalUrl) {
        try { if (new URL(article.externalUrl).protocol !== "https:") throw new Error(); }
        catch { return Response.json({ error: "论文或相关链接必须是完整的 HTTPS 地址" }, { status: 400 }); }
      }
      if (nextStatus === "published" && (oldStatus === "draft" || !previous) && article.id !== "original-events-material"
        && (!article.title?.trim() || !article.date || (!article.attachment && !article.externalUrl && !article.body?.trim()))) {
        return Response.json({ error: "发布前请核对标题、日期以及正文、附件或相关链接" }, { status: 400 });
      }
    }
    if (!Array.isArray(content.customSections)) content.customSections = stored.customSections;
    // The synchronization baseline is managed only by owner-only snapshot operations.
    content.syncBaseRevision = stored.syncBaseRevision;
    if (typeof content.hero.featureTargetSlug !== "string") content.hero.featureTargetSlug = stored.hero.featureTargetSlug;
    if (typeof content.hero.featureArticleId !== "string") content.hero.featureArticleId = stored.hero.featureArticleId;
    content.directions = content.directions.map((item) => ({ ...item, subsections: Array.isArray(item.subsections) ? item.subsections : stored.directions.find((saved) => saved.slug === item.slug)?.subsections ?? [] }));
    content.archives = content.archives.map((item) => ({
      ...item,
      subsections: Array.isArray(item.subsections) ? item.subsections : stored.archives.find((saved) => saved.slug === item.slug)?.subsections ?? [],
      newsArticles: Array.isArray(item.newsArticles) ? item.newsArticles : stored.archives.find((saved) => saved.slug === item.slug)?.newsArticles ?? [],
    }));
    content.customSections = content.customSections.map((item) => ({ ...item, subsections: Array.isArray(item.subsections) ? item.subsections : stored.customSections.find((saved) => saved.id === item.id)?.subsections ?? [] }));
    const revision = crypto.randomUUID();
    content.revision = revision;
    const result = stored.revision
      ? await env.DB.prepare("UPDATE site_content SET data = ?, updated_at = ? WHERE id = 1 AND updated_at = ?").bind(JSON.stringify(content), revision, stored.revision).run()
      : await env.DB.prepare("INSERT INTO site_content (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO NOTHING").bind(JSON.stringify(content), revision).run();
    if (!result.meta.changes) return Response.json({ error: "网站内容刚被其他成员更新，请核对合并结果。", current: await getSiteContent() }, { status: 409 });
    return Response.json({ ok: true, revision });
  } catch (error) {
    console.error("Save site content failed", error);
    return Response.json({ error: "保存失败，请保留当前页面并重试" }, { status: 500 });
  }
}
