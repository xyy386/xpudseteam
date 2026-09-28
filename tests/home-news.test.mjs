import assert from "node:assert/strict";
import test from "node:test";
import { isPublishedArticle, selectHomeNews } from "../app/home-news.ts";

function article(id, overrides = {}) {
  return {
    id, title: `动态 ${id}`, date: "2026-09-28", summary: "", body: "", thumbnail: "",
    images: [], attachment: "", attachmentName: "", source: "", importWarnings: [],
    status: "published", externalUrl: "", ...overrides,
  };
}

function archive(slug, newsArticles = [], overrides = {}) {
  return {
    slug, group: "团队动态", homeAnchor: "news", title: slug, english: "",
    description: "", summary: "", cover: "", gallery: [], columns: [], rows: [],
    subsections: [], newsArticles, ...overrides,
  };
}

function freezeDeep(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") freezeDeep(child);
  }
  return Object.freeze(value);
}

test("无动态时不使用栏目标题或介绍冒充新闻", () => {
  assert.deepEqual(selectHomeNews([]), []);
  assert.deepEqual(selectHomeNews([
    archive("events", [], { title: "团队活动", summary: "栏目介绍" }),
    archive("publications", [article("paper")], { homeAnchor: "outcomes" }),
  ]), []);
});

test("单条动态返回文章链接与原始编辑位置", () => {
  const result = selectHomeNews([
    archive("publications", [], { homeAnchor: "outcomes" }),
    archive("updates", [article("one", { title: "一条新动态" })]),
  ]);
  assert.deepEqual(result, [{
    title: "一条新动态", date: "2026-09-28", href: "/archive/updates/one",
    archiveIndex: 1, articleIndex: 0,
  }]);
});

test("跨动态栏目合并后按日期倒序取最近五条", () => {
  const result = selectHomeNews([
    archive("events", [
      article("e-old", { date: "2025-12-31" }),
      article("old-feature", { date: "2026-09-27" }),
      article("e-new", { date: "2026-09-28" }),
    ]),
    archive("publications", [article("excluded", { date: "2027-01-01" })], { homeAnchor: "outcomes" }),
    archive("updates", [
      article("u-early", { date: "2026-09-24" }),
      article("u-middle", { date: "2026-09-26" }),
      article("u-late", { date: "2026-09-29" }),
      article("u-old", { date: "2026-01-01" }),
    ]),
  ]);
  assert.deepEqual(result.map(({ href }) => href), [
    "/archive/updates/u-late", "/archive/events/e-new", "/archive/events/old-feature",
    "/archive/updates/u-middle", "/archive/updates/u-early",
  ]);
  assert.deepEqual(result.map(({ archiveIndex, articleIndex }) => [archiveIndex, articleIndex]), [
    [2, 2], [0, 2], [0, 1], [2, 1], [2, 0],
  ]);
});

test("草稿不发布且无 status 的旧文章继续发布", () => {
  const legacy = article("legacy");
  delete legacy.status;
  assert.equal(isPublishedArticle(article("draft", { status: "draft" })), false);
  assert.equal(isPublishedArticle(article("published")), true);
  assert.equal(isPublishedArticle(legacy), true);
  const result = selectHomeNews([archive("updates", [
    article("draft", { status: "draft", date: "2026-12-31" }),
    legacy,
    article("published", { date: "2026-09-27" }),
  ])]);
  assert.deepEqual(result.map(({ href }) => href), ["/archive/updates/legacy", "/archive/updates/published"]);
  assert.deepEqual(result.map(({ articleIndex }) => articleIndex), [1, 2]);
  assert.deepEqual(selectHomeNews([archive("drafts", [article("draft", { status: "draft" })])]), []);
});

test("缺失及空日期排在有日期新闻之后并保留原始相对顺序", () => {
  const undated = article("missing-date");
  delete undated.date;
  const result = selectHomeNews([archive("updates", [
    article("empty-date", { date: "" }),
    article("dated", { date: "2026-01-01" }),
    undated,
  ])]);
  assert.deepEqual(result.map(({ href, date }) => ({ href, date })), [
    { href: "/archive/updates/dated", date: "2026-01-01" },
    { href: "/archive/updates/empty-date", date: "" },
    { href: "/archive/updates/missing-date", date: "" },
  ]);
});

test("相同日期维持栏目及文章原始顺序", () => {
  const result = selectHomeNews([
    archive("events", [article("first"), article("second")]),
    archive("updates", [article("third"), article("fourth")]),
  ]);
  assert.deepEqual(result.map(({ href }) => href), [
    "/archive/events/first", "/archive/events/second", "/archive/updates/third", "/archive/updates/fourth",
  ]);
});

test("不同栏目中的重复文章 ID 各自保留正确链接", () => {
  const result = selectHomeNews([
    archive("events", [article("same-id", { title: "活动新闻" })]),
    archive("updates", [article("same-id", { title: "研究新闻" })]),
  ]);
  assert.deepEqual(result.map(({ title, href }) => ({ title, href })), [
    { title: "活动新闻", href: "/archive/events/same-id" },
    { title: "研究新闻", href: "/archive/updates/same-id" },
  ]);
});

test("空标题提供可点击文本而长标题不被数据层截断", () => {
  const longTitle = "这是需要在窄屏完整显示的较长学术交流动态标题".repeat(5);
  const result = selectHomeNews([archive("updates", [
    article("untitled", { title: "" }),
    article("long-title", { title: longTitle }),
  ])]);
  assert.equal(result[0].title, "未命名动态");
  assert.equal(result[1].title, longTitle);
});

test("排序及筛选不改变来源数据、文章顺序或已保存字段", () => {
  const archives = [archive("events", [
    article("older", { date: "2026-01-01", body: "保留正文", thumbnail: "/saved.jpg" }),
    article("draft", { date: "2026-12-31", status: "draft" }),
    article("newer", { date: "2026-09-28" }),
  ], { summary: "保留栏目介绍" })];
  const before = structuredClone(archives);
  freezeDeep(archives);
  const result = selectHomeNews(archives);
  assert.deepEqual(result.map(({ href }) => href), ["/archive/events/newer", "/archive/events/older"]);
  assert.deepEqual(archives, before);
});
