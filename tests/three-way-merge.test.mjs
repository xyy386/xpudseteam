import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSiteContent } from "../app/edit/three-way-merge.ts";

const base = {
  revision: "a",
  hero: { title: "原标题", detail: "原说明" },
  archives: [{ slug: "events", newsArticles: [{ id: "post-1", title: "旧题", summary: "旧摘要" }] }],
};

test("merges distinct fields within one article and keeps the latest revision", () => {
  const mine = structuredClone(base);
  mine.archives[0].newsArticles[0].title = "我改的标题";
  const theirs = structuredClone(base);
  theirs.revision = "b";
  theirs.archives[0].newsArticles[0].summary = "他改的摘要";
  const result = mergeSiteContent(base, mine, theirs);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.merged.archives[0].newsArticles[0].title, "我改的标题");
  assert.equal(result.merged.archives[0].newsArticles[0].summary, "他改的摘要");
  assert.equal(result.merged.revision, "b");
});

test("same field conflicts offer an explicit choice", () => {
  const mine = structuredClone(base);
  mine.hero.title = "我的标题";
  const theirs = structuredClone(base);
  theirs.revision = "b";
  theirs.hero.title = "线上标题";
  const first = mergeSiteContent(base, mine, theirs);
  assert.deepEqual(first.conflicts.map((item) => item.path), ["hero.title"]);
  assert.equal(first.merged.hero.title, "我的标题");
  assert.equal(mergeSiteContent(base, mine, theirs, { "hero.title": "theirs" }).merged.hero.title, "线上标题");
});

test("deletion and reorder are structural conflicts when the other editor also changed the list", () => {
  const mine = structuredClone(base);
  mine.archives[0].newsArticles = [];
  const theirs = structuredClone(base);
  theirs.revision = "b";
  theirs.archives[0].newsArticles[0].title = "新题";
  assert.deepEqual(mergeSiteContent(base, mine, theirs).conflicts.map((item) => item.path), ["archives[0].newsArticles"]);

  const expanded = structuredClone(base);
  expanded.archives[0].newsArticles.push({ id: "post-2", title: "新文章", summary: "" });
  const reordered = structuredClone(expanded);
  reordered.archives[0].newsArticles.reverse();
  const changed = structuredClone(expanded);
  changed.archives[0].newsArticles[0].summary = "更新";
  assert.deepEqual(mergeSiteContent(expanded, reordered, changed).conflicts.map((item) => item.path), ["archives[0].newsArticles"]);
});

test("a second remote save can be merged after the first conflict resolution", () => {
  const mine = structuredClone(base); mine.hero.title = "我的标题";
  const theirs = structuredClone(base); theirs.revision = "b"; theirs.hero.title = "线上标题";
  const resolved = mergeSiteContent(base, mine, theirs, { "hero.title": "mine" }).merged;
  const newer = structuredClone(theirs); newer.revision = "c"; newer.hero.detail = "后来的说明";
  const second = mergeSiteContent(theirs, resolved, newer);
  assert.equal(second.conflicts.length, 0);
  assert.equal(second.merged.hero.title, "我的标题");
  assert.equal(second.merged.hero.detail, "后来的说明");
  assert.equal(second.merged.revision, "c");
});
