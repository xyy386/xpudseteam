import { env } from "cloudflare:workers";
import { isSiteEditor } from "../../editor-auth";
import originalContent from "../../migration-content.json";
import migration from "../../migration-media.json";

export const dynamic = "force-dynamic";

type ExpectedMedia = (typeof migration.media)[number];

const contentData = JSON.stringify(originalContent);
const expectedMedia = new Map<string, ExpectedMedia>(migration.media.map((item) => [item.key, item]));

async function sha256(value: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authorize(): Promise<Response | null> {
  if (!(await isSiteEditor())) return Response.json({ error: "没有编辑权限" }, { status: 403 });
  if (!env.DB || !env.BUCKET) return Response.json({ error: "在线存储尚未就绪" }, { status: 503 });
  return null;
}

async function inspect() {
  const row = await env.DB!.prepare("SELECT data, updated_at FROM site_content WHERE id = 1").first<{ data: string; updated_at: string }>();
  const media = [];
  for (const item of migration.media) {
    const object = await env.BUCKET!.get(item.key);
    media.push({
      key: item.key,
      present: Boolean(object),
      matches: object ? await sha256(await object.arrayBuffer()) === item.sha256 : false,
    });
  }
  return {
    content_present: Boolean(row),
    content_matches: row ? row.data === contentData && row.updated_at === migration.updated_at : false,
    media,
  };
}

export async function GET() {
  const denial = await authorize();
  if (denial) return denial;
  try {
    return Response.json(await inspect());
  } catch (error) {
    console.error("Migration inspection failed", error);
    return Response.json({ error: "迁移核对失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denial = await authorize();
  if (denial) return denial;
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "请求来源无效" }, { status: 403 });
  }

  try {
    if (await sha256(new TextEncoder().encode(contentData)) !== migration.content_sha256) {
      return Response.json({ error: "页面内容校验失败" }, { status: 500 });
    }
    const form = await request.formData();
    const files = form.getAll("media");
    if (files.length !== migration.media.length || files.some((file) => !(file instanceof File))) {
      return Response.json({ error: "请选择完整的 7 张原始图片" }, { status: 400 });
    }

    const incoming = new Map<string, { bytes: ArrayBuffer; item: ExpectedMedia }>();
    for (const file of files as File[]) {
      const item = expectedMedia.get(file.name);
      if (!item || incoming.has(file.name) || file.size !== item.size_bytes) {
        return Response.json({ error: `图片清单不匹配：${file.name}` }, { status: 400 });
      }
      const bytes = await file.arrayBuffer();
      if (await sha256(bytes) !== item.sha256) {
        return Response.json({ error: `图片校验失败：${file.name}` }, { status: 400 });
      }
      incoming.set(file.name, { bytes, item });
    }

    const row = await env.DB!.prepare("SELECT data, updated_at FROM site_content WHERE id = 1").first<{ data: string; updated_at: string }>();
    if (row && (row.data !== contentData || row.updated_at !== migration.updated_at)) {
      return Response.json({ error: "在线页面已有不同内容，未覆盖" }, { status: 409 });
    }

    for (const item of migration.media) {
      const existing = await env.BUCKET!.get(item.key);
      if (existing && await sha256(await existing.arrayBuffer()) !== item.sha256) {
        return Response.json({ error: `在线图片已有不同内容，未覆盖：${item.key}` }, { status: 409 });
      }
    }

    for (const item of migration.media) {
      if (await env.BUCKET!.head(item.key)) continue;
      await env.BUCKET!.put(item.key, incoming.get(item.key)!.bytes, {
        httpMetadata: { contentType: item.content_type },
      });
    }

    const mediaCheck = await inspect();
    if (mediaCheck.media.some((item) => !item.matches)) {
      return Response.json({ error: "在线图片写入后校验失败" }, { status: 500 });
    }

    if (!row) {
      await env.DB!.prepare("INSERT INTO site_content (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO NOTHING")
        .bind(contentData, migration.updated_at).run();
    }
    const finalCheck = await inspect();
    if (!finalCheck.content_matches || finalCheck.media.some((item) => !item.matches)) {
      return Response.json({ error: "在线内容写入后校验失败" }, { status: 500 });
    }
    return Response.json({ ok: true, content_rows: 1, uploaded_images: finalCheck.media.length, verified_images: finalCheck.media.filter((item) => item.matches).length });
  } catch (error) {
    console.error("Migration import failed", error);
    return Response.json({ error: "迁移未完成，可安全重试；原始数据未删除" }, { status: 500 });
  }
}
