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
const temp = await mkdtemp(join(root, ".sites-runtime", "people-test-"));
await build({
  stdin: {
    contents: 'export { TeamContent, ResearchOverview } from "./app/people-overviews"; export { SiteHeader } from "./app/site-shell"; export { LivePreview } from "./app/edit/live-preview";',
    resolveDir: root, loader: "ts",
  },
  outfile: join(temp, "components.cjs"), bundle: true, format: "cjs", platform: "node",
  packages: "external", loader: { ".css": "empty" }, jsx: "automatic", logLevel: "error",
});
const { TeamContent, ResearchOverview, SiteHeader, LivePreview } = createRequire(import.meta.url)(join(temp, "components.cjs"));
after(() => rm(temp, { recursive: true, force: true }));
const saved = JSON.parse(await readFile(join(root, "app/saved-content.json"), "utf8"));
function member(name, overrides = {}) {
  return { name, role: "测试职称", focus: "测试研究领域", photo: "", url: "", ...overrides };
}
function direction(slug, overrides = {}) {
  return { slug, title: `测试方向 ${slug}`, english: "HIDDEN_ENGLISH_MARKER", equation: "HIDDEN_EQUATION_MARKER", summary: "", image: "", topics: [], papers: [], subsections: [], ...overrides };
}
function content(overrides = {}) {
  return { ...structuredClone(saved), members: [], directions: [], sectionIntros: { ...saved.sectionIntros, team: "", research: "" }, ...overrides };
}
function renderTeam(members = [], props = {}) {
  return renderToStaticMarkup(h(TeamContent, { content: content({ members }), ...props }));
}
function renderResearch(directions = [], props = {}) {
  return renderToStaticMarkup(h(ResearchOverview, { content: content({ directions }), ...props }));
}
function classCount(html, name) {
  return [...html.matchAll(/class="([^"]*)"/g)].filter((match) => match[1].split(/\s+/).includes(name)).length;
}
function headingText(html, level = 2) {
  return [...html.matchAll(new RegExp(`<h${level}[^>]*>(.*?)</h${level}>`, "g"))].map((match) => match[1].replace(/<[^>]+>/g, ""));
}
function preview(value, view, mobile = false, props = {}) {
  return renderToStaticMarkup(h(LivePreview, {
    content: value, view, activeItemIndex: null, focusPath: "", mobile,
    educationDetailId: null, educationActiveId: null,
    onOpenEducation() {}, onBackEducation() {}, onViewChange() {}, onEdit() {}, onEditSubsection() {}, onAddCustomSection() { return "unused"; }, onModeChange() {},
    ...props,
  }));
}
function freezeDeep(value) {
  for (const child of Object.values(value)) if (child && typeof child === "object") freezeDeep(child);
  return Object.freeze(value);
}

test("两个空栏目展示真实标题和空状态，不生成成员或方向占位", () => {
  for (const [html, title, entry] of [[renderTeam(), saved.sectionTitles.team, "team-profile"], [renderResearch(), saved.sectionTitles.research, "research-card"]]) {
    assert.deepEqual(headingText(html, 1), [title]);
    assert.match(html, /内容待补充。/);
    assert.equal(classCount(html, entry), 0);
    assert.doesNotMatch(html, /<img|HIDDEN_ENGLISH_MARKER|HIDDEN_EQUATION_MARKER/);
  }
});

test("成员1、5、6位均按后台顺序完整展示，不补齐或截掉第6位", () => {
  for (const count of [1, 5, 6]) {
    const members = Array.from({ length: count }, (_, index) => member(`成员 ${index + 1}`));
    const html = renderTeam(members);
    assert.equal(classCount(html, "team-profile"), count);
    assert.deepEqual(headingText(html), members.map((item) => item.name));
  }
});

test("成员照片与姓名职称研究领域个人简介按既定顺序出现", () => {
  const html = renderTeam([member("姓名标记", { photo: "/members/han.jpg", role: "职称标记", focus: "领域标记", url: "https://example.test/person" })]);
  const indexes = ['src="/members/han.jpg"', "姓名标记</", "职称标记</", "领域标记</", "个人简介"].map((text) => html.indexOf(text));
  assert.ok(indexes.every((index) => index >= 0));
  assert.deepEqual([...indexes].sort((a, b) => a - b), indexes);
  assert.match(html, /href="https:\/\/example\.test\/person"/);
  assert.equal(classCount(html, "team-profile-photo"), 1);
});

test("缺照片显示暂无照片；空白链接不生成个人简介入口", () => {
  for (const photo of ["", " "]) {
    const html = renderTeam([member("无照片成员", { photo, url: " " })]);
    assert.match(html, /暂无照片/);
    assert.equal(classCount(html, "team-profile-photo"), 1);
    assert.doesNotMatch(html, /<img|个人简介|href=/);
  }
});

test("长姓名职称和多段领域列表完整保留，不使用摘要截断", () => {
  const name = "较长姓名".repeat(8);
  const role = "长职称与学术身份".repeat(10);
  const body = "完整研究领域正文".repeat(40);
  const html = renderTeam([member(name, { role, focus: `第一段领域说明。\n\n- 列表项目甲\n- **列表项目乙**\n\n${body}` })]);
  assert.match(html, new RegExp(name));
  assert.match(html, new RegExp(role));
  assert.match(html, new RegExp(body));
  assert.match(html, /<ul>/);
  assert.match(html, /<strong>列表项目乙<\/strong>/);
});

test("成员新增、排序和删除由当前数组决定", () => {
  const a = member("成员甲");
  const b = member("成员乙");
  assert.deepEqual(headingText(renderTeam([b, member("新成员"), a])), ["成员乙", "新成员", "成员甲"]);
  assert.deepEqual(headingText(renderTeam([b])), ["成员乙"]);
});

test("成员预览保留真实个人链接和每位成员的编辑按钮", () => {
  const html = renderTeam([member("甲", { url: "https://example.test/profile" }), member("乙")], { activeIndex: 1, onEdit() {} });
  assert.equal((html.match(/<button\b/g) || []).length, 2);
  assert.match(html, /href="https:\/\/example\.test\/profile"/);
  assert.equal(classCount(html, "is-editing"), 1);
  assert.match(html, /编辑此成员/);
});

test("研究方向1、3及多个项目按实际顺序展示，不补造分类", () => {
  for (const count of [1, 3, 7]) {
    const directions = Array.from({ length: count }, (_, index) => direction(`direction-${index}`));
    const html = renderResearch(directions);
    assert.equal(classCount(html, "research-card"), count);
    assert.deepEqual(headingText(html), directions.map((item) => item.title));
  }
});

test("有图方向图片标题更多进入同一详情，没图时不保留图片区", () => {
  const withImage = renderResearch([direction("shown", { image: "/research-lorenz.png" })]);
  assert.equal(classCount(withImage, "research-card-image"), 1);
  assert.equal((withImage.match(/href="\/research\/shown"/g) || []).length, 3);
  assert.match(withImage, /src="\/research-lorenz.png"/);
  for (const image of ["", " "]) {
    const empty = renderResearch([direction("empty", { image })]);
    assert.equal(classCount(empty, "research-card-image"), 0);
    assert.equal((empty.match(/href="\/research\/empty"/g) || []).length, 2);
    assert.doesNotMatch(empty, /<img|图片待上传/);
  }
});

test("方向长标题、完整Markdown正文、列表与表格在概览保留", () => {
  const title = "较长研究方向标题".repeat(12);
  const longText = "方向介绍完整正文".repeat(60);
  const html = renderResearch([direction("markdown", { title, summary: `**加粗介绍**\n\n${longText}\n\n- 列表内容\n\n| 指标 | 说明 |\n| --- | --- |\n| 测试 | [数据链接](https://example.test/data) |\n\n![正文图](/research-fluid.png)` })]);
  assert.match(html, new RegExp(title));
  assert.match(html, new RegExp(longText));
  assert.match(html, /<strong>加粗介绍<\/strong>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<table>/);
  assert.match(html, /href="https:\/\/example\.test\/data"/);
  assert.match(html, /src="\/research-fluid.png"/);
});

test("空方向介绍显示简短状态，英文公式和详情资料不在概览泄出", () => {
  const html = renderResearch([direction("details", { summary: " ", topics: [{ title: "详情主题标记", detail: "详情正文标记", image: "/research-fluid.png" }], papers: [{ title: "详情论文标记", description: "论文说明标记", image: "", url: "" }] })]);
  assert.match(html, /内容待补充。/);
  assert.doesNotMatch(html, /HIDDEN_ENGLISH_MARKER|HIDDEN_EQUATION_MARKER|详情主题标记|详情正文标记|详情论文标记|论文说明标记|<img/);
});

test("方向改名及排序继续使用编码后的稳定slug地址", () => {
  const slug = "方向 甲/乙?#";
  const entry = direction(slug, { title: "原名称" });
  for (const html of [renderResearch([entry]), renderResearch([direction("other"), { ...entry, title: "改后名称" }])]) {
    assert.equal((html.match(new RegExp(`href="/research/${encodeURIComponent(slug)}"`, "g")) || []).length, 2);
  }
});

test("方向编辑模式将标题图片和更多改为定位按钮并高亮当前方向", () => {
  const html = renderResearch([direction("a", { image: "/research-fluid.png" }), direction("b")], { activeSlug: "b", onOpen() {} });
  assert.doesNotMatch(html, /href="\/research\//);
  assert.equal((html.match(/<button\b/g) || []).length, 5);
  assert.equal(classCount(html, "is-editing"), 1);
});

test("两个栏目标题及说明仍展示Markdown，未复用校园背景", () => {
  const value = content({ sectionIntros: { ...saved.sectionIntros, team: "团队**说明标记**", research: "研究**说明标记**" }, backgrounds: { ...saved.backgrounds, team: "/do-not-render-background-marker.png" } });
  for (const [Component, label] of [[TeamContent, "团队"], [ResearchOverview, "研究"]]) {
    const html = renderToStaticMarkup(h(Component, { content: value }));
    assert.match(html, new RegExp(`${label}<strong>说明标记</strong>`));
    assert.doesNotMatch(html, /do-not-render-background-marker/);
  }
});

test("成员和方向渲染及编辑预览不改动存储资料或排序", () => {
  const value = content({ members: [member("成员甲", { photo: "/members/han.jpg" })], directions: [direction("a", { image: "/research-fluid.png" }), direction("b")], backgrounds: { ...saved.backgrounds, team: "/saved-background-marker.png" } });
  const before = structuredClone(value);
  freezeDeep(value);
  renderToStaticMarkup(h(TeamContent, { content: value }));
  renderToStaticMarkup(h(ResearchOverview, { content: value }));
  preview(value, "team"); preview(value, "research");
  assert.deepEqual(value, before);
});

test("电脑及手机预览未选方向时显示概览，选中后显示完整未保存详情", () => {
  const value = content({ members: [member("未保存成员", { focus: "未保存领域" })], directions: [direction("unsaved", { title: "未保存方向", summary: "未保存方向介绍", equation: "$x^2$", topics: [{ title: "详情研究内容", detail: "详情完整说明", image: "" }], papers: [{ title: "详情论文", description: "论文说明", image: "", url: "https://example.test/paper" }] })] });
  for (const mobile of [false, true]) {
    const team = preview(value, "team", mobile, { activeItemIndex: 0 });
    assert.equal(classCount(team, "team-overview"), 1);
    assert.match(team, /未保存成员|未保存领域/);
    assert.doesNotMatch(team, /editor-live-members/);
    const overview = preview(value, "research", mobile);
    assert.equal(classCount(overview, "research-overview"), 1);
    assert.match(overview, /未保存方向介绍/);
    assert.doesNotMatch(overview, /详情研究内容|详情论文|content-detail-page/);
    const research = preview(value, "research", mobile, { activeItemIndex: 0 });
    assert.equal(classCount(research, "research-overview"), 0);
    assert.equal(classCount(research, "content-detail-page"), 1);
    assert.match(research, /未保存方向介绍/);
    assert.match(research, /详情研究内容/);
    assert.match(research, /详情完整说明/);
    assert.match(research, /详情论文/);
    assert.match(research, /markdown-math-inline/);
    assert.doesNotMatch(research, /editor-live-directions|HIDDEN_ENGLISH_MARKER|HIDDEN_EQUATION_MARKER/);
    assert.equal(team.includes("editor-live-stage is-mobile"), mobile);
    assert.equal(research.includes("editor-live-stage is-mobile"), mobile);
  }
});

test("两个现有导航链接及高亮维持原样", () => {
  for (const kind of ["team", "research"]) {
    const html = renderToStaticMarkup(h(SiteHeader, { content: content(), active: kind }));
    const link = html.match(new RegExp(`<a\\b[^>]*href="/${kind}"[^>]*>`))?.[0];
    assert.ok(link);
    assert.match(link, /aria-current="page"/);
  }
});
