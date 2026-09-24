import type { SiteContent } from "../content";

export type MergeConflict = { path: string; mine: unknown; theirs: unknown };
export type ConflictChoices = Record<string, "mine" | "theirs">;

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function arrayKey(value: unknown): string | null {
  if (!record(value)) return null;
  if (typeof value.id === "string") return `id:${value.id}`;
  if (typeof value.slug === "string") return `slug:${value.slug}`;
  return null;
}

function canMergeArray(base: unknown[], mine: unknown[], theirs: unknown[]): boolean {
  if (base.length !== mine.length || base.length !== theirs.length) return false;
  const keys = base.map(arrayKey);
  if (keys.every((key) => key !== null)) {
    return mine.every((item, index) => arrayKey(item) === keys[index]) && theirs.every((item, index) => arrayKey(item) === keys[index]);
  }
  // Unkeyed arrays can still merge field edits at the same index, but a
  // detectable reorder must be reviewed as one structural conflict.
  const reordered = (items: unknown[]) => items.some((item, index) => !same(item, base[index]) && base.some((original, other) => other !== index && same(item, original)));
  return !reordered(mine) && !reordered(theirs);
}

export function mergeSiteContent(base: SiteContent, mine: SiteContent, theirs: SiteContent, choices: ConflictChoices = {}) {
  const conflicts: MergeConflict[] = [];

  function choose(path: string, mineValue: unknown, theirValue: unknown): unknown {
    conflicts.push({ path, mine: mineValue, theirs: theirValue });
    return choices[path] === "theirs" ? theirValue : mineValue;
  }

  function merge(baseValue: unknown, mineValue: unknown, theirValue: unknown, path: string): unknown {
    if (same(mineValue, theirValue)) return mineValue;
    if (same(mineValue, baseValue)) return theirValue;
    if (same(theirValue, baseValue)) return mineValue;
    if (Array.isArray(baseValue) && Array.isArray(mineValue) && Array.isArray(theirValue)) {
      if (!canMergeArray(baseValue, mineValue, theirValue)) return choose(path, mineValue, theirValue);
      return baseValue.map((item, index) => merge(item, mineValue[index], theirValue[index], `${path}[${index}]`));
    }
    if (record(baseValue) && record(mineValue) && record(theirValue)) {
      const result: Record<string, unknown> = {};
      for (const key of new Set([...Object.keys(baseValue), ...Object.keys(mineValue), ...Object.keys(theirValue)])) {
        const nextPath = path ? `${path}.${key}` : key;
        const value = merge(baseValue[key], mineValue[key], theirValue[key], nextPath);
        if (value !== undefined) result[key] = value;
      }
      return result;
    }
    return choose(path, mineValue, theirValue);
  }

  const merged = merge(base, mine, theirs, "") as SiteContent;
  merged.revision = theirs.revision;
  return { merged, conflicts };
}

export function conflictPreview(value: unknown): string {
  if (typeof value === "string") return value.length > 180 ? `${value.slice(0, 180)}…` : value || "（空）";
  if (Array.isArray(value)) return `列表，共 ${value.length} 项（含删除或排序变动）`;
  if (value === undefined || value === null) return "（已删除）";
  return JSON.stringify(value).slice(0, 180);
}
