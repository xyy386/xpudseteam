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
const temp = await mkdtemp(join(root, ".sites-runtime", "education-test-"));
await build({
  stdin: {
    contents: 'export { EducationContent, EducationDetail } from "./app/education-content"; export { SiteHeader } from "./app/site-shell"; export { LivePreview } from "./app/edit/live-preview";',
    resolveDir: root,
    loader: "ts",
  },
  outfile: join(temp, "components.cjs"), bundle: true, format: "cjs", platform: "node",
  packages: "external", loader: { ".css": "empty" }, jsx: "automatic", logLevel: "error",
});
const { EducationContent, EducationDetail, SiteHeader, LivePreview } = createRequire(import.meta.url)(join(temp, "components.cjs"));
after(() => rm(temp, { recursive: true, force: true }));
const saved = JSON.parse(await readFile(join(root, "app/saved-content.json"), "utf8"));
const titles = ["教学课程", "学生获奖", "毕业生去向", "教学获奖"];
const ids = ["courses", "student-awards", "graduate-destinations", "teaching-awards"];
const emptyItem = { title: "", description: "", image: "", url: "" };
function subsection(id, title, overrides = {}) {
  return { id, title, body: "", image: "", url: "", items: [], ...overrides };
}
function education(overrides = {}) {
  return { id: "education", title: "人才培养", english: "", intro: "", body: "", image: "", items: [], subsections: titles.map((title, i) => subsection(ids[i], title)), ...overrides };
}
function content(customSections = [education()]) {
  return { ...structuredClone(saved), customSections };
}
function render(section, props = {}) {
  return renderToStaticMarkup(h(EducationContent, { section, ...props }));
}
function detail(section, item = section.subsections[0], props = {}) {
  return renderToStaticMarkup(h(EducationDetail, { section, item, ...props }));
}
function preview(section, mobile = false, focusPath = "", detailId = null, activeId = null) {
  return renderToStaticMarkup(h(LivePreview, {
    content: content([section]), view: `custom-${section.id}`, activeItemIndex: null, focusPath, mobile,
    educationDetailId: detailId, educationActiveId: activeId,
    onOpenEducation() {}, onBackEducation() {},
    onViewChange() {}, onEdit() {}, onEditSubsection() {}, onAddCustomSection() { return "unused"; }, onModeChange() {},
  }));
}
function headings(html) {
  return [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((match) => match[1].replace(/<[^>]+>/g, ""));
}
function freezeDeep(value) {
  for (const child of Object.values(value)) if (child && typeof child === "object") freezeDeep(child);
  return Object.freeze(value);
}

test("四个空分区概览按约定顺序展示，标题和更多均指向各自详情", () => {
  const html = render(education());
  assert.deepEqual(headings(html), titles);
  assert.equal((html.match(/内容待补充。/g) || []).length, 4);
  assert.doesNotMatch(html, /<img|education-gallery|education-overview|<small|EXTENDED CONTENT|subsection-image|photo-mosaic/);
  for (const id of ids) {
    assert.ok(html.includes(`id="subsection-${id}"`));
    assert.equal((html.match(new RegExp(`href="/custom/education/${id}"`, "g")) || []).length, 2);
  }
});

test("详情正文保留 Markdown 段落、列表、表格、图片及安全链接", () => {
  const body = "第一段**加粗**。\n\n第二段。\n\n- 列表项\n\n| 课程 | 学时 |\n| --- | --- |\n| 测试课程 | 32 |\n\n![测试图片](/campus-arch.jpeg)\n\n[详情](https://example.test/course) [站内](/team) [邮件](mailto:test@example.test)";
  const html = detail(education({ subsections: [subsection("courses", "教学课程", { body })] }));
  for (const marker of ["<strong>加粗</strong>", "<ul>", "markdown-table-scroll", "<table>", 'src="/campus-arch.jpeg"', 'href="https://example.test/course"', 'rel="noopener noreferrer"', 'href="/team"', 'href="mailto:test@example.test"']) assert.ok(html.includes(marker), marker);
  assert.doesNotMatch(html, /内容待补充/);
});

test("详情正文和相关链接不输出脚本或协议相对链接", () => {
  const html = detail(education({
    subsections: [subsection("courses", "教学课程", {
      body: "[危险](javascript:alert%281%29) [外站](//example.test) ![危险图](data:image/svg+xml,test)",
      url: "javascript:alert(1)", items: [{ ...emptyItem, title: "保留标题", url: "//example.test" }],
    })],
  }));
  assert.doesNotMatch(html, /href="(?:javascript:|\/\/)|src="data:|查看详情/);
  assert.match(html, /保留标题/);
});

test("原详情链接在详情页保留为相关链接且仅外链在新窗口打开", () => {
  const section = education({ subsections: [
    subsection("external", "外部链接", { url: "https://example.test" }),
    subsection("internal", "内部链接", { url: "/team" }),
    subsection("anchor", "锚点", { url: "#top" }),
  ] });
  const html = section.subsections.map((item) => detail(section, item)).join("");
  assert.match(html, /href="https:\/\/example.test" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /href="\/team">相关链接/);
  assert.match(html, /href="#top">相关链接/);
  assert.equal((html.match(/target="_blank"/g) || []).length, 1);
});

test("图集中的纯文字条目完整显示，不生成空图片占位", () => {
  const html = detail(education({ subsections: [subsection("courses", "教学课程", {
    items: [{ ...emptyItem, title: "课程说明", description: "**测试说明**", url: "/team" }],
  })] }));
  assert.match(html, /education-gallery-item/);
  assert.match(html, /<h3>课程说明<\/h3>/);
  assert.match(html, /<strong>测试说明<\/strong>/);
  assert.doesNotMatch(html, /<img|内容待补充/);
});

test("仅含空白文字或无效链接的图集条目视为空内容", () => {
  const section = education({ items: [{ ...emptyItem, title: "  ", description: "\n", url: "javascript:alert(1)" }], subsections: [subsection("courses", "教学课程", {
    body: " \n", items: [{ ...emptyItem, title: "  ", description: "\n" }, { ...emptyItem, url: "//example.test" }],
  })] });
  for (const html of [render(section), detail(section)]) {
    assert.match(html, /内容待补充/);
    assert.doesNotMatch(html, /education-gallery|education-overview|<img/);
  }
});

test("概览仅显示简短纯文本摘要，不输出分区富内容或完整长段落", () => {
  const longText = "用于测试概要截断的长段落，".repeat(30);
  const section = education({ subsections: [subsection("courses", "教学课程", {
    body: `**摘要开头** [链接文字](/team) ${longText}\n\n| 表格 | 数据 |\n| --- | --- |\n| 表格独有标记 | 数据 |\n\n![图片独有标记](/campus-arch.jpeg)\n\n\`\`\`js\ncodeOnlyMarker()\n\`\`\``,
    image: "/research-lorenz.png", items: [{ ...emptyItem, title: "图集独有标记", image: "/research-fluid.png" }],
  })] });
  const html = render(section);
  assert.match(html, /摘要开头 链接文字/);
  assert.doesNotMatch(html, /<img|<table|<pre|<code|<strong|表格独有标记|图片独有标记|codeOnlyMarker|图集独有标记|href="\/team"/);
  assert.ok(!html.includes(longText));
  assert.ok(detail(section).includes(longText));
});

test("人才培养概览与编辑预览仅显示课程导语，详情保留全部课程", () => {
  const intro = "教学课程覆盖本科生、硕士研究生和博士研究生三个培养层次。";
  const groups = [
    ["本科生课程", ["数值计算方法", "微分方程数值解", "数学建模公选课", "概率论与数理统计"]],
    ["硕士研究生课程", ["高等数值分析", "科学计算", "随机动力系统", "统计软件与计算", "微分方程数值解"]],
    ["博士研究生课程", ["纺织材料性能模拟计算"]],
  ];
  const body = [intro, ...groups.map(([title, courses]) => `## ${title}\n\n${courses.map((course) => `- 《${course}》`).join("\n")}`)].join("\n\n");
  const section = education({ subsections: [subsection("courses", "教学课程", { body })] });
  const before = structuredClone(section);

  for (const html of [render(section), preview(section), preview(section, true)]) {
    assert.match(html, new RegExp(`<p class="education-summary">${intro}</p>`));
    for (const [title, courses] of groups) {
      assert.ok(!html.includes(title), title);
      for (const course of courses) assert.ok(!html.includes(`《${course}》`), course);
    }
  }

  for (const html of [detail(section), preview(section, false, "", "courses"), preview(section, true, "", "courses")]) {
    assert.ok(html.includes(intro));
    for (const [title, courses] of groups) {
      assert.ok(html.includes(title), title);
      for (const course of courses) assert.ok(html.includes(`《${course}》`), course);
    }
    assert.equal((html.match(/<li>/g) || []).length, 10);
    assert.equal((html.match(/《微分方程数值解》/g) || []).length, 2);
    assert.match(html, /返回人才培养/);
  }
  assert.deepEqual(section, before);
});

test("只有表格、图片、代码、相关链接或图集时概览显示查看完整内容", () => {
  const cases = [
    { body: "| 甲 | 乙 |\n| --- | --- |\n| 1 | 2 |" },
    { body: "![仅图片](/campus-arch.jpeg)" },
    { body: "```js\nonlyCode()\n```" },
    { image: "/research-lorenz.png" },
    { url: "https://example.test/details" },
    { items: [{ ...emptyItem, title: "仅图集文字" }] },
  ];
  for (const entry of cases) {
    const html = render(education({ subsections: [subsection("courses", "教学课程", entry)] }));
    assert.match(html, /查看完整内容。/);
    assert.doesNotMatch(html, /内容待补充。|<img|<table|<pre/);
  }
});

test("空详情保留标题、返回入口和简短空状态", () => {
  const html = detail(education());
  assert.match(html, /<h1[^>]*>教学课程<\/h1>/);
  assert.match(html, /内容待补充。/);
  assert.match(html, /href="\/custom\/education#subsection-courses"/);
  assert.doesNotMatch(html, /<img|education-gallery|<table/);
});

test("ID编码、标题修改与分类重排不改变详情地址和返回锚点", () => {
  const id = "课程 甲/乙?#";
  const item = subsection(id, "原标题");
  const section = education({ subsections: [item] });
  const encoded = encodeURIComponent(id);
  const original = render(section);
  assert.equal((original.match(new RegExp(`href="/custom/education/${encoded}"`, "g")) || []).length, 2);
  assert.match(detail(section), new RegExp(`href="/custom/education#subsection-${encoded}"`));
  const renamed = { ...item, title: "修改后的标题" };
  const reordered = education({ subsections: [subsection("extra", "额外分类"), renamed] });
  assert.equal((render(reordered).match(new RegExp(`href="/custom/education/${encoded}"`, "g")) || []).length, 2);
  assert.ok(render(reordered).indexOf("额外分类") < render(reordered).indexOf("修改后的标题"));
});

test("已有栏目总览正文及图片继续显示，不丢失保存内容", () => {
  const html = render(education({ intro: "已有说明", body: "已有**正文**", image: "/campus-arch.jpeg", items: [{ ...emptyItem, title: "已有图集", image: "/research-lorenz.png" }] }));
  for (const marker of ["已有说明", "已有<strong>正文</strong>", 'src="/campus-arch.jpeg"', "已有图集", 'src="/research-lorenz.png"']) assert.ok(html.includes(marker), marker);
});

test("分类新增、删除、排序按当前数据展示，不自动补回默认分类", () => {
  const original = education();
  const extra = subsection("custom-category", "自定义分类", { body: "自定义内容" });
  const section = { ...original, subsections: [original.subsections[2], extra, original.subsections[0]] };
  assert.deepEqual(headings(render(section)), ["毕业生去向", "自定义分类", "教学课程"]);
  assert.doesNotMatch(render(section), /学生获奖|教学获奖/);
  const empty = render(education({ subsections: [] }));
  assert.equal((empty.match(/内容待补充。/g) || []).length, 1);
  assert.deepEqual(headings(empty), []);
});

test("共享组件渲染不修改原始数据及已有图集布局字段", () => {
  const section = education({ items: [{ ...emptyItem, title: "已有布局", layout: { x: 0, y: 0, w: 6, h: 4 }, layoutMobile: { x: 0, y: 0, w: 12, h: 3 } }] });
  const before = structuredClone(section);
  render(freezeDeep(section));
  detail(section);
  assert.deepEqual(section, before);
});

test("导航的人才培养位于研究成果和团队动态之间且只显示一次并正确高亮", () => {
  const html = renderToStaticMarkup(h(SiteHeader, { content: content([education({ id: "custom-example", title: "其他自定义栏目" }), education()]), active: "custom-education" }));
  const links = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>/g)].map((match) => match[1]);
  assert.deepEqual(links.slice(links.indexOf("/outcomes"), links.indexOf("/news") + 1), ["/outcomes", "/custom/education", "/news"]);
  assert.equal(links.filter((href) => href === "/custom/education").length, 1);
  assert.match(html, /href="\/custom\/education" aria-current="page"/);
  assert.ok(links.includes("/custom/custom-example"));
});

test("删除人才培养后导航不会自动补回入口", () => {
  const html = renderToStaticMarkup(h(SiteHeader, { content: content([]) }));
  assert.doesNotMatch(html, /custom\/education|人才培养/);
});

test("电脑和手机概览预览复用专用组件、按稳定ID高亮且栏目标签不重复", () => {
  for (const mobile of [false, true]) {
    const html = preview(education(), mobile, "", null, "student-awards");
    assert.equal((html.match(/class="education-page(?: [^"]*)?"/g) || []).length, 1);
    assert.equal((html.match(/role="tab"[^>]*>人才培养<\/button>/g) || []).length, 1);
    assert.match(html, /class="education-section[^\"]*is-editing[^\"]*" id="subsection-student-awards"/);
    assert.equal((html.match(/编辑此分区/g) || []).length, 4);
    assert.match(html, /页面 \/custom\/education/);
    assert.equal(html.includes("editor-live-stage is-mobile"), mobile);
    assert.doesNotMatch(html, /class="editor-live-section editor-live-custom"/);
  }
});

test("电脑和手机详情预览完整显示当前ID内容和返回入口", () => {
  const section = education({ subsections: [subsection("courses", "教学课程", { body: "**详情独有正文**\n\n| 甲 | 乙 |\n| --- | --- |\n| 1 | 2 |" })] });
  for (const mobile of [false, true]) {
    const html = preview(section, mobile, "customSections.0.subsections.0.body", "courses", "courses");
    assert.match(html, /<strong>详情独有正文<\/strong>/);
    assert.match(html, /<table>/);
    assert.match(html, /返回人才培养/);
    assert.match(html, /页面 \/custom\/education\/courses/);
    assert.equal((html.match(/role="tab"[^>]*>人才培养<\/button>/g) || []).length, 1);
    assert.equal(html.includes("editor-live-stage is-mobile"), mobile);
  }
});

test("普通自定义栏目仍采用原有通用预览排版", () => {
  const html = preview(education({ id: "custom-example", title: "其他自定义栏目" }));
  assert.match(html, /class="editor-live-section editor-live-custom"/);
  assert.match(html, /subsection-card/);
  assert.doesNotMatch(html, /class="education-page"/);
});
