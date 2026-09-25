import { env } from "cloudflare:workers";
import { getSiteContent, type SiteContent } from "../../content";
import { isSiteOwner, sameOrigin } from "../../editor-credentials";
import { assetKey, assetType, changedSections, encodeBase64, MAX_SNAPSHOT_ASSET_BYTES, parseSnapshot,
  referencedAssets, sha256Hex, SNAPSHOT_FORMAT, MAX_SNAPSHOT_TEXT_LENGTH, type SiteSnapshot } from "../../site-snapshot";

export const dynamic = "force-dynamic";

function production(): boolean { return !import.meta.env.DEV; }

export async function GET() {
  if (!(await isSiteOwner())) return Response.json({ error: "仅管理员可导出站点快照" }, { status: 403 });
  const bucket = env.BUCKET;
  if (!env.DB || !bucket) return Response.json({ error: "内容或附件存储暂不可用" }, { status: 503 });
  try {
    const content = await getSiteContent();
    let totalBytes = 0;
    const assets: SiteSnapshot["assets"] = [];
    for (const path of referencedAssets(content)) {
      const object = await bucket.get(assetKey(path));
      if (!object) return Response.json({ error: `附件不存在：${path}。快照未生成。` }, { status: 409 });
      const bytes = new Uint8Array(await object.arrayBuffer());
      totalBytes += bytes.length;
      if (totalBytes > MAX_SNAPSHOT_ASSET_BYTES) return Response.json({ error: "引用附件超过 35 MB，无法生成单文件快照" }, { status: 413 });
      assets.push({ path, type: assetType(path), size: bytes.length, sha256: await sha256Hex(bytes), base64: encodeBase64(bytes) });
    }
    const snapshot: SiteSnapshot = { format: SNAPSHOT_FORMAT, exportedAt: new Date().toISOString(), origin: production() ? "online" : "local", content, assets };
    return new Response(JSON.stringify(snapshot), { headers: {
      "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="site-snapshot-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    console.error("Export site snapshot failed", error);
    return Response.json({ error: "导出失败，请稍后重试" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!(await isSiteOwner())) return Response.json({ error: "仅管理员可导入站点快照" }, { status: 403 });
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const db = env.DB;
  const bucket = env.BUCKET;
  if (!db || !bucket) return Response.json({ error: "内容或附件存储暂不可用" }, { status: 503 });
  const action = new URL(request.url).searchParams.get("action");
  if (action !== "preview" && action !== "apply") return Response.json({ error: "操作无效" }, { status: 400 });
  if (Number(request.headers.get("content-length")) > MAX_SNAPSHOT_TEXT_LENGTH) return Response.json({ error: "快照文件超过 50 MB" }, { status: 413 });
  try {
    const { snapshot, decoded, totalBytes } = await parseSnapshot(await request.text());
    const current = await getSiteContent();
    const changes = changedSections(current, snapshot.content);
    const baseRevision = snapshot.content.syncBaseRevision ?? "";
    const sourceValid = !production() || (snapshot.origin === "local" && Boolean(baseRevision));
    const baselineMatches = !production() || baseRevision === current.revision;
    const canApply = sourceValid && baselineMatches;
    const details = {
      origin: snapshot.origin, sourceRevision: snapshot.content.revision, baseOnlineRevision: baseRevision,
      targetRevision: current.revision, assetCount: decoded.size, assetBytes: totalBytes,
      changedSections: changes, canApply,
      warning: !sourceValid ? "线上仅接受基于已取回线上版本的本地修改包。请先从线上取回快照。"
        : !baselineMatches ? "线上内容已有更新。请先重新取回并合并，不能覆盖较新的线上版本。" : "",
    };
    if (action === "preview") return Response.json(details, { headers: { "Cache-Control": "no-store" } });
    if (!canApply) return Response.json({ error: details.warning, ...details }, { status: 409 });
    if (request.headers.get("x-expected-revision") !== current.revision) {
      return Response.json({ error: "目标内容在预检后发生变化，请重新预检", currentRevision: current.revision }, { status: 409 });
    }
    // Check every existing key before writing anything. A key with different bytes is a conflict.
    const missing: Array<{ key: string; bytes: Uint8Array; type: string }> = [];
    for (const asset of snapshot.assets) {
      const key = assetKey(asset.path);
      const existing = await bucket.get(key);
      if (existing) {
        if (await sha256Hex(new Uint8Array(await existing.arrayBuffer())) !== asset.sha256) {
          return Response.json({ error: `目标附件与快照冲突：${asset.path}` }, { status: 409 });
        }
      } else missing.push({ key, bytes: decoded.get(asset.path)!, type: asset.type });
    }
    for (const asset of missing) await bucket.put(asset.key, asset.bytes, { httpMetadata: { contentType: asset.type } });
    const next: SiteContent = structuredClone(snapshot.content);
    next.revision = crypto.randomUUID();
    if (production()) delete next.syncBaseRevision;
    else if (snapshot.origin === "online") next.syncBaseRevision = snapshot.content.revision;
    const result = current.revision
      ? await db.prepare("UPDATE site_content SET data = ?, updated_at = ? WHERE id = 1 AND updated_at = ?")
        .bind(JSON.stringify(next), next.revision, current.revision).run()
      : await db.prepare("INSERT INTO site_content (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO NOTHING")
        .bind(JSON.stringify(next), next.revision).run();
    if (!result.meta.changes) return Response.json({ error: "目标内容刚被更新，请重新预检" }, { status: 409 });
    return Response.json({ ok: true, revision: next.revision, importedAssets: missing.length, changedSections: changes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "快照无法读取";
    return Response.json({ error: message }, { status: 400 });
  }
}
