import { env } from "cloudflare:workers";
import { isSiteEditor } from "../../editor-auth";

export const dynamic = "force-dynamic";

const allowedTypes: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
};

export async function POST(request: Request) {
  if (!(await isSiteEditor())) return Response.json({ error: "没有编辑权限" }, { status: 403 });
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "请求来源无效" }, { status: 403 });
  }
  if (!env.BUCKET) return Response.json({ error: "图片存储尚未就绪" }, { status: 503 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !allowedTypes[file.type] || file.size > 8 * 1024 * 1024 || file.size === 0) {
      return Response.json({ error: "请选择 8 MB 以内的 JPG、PNG、WebP 或 GIF 图片" }, { status: 400 });
    }
    const key = `${crypto.randomUUID()}.${allowedTypes[file.type]}`;
    await env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
    return Response.json({ url: `/api/media/${key}` });
  } catch (error) {
    console.error("Upload media failed", error);
    return Response.json({ error: "图片上传失败，请重试" }, { status: 500 });
  }
}
