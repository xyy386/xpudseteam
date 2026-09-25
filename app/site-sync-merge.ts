import type { SiteContent } from "./content";

const absent = Symbol("absent");
type Node = unknown | typeof absent;
type RecordNode = Record<string, unknown>;

function object(value: Node): value is RecordNode {
  return value !== absent && value !== null && typeof value === "object" && !Array.isArray(value);
}

function same(left: Node, right: Node): boolean {
  if (left === absent || right === absent) return left === right;
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => same(value, right[index]));
  }
  if (object(left) && object(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].every((key) => same(
      Object.hasOwn(left, key) ? left[key] : absent,
      Object.hasOwn(right, key) ? right[key] : absent,
    ));
  }
  return false;
}

function stableKey(arrays: unknown[][]): "id" | "slug" | "name" | null {
  for (const field of ["id", "slug", "name"] as const) {
    if (arrays.every((items) => {
      const keys = items.map((item) => object(item) ? item[field] : undefined);
      return keys.every((key) => typeof key === "string" && key.trim().length > 0)
        && new Set(keys).size === keys.length;
    })) return field;
  }
  return null;
}

function segment(path: string, key: string): string { return path ? `${path}.${key}` : key; }
function itemSegment(path: string, key: string): string { return `${path}[${key}]`; }
function appendPath(paths: Set<string>, path: string): void { paths.add(path || "网站内容"); }

function diffPaths(base: Node, next: Node, path: string, paths: Set<string>): void {
  if (same(base, next)) return;
  if (object(base) && object(next)) {
    for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
      diffPaths(Object.hasOwn(base, key) ? base[key] : absent,
        Object.hasOwn(next, key) ? next[key] : absent, segment(path, key), paths);
    }
    return;
  }
  if (Array.isArray(base) && Array.isArray(next)) {
    const key = stableKey([base, next]);
    if (key) {
      const before = new Map(base.map((item) => [(item as RecordNode)[key] as string, item]));
      const after = new Map(next.map((item) => [(item as RecordNode)[key] as string, item]));
      for (const id of new Set([...before.keys(), ...after.keys()])) {
        diffPaths(before.has(id) ? before.get(id) : absent, after.has(id) ? after.get(id) : absent, itemSegment(path, id), paths);
      }
      const commonBefore = [...before.keys()].filter((id) => after.has(id));
      const commonAfter = [...after.keys()].filter((id) => before.has(id));
      if (!same(commonBefore, commonAfter)) appendPath(paths, `${path}.顺序`);
      return;
    }
  }
  appendPath(paths, path);
}

function mergeNode(base: Node, local: Node, remote: Node, path: string, conflicts: Set<string>): Node {
  if (same(base, local)) return remote;
  if (same(local, remote)) return remote;
  if (base === absent && local !== absent && remote !== absent) {
    appendPath(conflicts, path);
    return remote;
  }
  if (object(base) && object(local) && object(remote)) {
    const merged: RecordNode = Object.create(null) as RecordNode;
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
      const value = mergeNode(Object.hasOwn(base, key) ? base[key] : absent,
        Object.hasOwn(local, key) ? local[key] : absent,
        Object.hasOwn(remote, key) ? remote[key] : absent, segment(path, key), conflicts);
      if (value !== absent) merged[key] = value;
    }
    return merged;
  }
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    const key = stableKey([base, local, remote]);
    if (key) {
      const before = new Map(base.map((item) => [(item as RecordNode)[key] as string, item]));
      const ours = new Map(local.map((item) => [(item as RecordNode)[key] as string, item]));
      const theirs = new Map(remote.map((item) => [(item as RecordNode)[key] as string, item]));
      const localCommon = [...ours.keys()].filter((id) => before.has(id));
      const baseInLocal = [...before.keys()].filter((id) => ours.has(id));
      const remoteCommon = [...theirs.keys()].filter((id) => before.has(id));
      const baseInRemote = [...before.keys()].filter((id) => theirs.has(id));
      const localReordered = !same(localCommon, baseInLocal);
      const remoteReordered = !same(remoteCommon, baseInRemote);
      if (localReordered && remoteReordered && !same(localCommon, remoteCommon)) appendPath(conflicts, `${path}.顺序`);
      const order = localReordered && !remoteReordered
        ? [...ours.keys(), ...theirs.keys().filter((id) => !ours.has(id))]
        : [...theirs.keys(), ...ours.keys().filter((id) => !theirs.has(id))];
      const merged: unknown[] = [];
      for (const id of order) {
        const value = mergeNode(before.has(id) ? before.get(id) : absent,
          ours.has(id) ? ours.get(id) : absent, theirs.has(id) ? theirs.get(id) : absent,
          itemSegment(path, id), conflicts);
        if (value !== absent) merged.push(value);
      }
      return merged;
    }
  }
  if (same(base, remote)) return local;
  appendPath(conflicts, path);
  return remote;
}

function contentFields(content: SiteContent): RecordNode {
  const { revision: _revision, syncBaseRevision: _syncBaseRevision, ...fields } = content;
  return fields;
}

export function mergeSiteContent(base: SiteContent, local: SiteContent, remote: SiteContent): {
  merged: SiteContent; changedPaths: string[]; affectedPaths: string[]; conflicts: string[];
} {
  const before = contentFields(base);
  const ours = contentFields(local);
  const theirs = contentFields(remote);
  const changedPaths = new Set<string>();
  diffPaths(before, ours, "", changedPaths);
  const conflicts = new Set<string>();
  const mergedFields = mergeNode(before, ours, theirs, "", conflicts) as RecordNode;
  const affectedPaths = new Set<string>();
  diffPaths(theirs, mergedFields, "", affectedPaths);
  return {
    merged: { ...mergedFields, revision: remote.revision } as SiteContent,
    changedPaths: [...changedPaths].sort(),
    affectedPaths: [...affectedPaths].sort(),
    conflicts: [...conflicts].sort(),
  };
}
