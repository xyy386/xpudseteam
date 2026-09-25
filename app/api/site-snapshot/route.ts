import { env } from "cloudflare:workers";
import { getSiteContent, type SiteContent } from "../../content";
import { isSiteOwner, sameOrigin } from "../../editor-credentials";
import { syncEnvironment } from "../../sync-environment";
import { assetKey, assetType, changedSections, encodeBase64, MAX_SNAPSHOT_ASSET_BYTES, parseSnapshot,
  referencedAssets, sha256Hex, SNAPSHOT_FORMAT, MAX_SNAPSHOT_TEXT_LENGTH, type SiteSnapshot } from "../../site-snapshot";

export const dynamic = "force-dynamic";

const BACKUP_PREFIX = "site-backups/";
const backupIdPattern = /^[0-9]{13}-[a-f0-9-]{36}$/;

class SyncError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function online(): boolean { return syncEnvironment() === "online"; }
function backupKey(id: string): string {
  if (!backupIdPattern.test(id)) throw new SyncError("备份编号无效", 400);
  return BACKUP_PREFIX + id + ".json";
}
function errorResponse(error: unknown): Response {
  const status = error instanceof SyncError ? error.status : 503;
  const message = error instanceof Error ? error.message : "同步失败";
  if (!(error instanceof SyncError)) console.error("Site snapshot operation failed", error);
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function buildSnapshot(content: SiteContent, bucket: R2Bucket): Promise<SiteSnapshot> {
  let totalBytes = 0;
  const assets: SiteSnapshot["assets"] = [];
  for (const path of referencedAssets(content)) {
    const object = await bucket.get(assetKey(path));
    if (!object) throw new SyncError("附件不存在：" + path + "。未生成快照。", 409);
    const bytes = new Uint8Array(await object.arrayBuffer());
    totalBytes += bytes.length;
    if (totalBytes > MAX_SNAPSHOT_ASSET_BYTES) throw new SyncError("引用附件超过 35 MB，无法生成快照", 413);
    assets.push({ path, type: assetType(path), size: bytes.length, sha256: await sha256Hex(bytes), base64: encodeBase64(bytes) });
  }
  return { format: SNAPSHOT_FORMAT, exportedAt: new Date().toISOString(),
    origin: online() ? "online" : "local", content, assets };
}

async function saveBackup(content: SiteContent, bucket: R2Bucket, sourceSha256 = ""): Promise<string> {
  const snapshot = await buildSnapshot(content, bucket);
  const id = Date.now() + "-" + crypto.randomUUID();
  await bucket.put(backupKey(id), JSON.stringify(snapshot), {
    httpMetadata: { contentType: "application/json" },
    ...(sourceSha256 ? { customMetadata: { sourceSha256 } } : {}),
  });
  return id;
}

async function applySnapshot(
  snapshot: SiteSnapshot, decoded: Map<string, Uint8Array>, current: SiteContent,
  expectedRevision: string, db: D1Database, bucket: R2Bucket, restoring = false,
  preparedBackupId = "", sourceSha256 = "",
): Promise<{ revision: string; backupId: string; importedAssets: number; changedSections: string[] }> {
  if (expectedRevision !== current.revision) throw new SyncError("目标内容在预检后发生变化，请重新同步", 409);
  const baseRevision = snapshot.content.syncBaseRevision ?? "";
  if (!restoring && online() && (snapshot.origin !== "local" || !baseRevision || baseRevision !== current.revision)) {
    throw new SyncError("线上内容已有更新，或本地修改没有对齐线上基准。请先同步到本地并核对。", 409);
  }
  const changes = changedSections(current, snapshot.content);
  const missing: Array<{ key: string; bytes: Uint8Array; type: string }> = [];
  for (const asset of snapshot.assets) {
    const key = assetKey(asset.path);
    const existing = await bucket.get(key);
    if (existing) {
      if (await sha256Hex(new Uint8Array(await existing.arrayBuffer())) !== asset.sha256) {
        throw new SyncError("目标附件与来源冲突：" + asset.path, 409);
      }
    } else missing.push({ key, bytes: decoded.get(asset.path)!, type: asset.type });
  }
  // The backup is durable before any content or asset is changed.
  let backupId = preparedBackupId;
  if (backupId) {
    const prepared = await bucket.get(backupKey(backupId));
    if (!prepared) throw new SyncError("预检备份不存在，请重新发起同步", 409);
    if (!sourceSha256 || prepared.customMetadata?.sourceSha256 !== sourceSha256) {
      throw new SyncError("来源内容与预检时不同，请重新发起同步", 409);
    }
    const saved = JSON.parse(await prepared.text()) as SiteSnapshot;
    if (JSON.stringify(saved.content) !== JSON.stringify(current)) {
      throw new SyncError("目标内容与预检备份不一致，请重新发起同步", 409);
    }
  } else backupId = await saveBackup(current, bucket);
  const uploaded: string[] = [];
  try {
    for (const asset of missing) {
      uploaded.push(asset.key);
      await bucket.put(asset.key, asset.bytes, { httpMetadata: { contentType: asset.type } });
    }
    const next: SiteContent = structuredClone(snapshot.content);
    next.revision = crypto.randomUUID();
    if (online()) delete next.syncBaseRevision;
    else if (snapshot.origin === "online") next.syncBaseRevision = snapshot.content.revision;
    const result = current.revision
      ? await db.prepare("UPDATE site_content SET data = ?, updated_at = ? WHERE id = 1 AND updated_at = ?")
        .bind(JSON.stringify(next), next.revision, current.revision).run()
      : await db.prepare("INSERT INTO site_content (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO NOTHING")
        .bind(JSON.stringify(next), next.revision).run();
    if (!result.meta.changes) throw new SyncError("目标内容刚被其他编辑者更新，请重新同步", 409);
    return { revision: next.revision, backupId, importedAssets: missing.length, changedSections: changes };
  } catch (error) {
    // Uploaded objects are not referenced if D1 did not commit. Remove them on failure.
    await Promise.allSettled(uploaded.map((key) => bucket.delete(key)));
    throw error;
  }
}

export async function GET(request: Request) {
  if (!(await isSiteOwner())) return Response.json({ error: "仅管理员可读取站点快照" }, { status: 403 });
  const bucket = env.BUCKET;
  if (!env.DB || !bucket) return Response.json({ error: "内容或附件存储暂不可用" }, { status: 503 });
  const url = new URL(request.url);
  try {
    if (url.searchParams.get("action") === "backups") {
      const result = await bucket.list({ prefix: BACKUP_PREFIX, limit: 1000 });
      const items = result.objects.slice(-20).reverse().map((object) => ({
        id: object.key.slice(BACKUP_PREFIX.length, -5), size: object.size, uploaded: object.uploaded,
      }));
      return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
    }
    if (url.searchParams.get("action") === "backup") {
      const id = url.searchParams.get("id") ?? "";
      const object = await bucket.get(backupKey(id));
      if (!object) throw new SyncError("备份不存在", 404);
      return new Response(object.body, { headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="site-backup-' + id + '.json"',
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      } });
    }
    if (url.searchParams.has("action")) throw new SyncError("操作无效", 400);
    const snapshot = await buildSnapshot(await getSiteContent(), bucket);
    return new Response(JSON.stringify(snapshot), { headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="site-snapshot-' + new Date().toISOString().slice(0, 10) + '.json"',
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  if (!(await isSiteOwner())) return Response.json({ error: "仅管理员可修改站点快照" }, { status: 403 });
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const db = env.DB;
  const bucket = env.BUCKET;
  if (!db || !bucket) return Response.json({ error: "内容或附件存储暂不可用" }, { status: 503 });
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  try {
    if (action === "ack") {
      if (online()) throw new SyncError("仅本地可确认线上同步", 400);
      const data = await request.json() as { expectedRevision?: unknown; onlineRevision?: unknown };
      if (typeof data.expectedRevision !== "string" || typeof data.onlineRevision !== "string"
        || !/^[a-f0-9-]{36}$/.test(data.onlineRevision)) throw new SyncError("修订信息无效", 400);
      const current = await getSiteContent();
      if (current.revision !== data.expectedRevision) throw new SyncError("本地内容在同步期间发生变化，请先核对", 409);
      const next = { ...current, syncBaseRevision: data.onlineRevision, revision: crypto.randomUUID() };
      const result = await db.prepare("UPDATE site_content SET data = ?, updated_at = ? WHERE id = 1 AND updated_at = ?")
        .bind(JSON.stringify(next), next.revision, current.revision).run();
      if (!result.meta.changes) throw new SyncError("本地内容在同步期间发生变化，请先核对", 409);
      return Response.json({ ok: true, revision: next.revision }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "restore") {
      const data = await request.json() as { backupId?: unknown };
      if (typeof data.backupId !== "string") throw new SyncError("备份编号无效", 400);
      const object = await bucket.get(backupKey(data.backupId));
      if (!object) throw new SyncError("备份不存在", 404);
      const { snapshot, decoded } = await parseSnapshot(await object.text());
      const current = await getSiteContent();
      const result = await applySnapshot(snapshot, decoded, current,
        request.headers.get("x-expected-revision") ?? "", db, bucket, true);
      return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action !== "preview" && action !== "prepare" && action !== "apply") throw new SyncError("操作无效", 400);
    if (Number(request.headers.get("content-length")) > MAX_SNAPSHOT_TEXT_LENGTH) throw new SyncError("快照文件超过 50 MB", 413);
    let parsed: Awaited<ReturnType<typeof parseSnapshot>>;
    const snapshotText = await request.text();
    try { parsed = await parseSnapshot(snapshotText); }
    catch (error) { throw new SyncError(error instanceof Error ? error.message : "快照文件校验失败", 400); }
    const { snapshot, decoded, totalBytes } = parsed;
    const current = await getSiteContent();
    const changes = changedSections(current, snapshot.content);
    const baseRevision = snapshot.content.syncBaseRevision ?? "";
    const sourceValid = !online() || (snapshot.origin === "local" && Boolean(baseRevision));
    const baselineMatches = !online() || baseRevision === current.revision;
    const canApply = sourceValid && baselineMatches;
    const details = {
      origin: snapshot.origin, sourceRevision: snapshot.content.revision, baseOnlineRevision: baseRevision,
      targetRevision: current.revision, assetCount: decoded.size, assetBytes: totalBytes,
      changedSections: changes, canApply,
      warning: !sourceValid ? "线上仅接受基于已取回线上版本的本地修改。"
        : !baselineMatches ? "线上内容已有更新，请先同步到本地并核对，不能覆盖较新的线上版本。" : "",
    };
    if (action === "preview") return Response.json(details, { headers: { "Cache-Control": "no-store" } });
    if (!canApply) throw new SyncError(details.warning, 409);
    if (action === "prepare") {
      for (const asset of snapshot.assets) {
        const existing = await bucket.get(assetKey(asset.path));
        if (existing && await sha256Hex(new Uint8Array(await existing.arrayBuffer())) !== asset.sha256) {
          throw new SyncError("目标附件与来源冲突：" + asset.path, 409);
        }
      }
      const sourceSha256 = await sha256Hex(new TextEncoder().encode(snapshotText));
      const backupId = await saveBackup(current, bucket, sourceSha256);
      return Response.json({ ...details, backupId, backupVerified: true }, { headers: { "Cache-Control": "no-store" } });
    }
    const preparedBackupId = request.headers.get("x-prepared-backup-id") ?? "";
    if (!preparedBackupId) throw new SyncError("请先完成预检和目标备份，再确认应用", 400);
    const result = await applySnapshot(snapshot, decoded, current,
      request.headers.get("x-expected-revision") ?? "", db, bucket, false,
      preparedBackupId, await sha256Hex(new TextEncoder().encode(snapshotText)));
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
