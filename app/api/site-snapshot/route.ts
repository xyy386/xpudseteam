import { env } from "cloudflare:workers";
import { getSiteContent, type SiteContent } from "../../content";
import { isSiteOwner, sameOrigin } from "../../editor-credentials";
import { syncEnvironment } from "../../sync-environment";
import { mergeSiteContent } from "../../site-sync-merge";
import { assetKey, assetType, changedSections, encodeBase64, MAX_SNAPSHOT_ASSET_BYTES, parseSnapshot,
  referencedAssets, sha256Hex, SNAPSHOT_FORMAT, MAX_SNAPSHOT_TEXT_LENGTH, type SiteSnapshot } from "../../site-snapshot";

export const dynamic = "force-dynamic";

const BACKUP_PREFIX = "site-backups/";
const BASE_PREFIX = "site-sync/bases/";
const backupIdPattern = /^[0-9]{13}-[a-f0-9-]{36}$/;
const revisionPattern = /^[a-f0-9-]{36}$/;

class SyncError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function online(): boolean { return syncEnvironment() === "online"; }
function backupKey(id: string): string {
  if (!backupIdPattern.test(id)) throw new SyncError("备份编号无效", 400);
  return BACKUP_PREFIX + id + ".json";
}
function baseKey(revision: string): string {
  if (!revisionPattern.test(revision)) throw new SyncError("线上基线修订无效，请先从线上同步到本地", 409);
  return BASE_PREFIX + revision + ".json";
}
function errorResponse(error: unknown): Response {
  const status = error instanceof SyncError ? error.status : 503;
  const message = error instanceof Error ? error.message : "同步失败";
  if (!(error instanceof SyncError)) console.error("Site snapshot operation failed", error);
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function readBase(content: SiteContent, bucket: R2Bucket): Promise<SiteContent | null> {
  if (!content.syncBaseRevision || !revisionPattern.test(content.syncBaseRevision)) return null;
  const object = await bucket.get(baseKey(content.syncBaseRevision));
  if (!object) return null;
  const base = JSON.parse(await object.text()) as SiteContent;
  if (!base || base.revision !== content.syncBaseRevision || !Array.isArray(base.archives)
    || !Array.isArray(base.members) || !Array.isArray(base.directions)) {
    throw new SyncError("本地同步基线损坏，请从线上重新同步", 409);
  }
  return base;
}

async function writeBase(content: SiteContent, bucket: R2Bucket): Promise<void> {
  const key = baseKey(content.revision);
  const data = JSON.stringify(content);
  const existing = await bucket.get(key);
  if (existing) {
    if (await existing.text() !== data) throw new SyncError("同一线上修订对应的基线内容不一致", 409);
    return;
  }
  await bucket.put(key, data, { httpMetadata: { contentType: "application/json" } });
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
  const baseContent = online() ? null : await readBase(content, bucket);
  return {
    format: SNAPSHOT_FORMAT, exportedAt: new Date().toISOString(),
    origin: online() ? "online" : "local", content,
    ...(baseContent ? { baseContent } : {}), assets,
  };
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

async function preparedBackup(id: string, sourceSha256: string, bucket: R2Bucket): Promise<SiteSnapshot> {
  const object = await bucket.get(backupKey(id));
  if (!object) throw new SyncError("预检备份不存在，请重新发起同步", 409);
  if (!sourceSha256 || object.customMetadata?.sourceSha256 !== sourceSha256) {
    throw new SyncError("来源内容与预检时不同，请重新发起同步", 409);
  }
  return JSON.parse(await object.text()) as SiteSnapshot;
}

type PlannedAsset = { path: string; key: string; bytes: Uint8Array; type: string };

async function planAssets(paths: string[], snapshot: SiteSnapshot, decoded: Map<string, Uint8Array>,
  bucket: R2Bucket): Promise<PlannedAsset[]> {
  const byPath = new Map(snapshot.assets.map((asset) => [asset.path, asset]));
  const missing: PlannedAsset[] = [];
  for (const path of paths) {
    const asset = byPath.get(path);
    const bytes = decoded.get(path);
    if (!asset || !bytes) throw new SyncError("来源快照缺少新增附件：" + path, 409);
    const key = assetKey(path);
    const existing = await bucket.get(key);
    if (existing) {
      if (await sha256Hex(new Uint8Array(await existing.arrayBuffer())) !== asset.sha256) {
        throw new SyncError("目标附件与来源冲突：" + path, 409);
      }
    } else missing.push({ path, key, bytes, type: asset.type });
  }
  return missing;
}

async function cleanupUploads(uploaded: PlannedAsset[], bucket: R2Bucket): Promise<void> {
  let inUse = new Set<string>();
  try { inUse = new Set(referencedAssets(await getSiteContent())); }
  catch { return; }
  await Promise.allSettled(uploaded.filter((asset) => !inUse.has(asset.path)).map((asset) => bucket.delete(asset.key)));
}

async function commitContent(next: SiteContent, current: SiteContent, db: D1Database): Promise<boolean> {
  const result = current.revision
    ? await db.prepare("UPDATE site_content SET data = ?, updated_at = ? WHERE id = 1 AND updated_at = ?")
      .bind(JSON.stringify(next), next.revision, current.revision).run()
    : await db.prepare("INSERT INTO site_content (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO NOTHING")
      .bind(JSON.stringify(next), next.revision).run();
  return Boolean(result.meta.changes);
}

async function applyFullSnapshot(snapshot: SiteSnapshot, decoded: Map<string, Uint8Array>,
  expectedRevision: string, db: D1Database, bucket: R2Bucket,
  preparedId = "", sourceSha256 = ""): Promise<{
    revision: string; backupId: string; importedAssets: number; changedSections: string[];
  }> {
  const current = await getSiteContent();
  if (current.revision !== expectedRevision) throw new SyncError("目标内容在预检后发生变化，请重新同步", 409);
  if (preparedId) {
    const prepared = await preparedBackup(preparedId, sourceSha256, bucket);
    if (JSON.stringify(prepared.content) !== JSON.stringify(current)) {
      throw new SyncError("目标内容与预检备份不一致，请重新发起同步", 409);
    }
  }
  const missing = await planAssets(snapshot.assets.map((asset) => asset.path), snapshot, decoded, bucket);
  const backupId = preparedId || await saveBackup(current, bucket);
  const next: SiteContent = structuredClone(snapshot.content);
  next.revision = crypto.randomUUID();
  if (online()) delete next.syncBaseRevision;
  else if (snapshot.origin === "online") {
    next.syncBaseRevision = snapshot.content.revision;
    await writeBase(snapshot.content, bucket);
  } else if (snapshot.baseContent) await writeBase(snapshot.baseContent, bucket);
  const uploaded: PlannedAsset[] = [];
  try {
    for (const asset of missing) {
      uploaded.push(asset);
      await bucket.put(asset.key, asset.bytes, { httpMetadata: { contentType: asset.type } });
    }
    if (!await commitContent(next, current, db)) throw new SyncError("目标内容刚被其他编辑者更新，请重新同步", 409);
    return { revision: next.revision, backupId, importedAssets: missing.length,
      changedSections: changedSections(current, next) };
  } catch (error) {
    await cleanupUploads(uploaded, bucket);
    throw error;
  }
}

function evaluatePatch(snapshot: SiteSnapshot, current: SiteContent): {
  merged: SiteContent; changedPaths: string[]; affectedPaths: string[]; conflicts: string[];
  newAssetPaths: string[]; changedSections: string[];
} {
  if (snapshot.origin !== "local" || !snapshot.content.syncBaseRevision) {
    throw new SyncError("请先从线上同步到本地，建立完整基线，再提交本地改动", 409);
  }
  const base = snapshot.baseContent
    ?? (snapshot.content.syncBaseRevision === current.revision ? current : null);
  if (!base) throw new SyncError("缺少上次线上内容基线；请先从线上同步到本地，再编辑后提交", 409);
  const result = mergeSiteContent(base, snapshot.content, current);
  const existing = new Set(referencedAssets(current));
  const newAssetPaths = referencedAssets(result.merged).filter((path) => !existing.has(path));
  return { ...result, newAssetPaths, changedSections: changedSections(current, result.merged) };
}

async function applyLocalPatch(snapshot: SiteSnapshot, decoded: Map<string, Uint8Array>,
  preparedId: string, sourceSha256: string, expectedRevision: string,
  db: D1Database, bucket: R2Bucket): Promise<{
    revision: string; backupId: string; importedAssets: number; changedSections: string[];
    changedPaths: string[]; affectedPaths: string[]; targetRefreshed: boolean;
  }> {
  const prepared = await preparedBackup(preparedId, sourceSha256, bucket);
  if (prepared.content.revision !== expectedRevision) throw new SyncError("审核修订与预检备份不一致", 409);
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await getSiteContent();
    const review = evaluatePatch(snapshot, current);
    if (review.conflicts.length) {
      throw new SyncError("同一位置双方都已修改：" + review.conflicts.slice(0, 8).join("、") + "。请人工核对后重试。", 409);
    }
    if (!review.affectedPaths.length) {
      return { revision: current.revision, backupId: preparedId, importedAssets: 0,
        changedSections: [], changedPaths: review.changedPaths, affectedPaths: [],
        targetRefreshed: current.revision !== prepared.content.revision };
    }
    const missing = await planAssets(review.newAssetPaths, snapshot, decoded, bucket);
    const backupId = current.revision === prepared.content.revision
      ? preparedId : await saveBackup(current, bucket, sourceSha256);
    const next = { ...review.merged, revision: crypto.randomUUID() };
    const uploaded: PlannedAsset[] = [];
    try {
      for (const asset of missing) {
        uploaded.push(asset);
        await bucket.put(asset.key, asset.bytes, { httpMetadata: { contentType: asset.type } });
      }
      if (await commitContent(next, current, db)) {
        return { revision: next.revision, backupId, importedAssets: missing.length,
          changedSections: review.changedSections, changedPaths: review.changedPaths,
          affectedPaths: review.affectedPaths, targetRefreshed: current.revision !== prepared.content.revision };
      }
    } catch (error) {
      await cleanupUploads(uploaded, bucket);
      throw error;
    }
    await cleanupUploads(uploaded, bucket);
  }
  throw new SyncError("线上在确认期间持续更新，请重新预检", 409);
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
  const action = new URL(request.url).searchParams.get("action");
  try {
    if (action === "backup-current") {
      const backupId = await saveBackup(await getSiteContent(), bucket);
      return Response.json({ ok: true, backupId }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "restore") {
      const data = await request.json() as { backupId?: unknown };
      if (typeof data.backupId !== "string") throw new SyncError("备份编号无效", 400);
      const object = await bucket.get(backupKey(data.backupId));
      if (!object) throw new SyncError("备份不存在", 404);
      const { snapshot, decoded } = await parseSnapshot(await object.text());
      const result = await applyFullSnapshot(snapshot, decoded,
        request.headers.get("x-expected-revision") ?? "", db, bucket);
      return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!["ack", "preview", "prepare", "apply"].includes(action ?? "")) throw new SyncError("操作无效", 400);
    if (Number(request.headers.get("content-length")) > MAX_SNAPSHOT_TEXT_LENGTH) throw new SyncError("快照文件超过 50 MB", 413);
    const snapshotText = await request.text();
    let parsed: Awaited<ReturnType<typeof parseSnapshot>>;
    try { parsed = await parseSnapshot(snapshotText); }
    catch (error) { throw new SyncError(error instanceof Error ? error.message : "快照文件校验失败", 400); }
    const { snapshot, decoded, totalBytes } = parsed;
    const sourceSha256 = await sha256Hex(new TextEncoder().encode(snapshotText));
    if (action === "ack") {
      if (online() || snapshot.origin !== "online") throw new SyncError("仅本地可确认线上同步", 400);
      const current = await getSiteContent();
      const expectedRevision = request.headers.get("x-expected-revision") ?? "";
      if (current.revision !== expectedRevision) throw new SyncError("本地内容在同步期间发生变化，请先核对", 409);
      const { revision: _localRevision, syncBaseRevision: localBaseRevision, ...localFields } = current;
      const { revision: onlineRevision, syncBaseRevision: _onlineBaseRevision, ...onlineFields } = snapshot.content;
      if (localBaseRevision === onlineRevision && JSON.stringify(localFields) === JSON.stringify(onlineFields)) {
        const missing = await planAssets(snapshot.assets.map((asset) => asset.path), snapshot, decoded, bucket);
        if (!missing.length) {
          await writeBase(snapshot.content, bucket);
          return Response.json({ ok: true, revision: current.revision, backupId: "",
            importedAssets: 0, changedSections: [] }, { headers: { "Cache-Control": "no-store" } });
        }
      }
      const result = await applyFullSnapshot(snapshot, decoded,
        expectedRevision, db, bucket);
      return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
    }
    const current = await getSiteContent();
    const patch = online() ? evaluatePatch(snapshot, current) : null;
    const mirror = !online() ? mergeSiteContent(current, snapshot.content, current) : null;
    const selectedAssets = patch
      ? snapshot.assets.filter((asset) => patch.newAssetPaths.includes(asset.path))
      : snapshot.assets;
    const details = {
      origin: snapshot.origin, sourceRevision: snapshot.content.revision,
      baseOnlineRevision: snapshot.content.syncBaseRevision ?? "", targetRevision: current.revision,
      changedPaths: patch?.changedPaths ?? mirror?.changedPaths ?? [],
      affectedPaths: patch?.affectedPaths ?? mirror?.affectedPaths ?? [],
      conflicts: patch?.conflicts ?? [],
      changedSections: patch?.changedSections ?? changedSections(current, snapshot.content),
      assetCount: selectedAssets.length,
      assetBytes: selectedAssets.reduce((sum, asset) => sum + asset.size, 0),
      canApply: !patch?.conflicts.length,
      warning: patch?.conflicts.length ? "同一位置双方都已修改，请先核对冲突。" : "",
    };
    if (online() === (snapshot.origin === "online")) throw new SyncError("来源环境不正确", 400);
    if (action === "preview") return Response.json(details, { headers: { "Cache-Control": "no-store" } });
    if (action === "prepare") {
      if (patch?.conflicts.length) return Response.json(details, { headers: { "Cache-Control": "no-store" } });
      await planAssets(selectedAssets.map((asset) => asset.path), snapshot, decoded, bucket);
      const backupId = await saveBackup(current, bucket, sourceSha256);
      return Response.json({ ...details, backupId, backupVerified: true }, { headers: { "Cache-Control": "no-store" } });
    }
    const preparedId = request.headers.get("x-prepared-backup-id") ?? "";
    if (!preparedId) throw new SyncError("请先完成预检和目标备份，再确认应用", 400);
    const expectedRevision = request.headers.get("x-expected-revision") ?? "";
    const result = online()
      ? await applyLocalPatch(snapshot, decoded, preparedId, sourceSha256, expectedRevision, db, bucket)
      : await applyFullSnapshot(snapshot, decoded, expectedRevision, db, bucket, preparedId, sourceSha256);
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
