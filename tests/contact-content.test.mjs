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
const temp = await mkdtemp(join(root, ".sites-runtime", "contact-test-"));
await build({
  stdin: {
    contents: 'export { ContactContent } from "./app/contact-content"; export { HomepageContent } from "./app/home-content"; export { SiteHeader, SiteFooter } from "./app/site-shell"; export { LivePreview } from "./app/edit/live-preview";',
    resolveDir: root, loader: "ts",
  },
  outfile: join(temp, "components.cjs"), bundle: true, format: "cjs", platform: "node",
  packages: "external", loader: { ".css": "empty" }, jsx: "automatic", logLevel: "error",
});
const { ContactContent, HomepageContent, SiteHeader, SiteFooter, LivePreview } = createRequire(import.meta.url)(join(temp, "components.cjs"));
after(() => rm(temp, { recursive: true, force: true }));
const saved = JSON.parse(await readFile(join(root, "app/saved-content.json"), "utf8"));
const emptyDetails = { person: "", role: "", email: "", phone: "", address: "", extra: "" };
const longEmail = `${"scientific-computing-contact-".repeat(12)}@example.test`;
const footerCopyright = "Copyright 版权所有 © 西安工程大学数据驱动科学工程建模与计算团队 版权所有";
const footerAddress = "地址：陕西省西安市临潼区陕鼓大道58号";
function content(overrides = {}) {
  return { ...structuredClone(saved), archives: [], contact: "", contactDetails: { ...emptyDetails }, institution: "", sectionTitles: { ...saved.sectionTitles, contact: "联系我们" }, sectionIntros: { ...saved.sectionIntros, contact: "" }, ...overrides };
}
function render(value, variant = "page", props = {}) {
  return renderToStaticMarkup(h(ContactContent, { content: value, variant, ...props }));
}
function preview(value, view = "contact", mobile = false) {
  return renderToStaticMarkup(h(LivePreview, {
    content: value, view, activeItemIndex: null, focusPath: view === "contact" ? "contact" : "", mobile,
    educationDetailId: null, educationActiveId: null,
    onOpenEducation() {}, onBackEducation() {}, onViewChange() {}, onEdit() {}, onEditSubsection() {}, onAddCustomSection() { return "unused"; }, onModeChange() {},
  }));
}
function freezeDeep(value) {
  for (const child of Object.values(value)) if (child && typeof child === "object") freezeDeep(child);
  return Object.freeze(value);
}

test("默认独立联系页使用一个一级标题，紧凑栏使用二级标题并保留锚点", () => {
  const value = content();
  const full = renderToStaticMarkup(h(ContactContent, { content: value }));
  assert.match(full, /class="[^"]*contact-page/);
  assert.equal((full.match(/<h1\b/g) || []).length, 1);
  assert.match(full, /<h1[^>]*>联系我们<\/h1>/);
  assert.doesNotMatch(full, /home-contact|CONTACT|section-heading-line|<form|<iframe/);
  const compact = render(value, "compact", { id: "contact" });
  assert.match(compact, /class="[^"]*home-contact/);
  assert.match(compact, /id="contact"/);
  assert.match(compact, /<h2\b/);
  assert.doesNotMatch(compact, /<h1\b/);
});

test("纯自由文本在两种版式中保留段落、列表、邮箱和链接", () => {
  const value = content({ contact: "**联系说明**\n\n第二段说明。\n\n- 联系人甲 [first@example.test](mailto:first@example.test)\n- 联系人乙 second@example.test\n\n[位置说明](/team)" });
  for (const variant of ["compact", "page"]) {
    const html = render(value, variant);
    for (const marker of ["contact-copy", "<strong>联系说明</strong>", "第二段说明。", "<ul>", 'href="mailto:first@example.test"', "second@example.test", 'href="/team"']) assert.ok(html.includes(marker), marker);
    assert.doesNotMatch(html, /<dl\b/);
  }
});

test("仅结构化字段时完整显示六项内容及 Markdown，不生成空自由文本区", () => {
  const value = content({ contactDetails: { person: "联系人甲", role: "测试职务", email: longEmail, phone: "029-00000000", address: "测试校园测试楼 101 室", extra: "**补充说明**\n\n[资料](/team)" } });
  for (const variant of ["compact", "page"]) {
    const html = render(value, variant);
    for (const marker of ["contact-fields", "联系人甲", "测试职务", longEmail, "029-00000000", "测试校园测试楼 101 室", "<strong>补充说明</strong>", 'href="/team"']) assert.ok(html.includes(marker), marker);
    assert.equal((html.match(/<dt>/g) || []).length, 6);
    assert.doesNotMatch(html, /contact-copy/);
  }
});

test("自由文本、结构化字段和栏目说明并存时全部保留，不合并或去重", () => {
  const value = content({ contact: "文本联系信息 marker@example.test", contactDetails: { ...emptyDetails, email: "marker@example.test", person: "结构化联系人" }, sectionIntros: { ...saved.sectionIntros, contact: "**栏目说明**" } });
  for (const variant of ["compact", "page"]) {
    const html = render(value, variant);
    assert.match(html, /contact-intro/);
    assert.match(html, /<strong>栏目说明<\/strong>/);
    assert.match(html, /文本联系信息/);
    assert.match(html, /结构化联系人/);
    assert.equal((html.replace(/<[^>]+>/g, "").match(/marker@example.test/g) || []).length, 2);
  }
});

test("空白自由文本及结构化字段不输出空信息容器或占位事实", () => {
  const value = content({ contact: " \n", contactDetails: Object.fromEntries(Object.keys(emptyDetails).map((key) => [key, " \n"])), sectionIntros: { ...saved.sectionIntros, contact: " " } });
  for (const variant of ["compact", "page"]) {
    const html = render(value, variant);
    assert.match(html, /联系我们/);
    assert.doesNotMatch(html, /contact-copy|contact-fields|contact-intro|<dl\b|电子邮箱|联系电话/);
  }
});

test("宽 Markdown 表格在两种版式中都保留滚动包裹及全部单元格", () => {
  const value = content({ contact: "| 部门 | 联系人 | 邮箱 | 电话 | 地址 | 备注 |\n| --- | --- | --- | --- | --- | --- |\n| 测试部门 | 测试人员 | " + longEmail + " | 029-00000000 | 测试地址 | 完整备注 |" });
  for (const variant of ["compact", "page"]) {
    const html = render(value, variant);
    assert.match(html, /markdown-table-scroll/);
    assert.match(html, /<table>/);
    assert.ok(html.includes(longEmail));
    assert.match(html, /完整备注/);
  }
});

test("联系方式链接继续采用 Markdown 安全过滤", () => {
  const value = content({ contact: "[有效邮箱](mailto:test@example.test) [有效外链](https://example.test) [脚本](javascript:alert%281%29) [协议相对](//example.test)" });
  for (const variant of ["compact", "page"]) {
    const html = render(value, variant);
    assert.match(html, /href="mailto:test@example.test"/);
    assert.match(html, /href="https:\/\/example.test" target="_blank" rel="noopener noreferrer"/);
    assert.doesNotMatch(html, /href="javascript:|href="\/\//);
  }
});

test("首页紧凑联系栏保留原锚点并提供独立联系页入口", () => {
  const html = renderToStaticMarkup(h(HomepageContent, { content: content({ contact: "首页联系标记" }) }));
  assert.match(html, /id="contact"/);
  assert.match(html, /home-contact/);
  assert.match(html, /首页联系标记/);
  assert.match(html, /href="\/contact"/);
  assert.doesNotMatch(html, /class="contact-page"/);
});

test("紧凑预览提供回调按钮，避免离开未保存编辑页", () => {
  const html = render(content(), "compact", { id: "preview-compact", onContactClick() {} });
  assert.match(html, /id="preview-compact"/);
  assert.match(html, /<button[^>]*class="contact-more"[^>]*>查看完整联系方式/);
  assert.doesNotMatch(html, /href="\/contact"/);
});

test("主导航使用独立联系页路径并高亮当前页", () => {
  const html = renderToStaticMarkup(h(SiteHeader, { content: content(), active: "contact" }));
  const link = html.match(/<a\b[^>]*href="\/contact"[^>]*>/)?.[0];
  assert.ok(link);
  assert.match(link, /aria-current="page"/);
  assert.equal((html.match(/href="\/contact"/g) || []).length, 1);
  assert.doesNotMatch(html, /href="\/#contact"/);
});

test("页头和编辑预览对空机构副标题不生成占位元素", () => {
  for (const institution of ["", " \n"]) {
    const value = content({ institution });
    const header = renderToStaticMarkup(h(SiteHeader, { content: value }));
    assert.doesNotMatch(header, /<small\b/);
    const html = preview(value);
    const brand = html.match(/<div class="editor-live-site-header">([\s\S]*?)<\/span><\/div>/)?.[1];
    assert.ok(brand);
    assert.doesNotMatch(brand, /<small\b/);
  }
});

test("已填写的机构副标题仍在页头及预览品牌中完整显示", () => {
  const value = content({ institution: "**保留的机构名称**" });
  for (const html of [renderToStaticMarkup(h(SiteHeader, { content: value })), preview(value)]) assert.match(html, /<strong>保留的机构名称<\/strong>/);
});

test("公共页脚精确显示固定版权与地址两行，各出现一次", () => {
  const html = renderToStaticMarkup(h(SiteFooter));
  assert.equal((html.match(/<footer\b/g) || []).length, 1);
  const paragraphs = Array.from(html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g), (match) => match[1]);
  assert.deepEqual(paragraphs, [footerCopyright, footerAddress]);
  assert.equal(html.split(footerCopyright).length - 1, 1);
  assert.equal(html.split(footerAddress).length - 1, 1);
  assert.doesNotMatch(html, /<strong\b|<small\b/);
});

test("各栏目电脑及手机预览末尾复用固定页脚，保留预览工具栏且不依赖团队名或机构", () => {
  const sharedFooter = renderToStaticMarkup(h(SiteFooter));
  for (const institution of ["", "未保存机构 UNIQUE_INSTITUTION_MARKER"]) {
    const value = content({ siteName: "未保存团队 UNIQUE_SITE_NAME_MARKER", institution });
    const before = structuredClone(value);
    for (const mobile of [false, true]) {
      for (const view of ["home", "team", "research", "outcomes", "news", "other", "contact", "custom-education"]) {
        const html = preview(value, view, mobile);
        const footers = html.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/g) || [];
        assert.deepEqual(footers, [sharedFooter], `${view}, mobile=${mobile}`);
        assert.equal(html.split(footerCopyright).length - 1, 1);
        assert.equal(html.split(footerAddress).length - 1, 1);
        assert.doesNotMatch(footers[0], /UNIQUE_SITE_NAME_MARKER|UNIQUE_INSTITUTION_MARKER/);
        assert.ok(html.includes(`${sharedFooter}</div></div><div class="editor-live-foot">`), "公共页脚应位于预览内容末尾、编辑器工具栏之前");
        assert.match(html, /正在预览：/);
        assert.match(html, /定位到编辑区 ↓/);
        assert.equal(html.includes("editor-live-stage is-mobile"), mobile);
      }
    }
    assert.deepEqual(value, before);
  }
});

test("电脑及手机联系预览使用独立页版式，首页使用紧凑版式且未保存文本一致", () => {
  const value = content({ contact: "未保存的联系资料 UNIQUE_CONTACT_MARKER" });
  for (const mobile of [false, true]) {
    const full = preview(value, "contact", mobile);
    assert.match(full, /contact-page/);
    assert.match(full, /页面 \/contact/);
    assert.equal((full.match(/UNIQUE_CONTACT_MARKER/g) || []).length, 1);
    assert.equal((full.match(/<h1\b/g) || []).length, 1);
    assert.doesNotMatch(full, /class="home-contact"/);
    const home = preview(value, "home", mobile);
    assert.match(home, /home-contact/);
    assert.match(home, /id="preview-home-contact"/);
    assert.equal((home.match(/UNIQUE_CONTACT_MARKER/g) || []).length, 1);
    assert.equal(full.includes("editor-live-stage is-mobile"), mobile);
    assert.equal(home.includes("editor-live-stage is-mobile"), mobile);
  }
});

test("共享内容渲染及预览不改动保存字段、自由文本或结构化字段", () => {
  const value = content({ contact: "原始\n\nMarkdown 数据", contactDetails: { ...emptyDetails, person: "原联系人", email: longEmail }, institution: "原机构字段" });
  const before = structuredClone(value);
  freezeDeep(value);
  render(value); render(value, "compact"); preview(value, "contact"); preview(value, "home");
  assert.deepEqual(value, before);
});
