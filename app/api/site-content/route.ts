import { env } from "cloudflare:workers";
import { isSiteEditor } from "../../editor-auth";
import { getSiteContent, type SiteContent } from "../../content";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isSiteEditor())) return Response.json({ error: "没有编辑权限" }, { status: 403 });
  return Response.json(await getSiteContent());
}

export async function POST(request: Request) {
  if (!(await isSiteEditor())) return Response.json({ error: "没有编辑权限" }, { status: 403 });
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
    if (!Array.isArray(content.customSections)) content.customSections = stored.customSections;
    if (typeof content.hero.featureTargetSlug !== "string") content.hero.featureTargetSlug = stored.hero.featureTargetSlug;
    content.directions = content.directions.map((item) => ({ ...item, subsections: Array.isArray(item.subsections) ? item.subsections : stored.directions.find((saved) => saved.slug === item.slug)?.subsections ?? [] }));
    content.archives = content.archives.map((item) => ({ ...item, subsections: Array.isArray(item.subsections) ? item.subsections : stored.archives.find((saved) => saved.slug === item.slug)?.subsections ?? [] }));
    content.customSections = content.customSections.map((item) => ({ ...item, subsections: Array.isArray(item.subsections) ? item.subsections : stored.customSections.find((saved) => saved.id === item.id)?.subsections ?? [] }));
    await env.DB.prepare("INSERT INTO site_content (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at")
      .bind(JSON.stringify(content), new Date().toISOString()).run();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Save site content failed", error);
    return Response.json({ error: "保存失败，请保留当前页面并重试" }, { status: 500 });
  }
}
