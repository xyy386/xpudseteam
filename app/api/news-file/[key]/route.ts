import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  if (!env.BUCKET) return new Response("Not available", { status: 503 });
  const { key } = await params;
  if (!/^[a-f0-9-]{36}\.(docx|pdf)$/.test(key)) return new Response("Not found", { status: 404 });
  const object = await env.BUCKET.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const name = new URL(request.url).searchParams.get("name")?.replace(/[\\/\r\n]/g, "").slice(0, 150) || key;
  const inline = key.endsWith(".pdf") && new URL(request.url).searchParams.get("preview") === "1";
  return new Response(object.body, { headers: {
    "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=3600",
  } });
}
