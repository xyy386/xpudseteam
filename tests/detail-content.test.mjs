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
const temp = await mkdtemp(join(root, ".sites-runtime", "detail-test-"));
after(() => rm(temp, { recursive: true, force: true }));
await build({
  stdin: {
    contents: 'export { ArchiveDetailContent } from "./app/archive-detail-content"; export { ResearchDetailContent } from "./app/research-detail-content"; export { NewsListContent, NewsArticleContent } from "./app/news-articles"; export { LivePreview } from "./app/edit/live-preview";',
    resolveDir: root, loader: "ts",
  },
  outfile: join(temp, "components.cjs"), bundle: true, format: "cjs", platform: "node",
  packages: "external", loader: { ".css": "empty" }, jsx: "automatic", logLevel: "error",
});
const { ArchiveDetailContent, ResearchDetailContent, NewsListContent, NewsArticleContent, LivePreview } = createRequire(import.meta.url)(join(temp, "components.cjs"));
const saved = JSON.parse(await readFile(join(root, "app/saved-content.json"), "utf8"));
const longParagraph = "详情完整正文不应被概览摘要截断。".repeat(25);
const richBody = "第一段**完整加粗**，行内公式 $x^2+y^2=1$。\n\n" + longParagraph + "\n\n- 列表甲\n- 列表乙\n\n| 指标 | 说明 |\n| --- | --- |\n| 原始表格内容 | [数据链接](https://example.test/data) |\n\n$$\n\\int_0^1 x\\,dx=\\frac{1}{2}\n$$\n\n![正文图片](/body-image.png)\n\n[站内资料](/team) [邮件](mailto:reader@example.test)";
const emptyPaper = { title: "", description: "", image: "", url: "" };
function subsection(id, overrides = {}) {
  return { id, title: "分区 " + id, body: "", image: "", url: "", items: [], ...overrides };
}
function archive(slug = "publications", overrides = {}) {
  return { slug, group: "研究成果", homeAnchor: "outcomes", title: "栏目 " + slug, english: "LEGACY_ENGLISH", description: "", summary: "", cover: "", gallery: [], columns: [], rows: [], subsections: [], newsArticles: [], ...overrides };
}
function direction(slug = "computing", overrides = {}) {
  return { slug, title: "方向 " + slug, english: "LEGACY_RESEARCH", summary: "", image: "", equation: "", topics: [], papers: [], subsections: [], ...overrides };
}
function article(id = "published", overrides = {}) {
  return { id, title: "新闻 " + id, date: "2026-09-28", summary: "", body: "", thumbnail: "", images: [], attachment: "", attachmentName: "", source: "", importWarnings: [], status: "published", externalUrl: "", ...overrides };
}
function content(overrides = {}) {
  return {
    ...structuredClone(saved), directions: [], archives: [], customSections: [],
    pageText: { ...saved.pageText, researchNote: "", focusIntro: "", papersIntro: "", galleryIntro: "", tableIntro: "" },
    ...overrides,
  };
}
function render(Component, props) { return renderToStaticMarkup(h(Component, props)); }
function renderArchive(section, props = {}, value = content({ archives: [section] })) {
  return render(ArchiveDetailContent, { content: value, section, ...props });
}
function renderResearch(item, props = {}, value = content({ directions: [item] })) {
  return render(ResearchDetailContent, { content: value, direction: item, ...props });
}
function renderNews(section, props = {}) {
  return render(NewsListContent, { content: content({ archives: [section] }), section, ...props });
}
function renderArticle(item, props = {}, section = archive("events", { group: "团队动态", homeAnchor: "news" })) {
  return render(NewsArticleContent, { section, article: item, ...props });
}
function freezeDeep(value) {
  for (const child of Object.values(value)) if (child && typeof child === "object") freezeDeep(child);
  return Object.freeze(value);
}
function imageSources(html) {
  return [...html.matchAll(/<img\b[^>]*src="([^"]*)"/g)].map((match) => match[1]);
}
function assertRich(html) {
  for (const marker of [longParagraph, "<strong>完整加粗</strong>", "<ul>", "原始表格内容", "markdown-table-scroll", "markdown-math-inline", "markdown-math-display", 'href="https://example.test/data"', 'href="/team"', 'href="mailto:reader@example.test"', 'src="/body-image.png"']) assert.ok(html.includes(marker), marker);
  assert.doesNotMatch(html, /markdown-math-error/);
}

test("成果详情保留完整 Markdown 正文、公式和链接，不截成概览摘要", () => {
  const html = renderArchive(archive("publications", { description: richBody }));
  assertRich(html);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /href="\/outcomes(?:#[^"]*)?"/);
  assert.doesNotMatch(html, /archive-hero|photo-mosaic|formula-badge|图片待上传/);
});

test("成果详情保留图注、纯文字资料、表格原始链接及子栏目内容", () => {
  const section = archive("publications", {
    gallery: [{ label: "资料图片", image: "/archive-gallery.png", caption: "**图注内容**" }, { label: "纯文字资料", image: "", caption: "无图说明" }],
    columns: ["题目", "链接", "公式与说明"],
    rows: [["**论文标题**", "https://example.test/paper", "$a+b=c$"], ["书籍条目", "https://example.test/book", "完整备注 [站内附件](/files/book.pdf)"]],
    subsections: [subsection("custom-child", { body: "子区**完整正文**", image: "/child-image.png", url: "https://example.test/child", items: [{ ...emptyPaper, title: "子区图项", description: "子区图项说明", image: "/child-gallery.png", url: "/files/child.pdf" }] })],
  });
  const html = renderArchive(section);
  for (const marker of ["<strong>图注内容</strong>", "无图说明", "<strong>论文标题</strong>", 'href="https://example.test/paper"', 'href="/files/book.pdf"', "完整备注", "子区<strong>完整正文</strong>", 'id="subsection-custom-child"', "子区图项说明", 'href="https://example.test/child"', 'href="/files/child.pdf"']) assert.ok(html.includes(marker), marker);
  for (const src of ["/archive-gallery.png", "/child-image.png", "/child-gallery.png"]) assert.ok(imageSources(html).includes(src), src);
  assert.match(html, /markdown-math-inline/);
});

test("不规则资料表保留超出表头的单元格，短行补空格且空行不生成表格", () => {
  const html = renderArchive(archive("wide-table", { columns: ["名称"], rows: [["首列", "不可丢失的额外列", "第三列"], ["短行"]] }));
  for (const marker of ["首列", "不可丢失的额外列", "第三列", "短行"]) assert.ok(html.includes(marker), marker);
  assert.equal((html.match(/<td\b/g) || []).length, 6);
  assert.match(html, /role="region"/);
  assert.match(html, /tabindex="0"/);
});

function tableCells(html) {
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
  return [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) => [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]));
}

function tableHeaders(html) {
  const head = html.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] ?? "";
  return [...head.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((cell) => cell[1].replace(/<[^>]*>/g, ""));
}

test("论文目录公开及预览表格隐藏链接列，仅由题目安全打开原文", () => {
  const section = archive("publications", {
    columns: ["年份", "题目", "作者", "链接"],
    rows: [
      ["2026", "**带格式论文标题**", "作者甲", "https://example.test/paper-a"],
      ["2025", "另一篇论文", "作者乙", "http://example.test/paper-b"],
    ],
  });
  const before = structuredClone(section);
  const value = content({ archives: [section] });
  for (const html of [renderArchive(freezeDeep(section)), preview(value, "outcomes", 0), preview(value, "outcomes", 0, { mobile: true })]) {
    const rows = tableCells(html);
    assert.deepEqual(tableHeaders(html), ["年份", "题目", "作者"]);
    assert.equal(rows.length, 2);
    assert.doesNotMatch(html, /查看论文|查看链接/);
    for (const [index, row] of rows.entries()) {
      const href = before.rows[index][3];
      assert.equal(row.length, 3);
      assert.equal((row.join("").match(/<a\b/g) || []).length, 1);
      assert.ok(row[1].includes('href="' + href + '"'));
      assert.match(row[1], /target="_blank"/);
      assert.match(row[1], /rel="noopener noreferrer"/);
      assert.ok(row[0].includes(before.rows[index][0]));
      assert.ok(row[2].includes(before.rows[index][2]));
    }
    assert.match(rows[0][1], /<strong>带格式论文标题<\/strong>/);
  }
  assert.deepEqual(section, before);
});

test("论文链接缺失或无效时题目仍完整显示而不生成虚构地址", () => {
  const invalid = ["", " \n", "javascript:alert(1)", "//example.test/paper", "https://", "不是链接", "10.1000", "doi:invalid"];
  const section = archive("publications", { columns: ["题目", "链接"], rows: invalid.map((url, index) => ["保留标题 " + index, url]) });
  const html = renderArchive(section);
  const rows = tableCells(html);
  assert.deepEqual(tableHeaders(html), ["题目"]);
  assert.doesNotMatch(html, /查看论文|查看链接/);
  assert.equal(rows.length, invalid.length);
  for (const [index, row] of rows.entries()) {
    assert.equal(row.length, 1);
    assert.ok(row[0].includes("保留标题 " + index));
    assert.doesNotMatch(row[0], /<a\b/);
  }
});

test("论文目录将裸DOI及doi前缀转换成同一https DOI入口", () => {
  const values = ["10.1000/example", "doi:10.1000/example", " DOI: 10.1000/example "];
  const html = renderArchive(archive("publications", { columns: ["题目", "链接"], rows: values.map((url, index) => ["DOI论文 " + index, url]) }));
  const rows = tableCells(html);
  assert.deepEqual(tableHeaders(html), ["题目"]);
  assert.doesNotMatch(html, /查看论文|查看链接/);
  assert.equal(rows.length, values.length);
  for (const row of rows) {
    assert.equal(row.length, 1);
    assert.equal((row[0].match(/<a\b/g) || []).length, 1);
    assert.match(row[0], /href="https:\/\/doi\.org\/10\.1000\/example"/);
    assert.match(row[0], /target="_blank"/);
    assert.match(row[0], /rel="noopener noreferrer"/);
  }
});

test("调整列顺序或使用链接别名时仅过滤该列，题目仍取同一行的原文地址", () => {
  for (const linkLabel of ["链接", "原文链接", "论文链接", "DOI", "URL"]) {
    const section = archive("publications", { columns: [linkLabel, "作者", "题目", "年份"], rows: [["https://example.test/reordered", "作者名字", "排序后的题目", "2026"]] });
    const html = renderArchive(section);
    const [row] = tableCells(html);
    assert.deepEqual(tableHeaders(html), ["作者", "题目", "年份"]);
    assert.equal(row.length, 3);
    assert.match(row[0], /作者名字/);
    assert.match(row[1], /href="https:\/\/example\.test\/reordered"/);
    assert.match(row[1], /排序后的题目/);
    assert.match(row[2], /2026/);
    assert.doesNotMatch(row[0], /<a\b/);
    assert.doesNotMatch(row[2], /<a\b/);
    assert.doesNotMatch(html, /查看论文|查看链接/);
  }
  const [withoutLinkColumn] = tableCells(renderArchive(archive("publications", { columns: ["题目", "备注"], rows: [["未提供链接列", "https://example.test/reference"]] })));
  assert.doesNotMatch(withoutLinkColumn[0], /<a\b/);
  assert.equal(withoutLinkColumn.length, 2);
});

test("非论文栏目仍只将原始网址显示为查看链接，不把题目或DOI转换为论文入口", () => {
  for (const slug of ["projects", "awards", "events"]) {
    const section = archive(slug, { columns: ["题目", "链接"], rows: [["其他栏目标题", "https://example.test/material"], ["其他DOI记录", "doi:10.1000/example"]] });
    const html = renderArchive(section);
    const rows = tableCells(html);
    assert.deepEqual(tableHeaders(html), ["题目", "链接"]);
    assert.ok(rows.every((row) => row.length === 2));
    assert.doesNotMatch(rows[0][0], /<a\b/);
    assert.match(rows[0][1], /href="https:\/\/example\.test\/material"/);
    assert.match(rows[0][1], /查看链接/);
    assert.doesNotMatch(rows[0][1], /查看论文/);
    assert.doesNotMatch(rows[1].join(""), /href="https:\/\/doi\.org/);
    assert.match(rows[1][1], /doi:10\.1000\/example/);
  }
});

test("真实论文快照的电脑手机预览只显示四列表头，保留原标题及原文地址", () => {
  const value = {
    ...structuredClone(saved),
    directions: saved.directions.map((item) => ({ ...item, subsections: item.subsections ?? [] })),
    archives: saved.archives.map((item) => ({ ...item, subsections: item.subsections ?? [], newsArticles: item.newsArticles ?? [] })),
  };
  const index = value.archives.findIndex((item) => item.slug === "publications");
  const section = value.archives[index];
  assert.deepEqual(section.columns, ["年份", "题目", "作者", "期刊 / 出版信息", "链接"]);
  const papers = section.rows.filter((row) => row.some((cell) => cell.trim()));
  assert.ok(papers.length > 0);
  const before = structuredClone(value);
  for (const mobile of [false, true]) {
    const html = preview(value, section.homeAnchor, index, { mobile });
    assert.deepEqual(tableHeaders(html), ["年份", "题目", "作者", "期刊 / 出版信息"]);
    assert.doesNotMatch(html, /查看论文|查看链接/);
    const rows = tableCells(html);
    assert.equal(rows.length, papers.length);
    for (const [rowIndex, row] of rows.entries()) {
      assert.equal(row.length, 4);
      assert.ok(row[1].includes(papers[rowIndex][1]));
      assert.ok(row[1].includes('href="' + papers[rowIndex][4].replaceAll("&", "&amp;").replaceAll('"', "&quot;") + '"'));
      assert.equal((row.join("").match(/<a\b/g) || []).length, 1);
    }
  }
  assert.deepEqual(value, before);
});

test("空成果资料不生成空图、空表、拼贴和大面积占位", () => {
  const section = archive("empty", { gallery: [{ label: "新图片", image: "", caption: " " }], columns: ["标题", "内容", "链接"], rows: [["", " ", "\n"]] });
  const html = renderArchive(section);
  assert.match(html, /内容待补充。/);
  assert.doesNotMatch(html, /<img|<table|photo-mosaic|图片待上传|新图片/);
});

test("图集或资料表为空时独立保留已填写说明，不制造空图片和空表", () => {
  for (const empty of [
    {},
    { gallery: [{ label: "新图片", image: "", caption: " " }], columns: ["标题"], rows: [[" "]] },
  ]) for (const [field, titleField, title, body] of [
    ["galleryIntro", "galleryTitle", "自定义图集标题", "已有**图集说明**"],
    ["tableIntro", "tableTitle", "自定义资料标题", "已有**资料表说明**"],
  ]) {
    const section = archive("intro-only", empty);
    const value = content({ archives: [section], pageText: { ...content().pageText, [field]: body, [titleField]: title } });
    for (const html of [renderArchive(section, {}, value), preview(value, "outcomes", 0)]) {
      assert.ok(html.includes(title), title);
      assert.ok(html.includes(body.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")), field);
      assert.doesNotMatch(html, /<table|src="\/(?:archive-gallery|placeholder)|photo-mosaic|内容待补充。|新图片/);
    }
    assert.deepEqual(imageSources(renderArchive(section, {}, value)), []);
  }
});

test("成果详情保留摘要回退，关联栏目使用编码链接及预览回调按钮", () => {
  const item = archive("active", { summary: "缺少介绍时的**原始摘要**", subsections: [subsection("selected", { body: "编辑子区" })] });
  const other = archive("资料 甲/乙?#");
  const value = content({ archives: [item, other] });
  const html = renderArchive(item, {}, value);
  assert.match(html, /缺少介绍时的<strong>原始摘要<\/strong>/);
  assert.ok(html.includes('href="/archive/' + encodeURIComponent(other.slug) + '"'));
  const preview = renderArchive(item, { onBack() {}, onOpen() {}, activeSubsectionId: "selected", onEditSubsection() {} }, value);
  assert.doesNotMatch(preview, /href="\/(?:outcomes|archive)\b/);
  assert.match(preview, /<button\b/);
  assert.match(preview, /is-editing/);
  assert.match(preview, /id="subsection-selected"/);
});

test("研究详情完整保留公式、主图、研究主题、论文和扩展子栏目", () => {
  const item = direction("computing", {
    summary: richBody, image: "/research-main.png", equation: "$$E=mc^2$$",
    topics: [{ title: "研究主题", detail: "主题**全文**", image: "/topic-image.png" }],
    papers: [{ ...emptyPaper, title: "纯文字论文", description: "论文说明", url: "https://example.test/research" }, { ...emptyPaper, title: "论文图", image: "/paper-image.png" }],
    subsections: [subsection("research-child", { body: "研究扩展正文", image: "/research-child.png", url: "/research-related" })],
  });
  const value = content({ directions: [item], pageText: { ...content().pageText, researchNote: "研究说明原文", focusIntro: "主题说明原文", papersIntro: "论文说明原文" } });
  const html = renderResearch(item, {}, value);
  assertRich(html);
  for (const marker of ["研究说明原文", "主题说明原文", "论文说明原文", "主题<strong>全文</strong>", "纯文字论文", 'href="https://example.test/research"', "研究扩展正文", 'href="/research-related"', 'href="/archive/publications"']) assert.ok(html.includes(marker), marker);
  for (const src of ["/research-main.png", "/topic-image.png", "/paper-image.png", "/research-child.png"]) assert.ok(imageSources(html).includes(src), src);
  assert.doesNotMatch(html, /detail-hero|topic-visual|photo-mosaic|formula-badge/);
});

test("空研究资料和空白主题不产生图片占位，纯文字论文仍保留", () => {
  const empty = direction("empty", { image: " ", equation: "\n", topics: [{ title: " ", detail: "", image: "" }], papers: [{ ...emptyPaper }] });
  const html = renderResearch(empty);
  assert.match(html, /内容待补充。/);
  assert.doesNotMatch(html, /<img|photo-mosaic|图片待上传|detail-topics/);
  const textOnly = renderResearch(direction("text", { papers: [{ ...emptyPaper, title: "纯文字论文", description: "完整说明" }] }));
  assert.match(textOnly, /纯文字论文/);
  assert.match(textOnly, /完整说明/);
  assert.doesNotMatch(textOnly, /<img/);
});

test("仅有默认论文占位标题时不输出论文图项，保留简短空状态", () => {
  const labels = ["代表论文", "关键方法图", "研究结果", "新图片"];
  for (const pad of ["", " "]) {
    const item = direction("presets", { papers: labels.map((title) => ({ ...emptyPaper, title: pad + title + pad, description: " \n", image: " ", url: "" })) });
    const before = structuredClone(item);
    const html = renderResearch(item);
    assert.match(html, /内容待补充。/);
    assert.doesNotMatch(html, /education-gallery-item|detail-gallery|<img/);
    for (const label of labels) assert.ok(!html.includes(label), label);
    assert.deepEqual(item, before);
  }
});

test("真实纯标题论文及带图片说明或链接的默认标题完整保留", () => {
  const item = direction("actual-papers", { papers: [
    { ...emptyPaper, title: "真实纯文字论文标题" },
    { ...emptyPaper, title: "代表论文", image: "/representative-paper.png" },
    { ...emptyPaper, title: "关键方法图", description: "已有**方法说明**" },
    { ...emptyPaper, title: "研究结果", url: "https://example.test/result" },
    { ...emptyPaper, title: "新图片", image: "/new-image.png", description: "已补充的结果说明" },
  ] });
  const html = renderResearch(item);
  for (const marker of ["真实纯文字论文标题", "代表论文", "关键方法图", "研究结果", "新图片", "已有<strong>方法说明</strong>", "已补充的结果说明", 'href="https://example.test/result"']) assert.ok(html.includes(marker), marker);
  assert.deepEqual(imageSources(html), ["/representative-paper.png", "/new-image.png"]);
  assert.equal((html.match(/class="education-gallery-item"/g) || []).length, 5);
  assert.doesNotMatch(html, /内容待补充。/);
});

test("研究预览返回、关联方向和目录入口用按钮，子栏目编辑仍按ID高亮", () => {
  const item = direction("active", { subsections: [subsection("selected", { body: "编辑中的正文" })] });
  const other = direction("方向 甲/乙?#");
  const value = content({ directions: [item, other] });
  assert.ok(renderResearch(item, {}, value).includes('href="/research/' + encodeURIComponent(other.slug) + '"'));
  const html = renderResearch(item, { onBack() {}, onOpen() {}, onPublications() {}, activeSubsectionId: "selected", onEditSubsection() {} }, value);
  assert.doesNotMatch(html, /href="\/(?:research|archive\/publications)/);
  assert.match(html, /<button\b/);
  assert.match(html, /is-editing/);
  assert.match(html, /id="subsection-selected"/);
});

test("新闻列表只公开已发布及兼容旧状态文章，草稿仅在编辑预览展示", () => {
  const legacy = article("legacy"); delete legacy.status;
  const section = archive("events", { homeAnchor: "news", group: "团队动态", newsArticles: [article("published", { summary: "公开摘要" }), article("draft-secret", { status: "draft", summary: "草稿专有内容" }), legacy] });
  const html = renderNews(section);
  assert.match(html, /新闻 published/);
  assert.match(html, /新闻 legacy/);
  assert.match(html, /公开摘要/);
  assert.doesNotMatch(html, /draft-secret|草稿专有内容/);
  const preview = renderNews(section, { includeDrafts: true, onOpenArticle() {} });
  assert.match(preview, /draft-secret/);
  assert.match(preview, /草稿专有内容/);
  assert.match(preview, /草稿/);
});

test("新闻列表不依赖缩略图占位并保留旧资料表、图注及扩展区", () => {
  const section = archive("events", {
    homeAnchor: "news", group: "团队动态", newsArticles: [article("text-only", { summary: "新闻摘要" })],
    gallery: [{ label: "文字资料", image: "", caption: "保留图注" }], columns: ["资料"], rows: [["保留表格"]],
    subsections: [subsection("legacy-child", { body: "保留子栏目" })],
  });
  const html = renderNews(section);
  for (const marker of ["新闻摘要", "保留图注", "保留表格", "保留子栏目"]) assert.ok(html.includes(marker), marker);
  assert.doesNotMatch(html, /<img|photo-mosaic|图片待上传/);
});

test("新闻入口编码文章ID，预览列表及详情返回使用按钮", () => {
  const item = article("新闻 甲/乙?#", { thumbnail: "/news-thumb.png" });
  const section = archive("events", { homeAnchor: "news", group: "团队动态", newsArticles: [item] });
  const href = "/archive/events/" + encodeURIComponent(item.id);
  assert.ok(renderNews(section).includes('href="' + href + '"'));
  const html = renderNews(section, { onBack() {}, onOpenArticle() {} });
  assert.doesNotMatch(html, /href="\/(?:news|archive)/);
  assert.ok((html.match(/<button\b/g) || []).length >= 4);
  const detail = renderArticle(item, { onBack() {} }, section);
  assert.doesNotMatch(detail, /href="\/archive/);
  assert.equal((detail.match(/<button\b/g) || []).length, 2);
});

test("新闻详情保留全文、日期来源、附件及外链，正文图片只显示一次", () => {
  const item = article("rich", {
    body: richBody, source: "测试来源", attachment: "/api/news-file/original.docx", attachmentName: "原始新闻稿.docx", externalUrl: "https://example.test/article",
    images: [{ image: "/body-image.png", caption: "重复正文图" }, { image: "/extra-image.png", caption: "附加图片说明" }, { image: "", caption: "空图片说明" }],
  });
  const html = renderArticle(item);
  assertRich(html);
  assert.equal(imageSources(html).filter((src) => src === "/body-image.png").length, 1);
  assert.ok(imageSources(html).includes("/extra-image.png"));
  for (const marker of ["2026-09-28", "测试来源", "原始新闻稿.docx", "https://example.test/article", "附加图片说明"]) assert.ok(html.includes(marker), marker);
  assert.doesNotMatch(html, /空图片说明/);
});

test("没有新闻正文时保留摘要或Word下载说明，空文章显示简短状态", () => {
  assert.match(renderArticle(article("summary", { summary: "保留**完整摘要**" })), /保留<strong>完整摘要<\/strong>/);
  const word = renderArticle(article("word", { attachment: "/api/news-file/original.docx", attachmentName: "未转换文档.docx" }));
  assert.match(word, /Word/);
  assert.match(word, /未转换文档.docx/);
  const empty = renderArticle(article("empty"));
  assert.match(empty, /内容待补充。/);
  assert.doesNotMatch(empty, /<img|photo-mosaic|图片待上传/);
});

test("PDF新闻保留文件入口且不重复显示转换正文和附图", () => {
  const html = renderArticle(article("pdf", { body: "PDF不应重复正文", summary: "PDF不应重复摘要", attachment: "/api/news-file/original.PDF?version=1", attachmentName: "原稿.pdf", images: [{ image: "/pdf-image.png", caption: "PDF不应重复图片" }] }));
  assert.match(html, /PDF/);
  assert.match(html, /original\.PDF/);
  assert.doesNotMatch(html, /PDF不应重复正文|PDF不应重复摘要|PDF不应重复图片|<img/);
});

test("各类详情渲染不改正文、状态、原数组顺序或图集布局字段", () => {
  const layout = { x: 1, y: 2, w: 6, h: 4 };
  const archiveItem = archive("immutable", { description: richBody, gallery: [{ label: "原图", image: "/immutable.png", caption: "", layout, layoutMobile: { x: 0, y: 0, w: 12, h: 3 } }], newsArticles: [article("draft", { status: "draft" }), article("published")] });
  const researchItem = direction("immutable", { papers: [{ ...emptyPaper, title: "论文", layout }], subsections: [subsection("keep", { body: richBody })] });
  const value = content({ archives: [archiveItem], directions: [researchItem] });
  const before = structuredClone(value);
  freezeDeep(value);
  renderArchive(archiveItem, {}, value); renderResearch(researchItem, {}, value);
  renderNews(archiveItem); renderArticle(archiveItem.newsArticles[1]);
  assert.deepEqual(value, before);
});

function preview(value, view, activeItemIndex, props = {}) {
  return render(LivePreview, {
    content: value, view, activeItemIndex, focusPath: "", mobile: false,
    educationDetailId: null, educationActiveId: null,
    onOpenEducation() {}, onBackEducation() {}, onViewChange() {}, onEdit() {}, onEditSubsection() {}, onAddCustomSection() { return "unused"; }, onModeChange() {},
    ...props,
  });
}

test("电脑及手机研究与成果详情预览复用完整正文组件", () => {
  const section = archive("publications", { description: "未保存成果详情**全文**" });
  const item = direction("computing", { summary: "未保存研究详情**全文**" });
  const value = content({ archives: [section], directions: [item] });
  for (const mobile of [false, true]) {
    const research = preview(value, "research", 0, { mobile });
    const outcomes = preview(value, "outcomes", 0, { mobile });
    assert.match(research, /未保存研究详情<strong>全文<\/strong>/);
    assert.match(outcomes, /未保存成果详情<strong>全文<\/strong>/);
    for (const html of [research, outcomes]) {
      assert.match(html, /content-detail-page/);
      assert.equal(html.includes("editor-live-stage is-mobile"), mobile);
      assert.doesNotMatch(html, /photo-mosaic|class="editor-live-card-image"/);
    }
  }
});
