import { env } from "cloudflare:workers";
import { isSiteEditor } from "../../editor-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isSiteEditor())) return Response.json({ error: "没有编辑权限" }, { status: 403 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!env.BUCKET) return Response.json({ error: "文件存储尚未就绪" }, { status: 503 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > 20 * 1024 * 1024) return Response.json({ error: "请选择 20 MB 以内的 DOCX 或 PDF 文件" }, { status: 400 });
    const extension = file.name.toLowerCase().split(".").pop();
    if (extension === "doc") return Response.json({ error: "旧版 .doc 文件请先转换为 .docx 再导入" }, { status: 400 });
    if (extension !== "docx" && extension !== "pdf") return Response.json({ error: "仅支持 .docx 和 .pdf 文件" }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const valid = extension === "pdf" ? String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-" : bytes[0] === 0x50 && bytes[1] === 0x4b;
    if (!valid) return Response.json({ error: "文件内容与扩展名不符" }, { status: 400 });
    const key = `${crypto.randomUUID()}.${extension}`;
    const contentType = extension === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    await env.BUCKET.put(key, bytes, { httpMetadata: { contentType } });
    return Response.json({ url: `/api/news-file/${key}`, name: file.name });
  } catch (error) {
    console.error("Upload news attachment failed", error);
    return Response.json({ error: "附件上传失败，请重试" }, { status: 500 });
  }
}
