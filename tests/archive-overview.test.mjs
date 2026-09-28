import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import test, { after } from "node:test";
import { build } from "esbuild";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = resolve(import.meta.dirname, "..");
await mkdir(join(root, ".sites-runtime"), { recursive: true });
const temp = await mkdtemp(join(root, ".sites-runtime", "archive-test-"));
await build({
  stdin: {
    contents: 'export { ArchiveOverview } from "./app/archive-overview"; export { SiteHeader } from "./app/site-shell"; export { LivePreview } from "./app/edit/live-preview";',
    resolveDir: root, loader: "ts",
  },
  outfile: join(temp, "components.cjs"), bundle: true, format: "cjs", platform: "node",
  packages: "external", loader: { ".css": "empty" }, jsx: "automatic", logLevel: "error",
});
const { ArchiveOverview, SiteHeader, LivePreview } = createRequire(import.meta.url)(join(temp, "components.cjs"));
after(() => rm(temp, { recursive: true, force: true }));
const saved = JSON.parse(await readFile(join(root, "app/saved-content.json"), "utf8"));
function archive(slug, kind = "outcomes", overrides = {}) {
  return { slug, group: kind, homeAnchor: kind, title: `测试栏目 ${slug}`, english: "ENGLISH_MARKER", description: "", summary: "", cover: "", gallery: [], columns: [], rows: [], subsections: [], newsArticles: [], ...overrides };
}
function article(id, overrides = {}) {
  return { id, title: `文章标题 ${id}`, date: "2026-09-28", summary: `文章摘要 ${id}`, body: `文章正文 ${id}`, thumbnail: "", images: [], attachment: "", attachmentName: "", source: "", importWarnings: [], status: "published", externalUrl: "", ...overrides };
}
function content(archives = []) {
  return { ...structuredClone(saved), archives, sectionIntros: { ...saved.sectionIntros, outcomes: "", news: "", other: "" } };
}
function render(archives, kind = "outcomes", props = {}) {
  return renderToStaticMarkup(h(ArchiveOverview, { content: content(archives), kind, ...props }));
}
function headings(html) {
  return [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((match) => match[1].replace(/<[^>]+>/g, ""));
}
function summaries(html) {
  return [...html.matchAll(/<p class="[^"]*education-summary[^"]*">(.*?)<\/p>/g)].map((match) => match[1]);
}
function preview(archives, kind, mobile = false, props = {}) {
  return renderToStaticMarkup(h(LivePreview, {
    content: content(archives), view: kind, activeItemIndex: null, focusPath: "", mobile,
    educationDetailId: null, educationActiveId: null,
    onOpenEducation() {}, onBackEducation() {}, onViewChange() {}, onEdit() {}, onEditSubsection() {}, onAddCustomSection() { return "unused"; }, onModeChange() {},
    ...props,
  }));
}
function freezeDeep(value) {
  for (const child of Object.values(value)) if (child && typeof child === "object") freezeDeep(child);
  return Object.freeze(value);
}

test("三类零栏目状态不生成假栏目、图片或宣传占位", () => {
  for (const kind of ["outcomes", "news", "other"]) {
    const html = render([], kind);
    assert.match(html, /archive-overview/);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.deepEqual(headings(html), []);
    assert.doesNotMatch(html, /archive-overview-item|<img|图片待上传|ENGLISH_MARKER|<table/);
  }
});

test("单栏目标题和更多使用相同详情链接，空内容给出简短状态", () => {
  const html = render([archive("only")]);
  assert.deepEqual(headings(html), ["测试栏目 only"]);
  assert.equal((html.match(/href="\/archive\/only"/g) || []).length, 2);
  assert.match(html, /id="archive-only"/);
  assert.deepEqual(summaries(html), ["内容待补充。"]);
});

test("奇数及多栏目按保存顺序展示全部当前归属内容", () => {
  const source = [archive("a"), archive("news-only", "news"), archive("b"), archive("other-only", "other"), archive("c")];
  assert.deepEqual(headings(render(source)), ["测试栏目 a", "测试栏目 b", "测试栏目 c"]);
  const many = Array.from({ length: 9 }, (_, index) => archive(`item-${index}`));
  assert.deepEqual(headings(render(many)), many.map((item) => item.title));
  assert.deepEqual(headings(render(source, "news")), ["测试栏目 news-only"]);
  assert.deepEqual(headings(render(source, "other")), ["测试栏目 other-only"]);
});

test("新增删除排序和归属变更均由当前数据决定，不补回已删内容", () => {
  const source = [archive("a"), archive("b"), archive("c")];
  const moved = { ...source[1], homeAnchor: "news" };
  const next = [source[2], archive("new"), moved];
  assert.deepEqual(headings(render(next)), ["测试栏目 c", "测试栏目 new"]);
  assert.deepEqual(headings(render(next, "news")), ["测试栏目 b"]);
  assert.doesNotMatch(render(next), /测试栏目 a/);
});

test("优先摘取 summary 中的可读文字，无可读摘要时回退 description", () => {
  const html = render([
    archive("summary", "outcomes", { summary: "**优先摘要** [链接文字](/team)", description: "不应重复的介绍" }),
    archive("fallback", "outcomes", { summary: "![仅图片](/campus-arch.jpeg)", description: "**备用介绍**" }),
    archive("table-fallback", "outcomes", { summary: "| 甲 | 乙 |\n| --- | --- |\n| 1 | 2 |", description: "表格摘要的备用介绍" }),
  ]);
  assert.deepEqual(summaries(html), ["优先摘要 链接文字", "备用介绍", "表格摘要的备用介绍"]);
  assert.doesNotMatch(html, /不应重复的介绍|<img|<table|<strong>|href="\/team"/);
});

test("摘要去除 Markdown 并按120个Unicode字符截断，不输出完整富内容", () => {
  const longText = "测试😀内容".repeat(50);
  const html = render([archive("long", "outcomes", { summary: `**开头** ${longText}\n\n\`\`\`js\ncodeOnlyMarker()\n\`\`\``, cover: "/campus-arch.jpeg", gallery: [{ label: "图集独有标记", image: "/research-lorenz.png", caption: "图集说明独有标记" }], columns: ["表格独有标记"], rows: [["真实表格正文独有标记"]] })]);
  const [summary] = summaries(html);
  assert.equal(Array.from(summary).length, 120);
  assert.ok(summary.endsWith("…"));
  assert.ok(!summary.includes("\ufffd"));
  assert.doesNotMatch(html, /<img|<table|<pre|<code|<strong>|图集独有标记|图集说明独有标记|表格独有标记|真实表格正文独有标记|codeOnlyMarker|ENGLISH_MARKER/);
});

test("预设表头、空行、只有label的图集、空子栏目和草稿新闻不算真实资料", () => {
  const html = render([archive("empty-placeholder", "outcomes", {
    columns: ["标题", "内容", "链接"], rows: [["", " ", "\n"]],
    gallery: [{ label: "新图片", image: "", caption: " " }],
    subsections: [{ id: "empty-child", title: "新子栏目", body: " ", image: "", url: "", items: [{ title: "", description: "", image: "", url: "" }] }],
    newsArticles: [article("draft-secret", { status: "draft" })],
  })]);
  assert.deepEqual(summaries(html), ["内容待补充。"]);
  assert.doesNotMatch(html, /draft-secret|新子栏目|新图片/);
});

test("真实封面、图集、表格及子栏目资料显示查看完整内容而不直接展开", () => {
  const cases = [
    { cover: "/campus-arch.jpeg" },
    { gallery: [{ label: "图集", image: "/research-lorenz.png", caption: "" }] },
    { gallery: [{ label: "图集", image: "", caption: "已填写说明" }] },
    { columns: ["资料"], rows: [["已填写资料"]] },
    { subsections: [{ id: "child", title: "子栏目", body: "已填写内容", image: "", url: "", items: [] }] },
    { subsections: [{ id: "child", title: "子栏目", body: "", image: "/research-lorenz.png", url: "", items: [] }] },
    { subsections: [{ id: "child", title: "子栏目", body: "", image: "", url: "", items: [{ title: "已填写纯文字条目", description: "", image: "", url: "" }] }] },
  ];
  for (const value of cases) {
    const html = render([archive("rich", "outcomes", value)]);
    assert.deepEqual(summaries(html), ["查看完整内容。"]);
    assert.doesNotMatch(html, /<img|<table|已填写资料|已填写说明|已填写内容/);
  }
});

test("仅有已发布新闻时显示完整内容入口，概览不抽取文章标题摘要或正文", () => {
  const legacy = article("legacy-marker");
  delete legacy.status;
  for (const value of [article("published-marker"), legacy]) {
    const html = render([archive("events", "news", { newsArticles: [article("draft-secret", { status: "draft" }), value] })], "news");
    assert.deepEqual(summaries(html), ["查看完整内容。"]);
    assert.doesNotMatch(html, /draft-secret|published-marker|legacy-marker|文章标题|文章摘要|文章正文/);
  }
});

test("仅图片、表格或代码的摘要和正文保留完整内容入口", () => {
  for (const value of ["![测试图](/campus-arch.jpeg)", "| 甲 | 乙 |\n| --- | --- |\n| 1 | 2 |", "```js\nexample()\n```"] ) {
    assert.deepEqual(summaries(render([archive("rich-summary", "outcomes", { summary: value })])), ["查看完整内容。"]);
    assert.deepEqual(summaries(render([archive("rich-description", "outcomes", { description: value })])), ["查看完整内容。"]);
  }
});

test("标题修改及重新排序不改变编码后的slug链接", () => {
  const slug = "资料 甲/乙?#";
  const item = archive(slug, "outcomes", { title: "原名称" });
  const encoded = encodeURIComponent(slug);
  for (const html of [render([item]), render([archive("extra"), { ...item, title: "修改后的名称" }])]) {
    assert.equal((html.match(new RegExp(`href="/archive/${encoded}"`, "g")) || []).length, 2);
  }
});

test("编辑模式通过回调按钮进入详情，并按activeSlug高亮正确项目", () => {
  const html = render([archive("a"), archive("b")], "outcomes", { activeSlug: "b", onOpen() {} });
  assert.doesNotMatch(html, /href="\/archive\//);
  assert.equal((html.match(/<button\b/g) || []).length, 4);
  assert.match(html, /class="[^"]*archive-overview-item[^"]*is-editing[^"]*" id="archive-b"/);
});

test("渲染摘要、过滤归属和预览不修改来源字段及数组顺序", () => {
  const archives = [archive("a", "news", { summary: "**原始**摘要", gallery: [{ label: "保存的布局", image: "/campus-arch.jpeg", caption: "", layout: { x: 0, y: 0, w: 6, h: 4 } }] }), archive("b")];
  const before = structuredClone(archives);
  freezeDeep(archives);
  render(archives, "news"); render(archives); preview(archives, "news");
  assert.deepEqual(archives, before);
});

test("三类概览导航路径保持不变并正确高亮", () => {
  for (const kind of ["outcomes", "news", "other"]) {
    const html = renderToStaticMarkup(h(SiteHeader, { content: content(), active: kind }));
    const link = html.match(new RegExp(`<a\\b[^>]*href="/${kind}"[^>]*>`))?.[0];
    assert.ok(link);
    assert.match(link, /aria-current="page"/);
  }
});

test("电脑及手机三类预览复用概览组件，不再生成旧图片卡片", () => {
  for (const mobile of [false, true]) for (const kind of ["outcomes", "news", "other"]) {
    const html = preview([archive("only", kind, { summary: "未保存概览文字" })], kind, mobile);
    assert.match(html, /archive-overview/);
    assert.match(html, /未保存概览文字/);
    assert.match(html, new RegExp(`页面 /${kind}`));
    assert.equal(html.includes("editor-live-stage is-mobile"), mobile);
    assert.doesNotMatch(html, /editor-live-archives|class="editor-live-card-image"/);
  }
});
