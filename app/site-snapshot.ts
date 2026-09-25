import type { SiteContent } from "./content";

export const SNAPSHOT_FORMAT = "research-site-snapshot-v1";
export const MAX_SNAPSHOT_ASSET_BYTES = 35 * 1024 * 1024;
export const MAX_SNAPSHOT_TEXT_LENGTH = 50 * 1024 * 1024;

export type SnapshotAsset = { path: string; type: string; size: number; sha256: string; base64: string };
export type SiteSnapshot = {
  format: typeof SNAPSHOT_FORMAT;
  exportedAt: string;
  origin: "local" | "online";
  content: SiteContent;
  assets: SnapshotAsset[];
};

const assetPattern = /\/api\/media\/[a-f0-9-]{36}\.(?:jpg|png|webp|gif)|\/api\/news-file\/[a-f0-9-]{36}\.(?:pdf|docx)/g;

export function referencedAssets(content: SiteContent): string[] {
  return [...new Set(JSON.stringify(content).match(assetPattern) ?? [])].sort();
}

export function assetKey(path: string): string {
  const match = /^\/api\/media\/([a-f0-9-]{36}\.(?:jpg|png|webp|gif))$|^\/api\/news-file\/([a-f0-9-]{36}\.(?:pdf|docx))$/.exec(path);
  if (!match) throw new Error(`附件路径无效：${path}`);
  return match[1] ?? match[2];
}

export function assetType(path: string): string {
  const ext = assetKey(path).split(".").pop();
  return ({ jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
    pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } as Record<string, string>)[ext ?? ""] ?? "";
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}

export function decodeBase64(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("附件编码无效");
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function matchesFileType(path: string, bytes: Uint8Array): boolean {
  if (path.endsWith(".pdf")) return String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-";
  if (path.endsWith(".docx")) return bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (path.endsWith(".png")) return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  if (path.endsWith(".jpg")) return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (path.endsWith(".gif")) return String.fromCharCode(...bytes.subarray(0, 3)) === "GIF";
  if (path.endsWith(".webp")) return String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
  return false;
}

export async function parseSnapshot(text: string): Promise<{ snapshot: SiteSnapshot; decoded: Map<string, Uint8Array>; totalBytes: number }> {
  if (text.length > MAX_SNAPSHOT_TEXT_LENGTH) throw new Error("快照文件超过 50 MB，请分批整理附件后重试");
  const snapshot = JSON.parse(text) as SiteSnapshot;
  if (snapshot?.format !== SNAPSHOT_FORMAT || !["local", "online"].includes(snapshot.origin)
    || !snapshot.content || typeof snapshot.content !== "object" || !Array.isArray(snapshot.content.archives)
    || !Array.isArray(snapshot.content.members) || !Array.isArray(snapshot.content.directions)
    || typeof snapshot.content.revision !== "string" || !Array.isArray(snapshot.assets)) throw new Error("快照格式不正确");
  if (JSON.stringify(snapshot.content).length > 750_000) throw new Error("内容数据超过站点存储限制");
  const references = referencedAssets(snapshot.content);
  if (snapshot.assets.length !== references.length) throw new Error("快照附件清单与内容引用不一致");
  const decoded = new Map<string, Uint8Array>();
  let totalBytes = 0;
  for (const asset of snapshot.assets) {
    if (!asset || !references.includes(asset.path) || decoded.has(asset.path) || asset.type !== assetType(asset.path)
      || !Number.isInteger(asset.size) || asset.size < 1 || typeof asset.base64 !== "string"
      || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error("快照中有无效附件");
    const bytes = decodeBase64(asset.base64);
    if (bytes.length !== asset.size || !matchesFileType(asset.path, bytes) || await sha256Hex(bytes) !== asset.sha256) throw new Error(`附件校验失败：${asset.path}`);
    totalBytes += bytes.length;
    if (totalBytes > MAX_SNAPSHOT_ASSET_BYTES) throw new Error("快照附件超过 35 MB，请分批整理附件后重试");
    decoded.set(asset.path, bytes);
  }
  return { snapshot, decoded, totalBytes };
}

export function changedSections(current: SiteContent, incoming: SiteContent): string[] {
  const keys = new Set([...Object.keys(current), ...Object.keys(incoming)]);
  keys.delete("revision");
  keys.delete("syncBaseRevision");
  return [...keys].filter((key) => JSON.stringify((current as unknown as Record<string, unknown>)[key]) !== JSON.stringify((incoming as unknown as Record<string, unknown>)[key])).sort();
}
