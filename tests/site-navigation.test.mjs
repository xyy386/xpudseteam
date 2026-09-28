import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import test, { after } from "node:test";
import { build } from "esbuild";
import { createElement as h } from "react";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";

const root = resolve(import.meta.dirname, "..");
const saved = JSON.parse(await readFile(join(root, "app/saved-content.json"), "utf8"));
// Older snapshots omit these collections; getSiteContent normally supplies them.
for (const archive of saved.archives) {
  archive.newsArticles ??= [];
  archive.subsections ??= [];
}
await mkdir(join(root, ".sites-runtime"), { recursive: true });
const temp = await mkdtemp(join(root, ".sites-runtime", "navigation-test-"));
after(() => rm(temp, { recursive: true, force: true }));

await build({
  stdin: {
    contents: `
      export { default as Home } from "./app/page";
      export { default as TeamPage } from "./app/team/page";
      export { default as ResearchPage } from "./app/research/page";
      export { default as OutcomesPage } from "./app/outcomes/page";
      export { default as EducationPage } from "./app/custom/[id]/page";
      export { default as NewsPage } from "./app/news/page";
      export { default as OtherPage } from "./app/other/page";
      export { default as ContactPage } from "./app/contact/page";
      export { SiteHeader } from "./app/site-shell";
    `,
    resolveDir: root, loader: "ts",
  },
  outfile: join(temp, "pages.cjs"), bundle: true, format: "cjs", platform: "node",
  packages: "external", loader: { ".css": "empty" }, jsx: "automatic", logLevel: "error",
  plugins: [{
    name: "public-navigation-fixture",
    setup(build) {
      build.onResolve({ filter: /(?:^|\/)content$/ }, (args) => {
        if (resolve(args.resolveDir, args.path) === join(root, "app/content")) {
          return { path: "site-content", namespace: "navigation-fixture" };
        }
      });
      build.onLoad({ filter: /^site-content$/, namespace: "navigation-fixture" }, () => ({
        contents: `const content = ${JSON.stringify(saved)}; export async function getSiteContent() { return structuredClone(content); }`,
        loader: "js",
      }));
    },
  }],
});
const pages = createRequire(import.meta.url)(join(temp, "pages.cjs"));
const education = saved.customSections.find((section) => section.id === "education");
assert.ok(education, "The initial snapshot must include the education navigation entry.");
const routes = [
  { component: "Home", href: "/", title: "首页", heading: "课题组简介", marker: "home-overview" },
  { component: "TeamPage", href: "/team", title: saved.sectionTitles.team, marker: "team-directory" },
  { component: "ResearchPage", href: "/research", title: saved.sectionTitles.research, marker: "research-card-grid" },
  { component: "OutcomesPage", href: "/outcomes", title: saved.sectionTitles.outcomes, marker: "archive-overview" },
  { component: "EducationPage", href: "/custom/education", title: education.title, marker: "education-grid", props: { params: Promise.resolve({ id: "education" }) } },
  { component: "NewsPage", href: "/news", title: saved.sectionTitles.news, marker: "archive-overview" },
  { component: "OtherPage", href: "/other", title: saved.sectionTitles.other, marker: "archive-overview" },
  { component: "ContactPage", href: "/contact", title: saved.sectionTitles.contact, marker: "contact-page" },
];

function textOnly(value) {
  return value.replace(/<[^>]+>/g, "");
}
function navigationLinks(html) {
  const nav = html.match(/<nav\b[^>]*aria-label="主导航"[^>]*>(.*?)<\/nav>/s);
  assert.ok(nav, "Public page must render its primary navigation.");
  return [...nav[1].matchAll(/<a\b([^>]*)>(.*?)<\/a>/gs)].map(([, attributes, text]) => ({
    href: attributes.match(/\bhref="([^"]*)"/)?.[1],
    title: textOnly(text),
    active: /\baria-current="page"/.test(attributes),
  }));
}
async function renderPage(route) {
  const stream = await renderToReadableStream(h(pages[route.component], route.props));
  await stream.allReady;
  return new Response(stream).text();
}
const rendered = new Map(await Promise.all(routes.map(async (route) => [route.href, await renderPage(route)])));

test("真实首页入口显示简介、最新动态和联系栏，不显示教师名录", () => {
  const html = rendered.get("/");
  assert.match(html, /课题组简介/);
  assert.match(html, /最新动态/);
  assert.match(html, /class="home-contact-inner"/);
  assert.match(html, /href="\/team"[^>]*>查看团队成员/);
  assert.doesNotMatch(html, /class="(?:team-directory|team-profile|research-card-grid)"/);
  for (const member of saved.members) {
    if (member.photo.trim()) assert.ok(!html.includes(`src="${member.photo}"`), "The homepage must not render a teacher photo.");
  }
});

for (const route of routes) {
  test(`${route.href} 的真实页面入口、栏目标题和导航高亮一致`, () => {
    const html = rendered.get(route.href);
    const headings = [...html.matchAll(/<h1\b[^>]*>(.*?)<\/h1>/gs)].map((match) => textOnly(match[1]));
    assert.deepEqual(headings, [route.heading ?? route.title]);
    assert.ok(html.includes(route.marker), `Missing page content marker: ${route.marker}`);
    assert.deepEqual(navigationLinks(html).filter((link) => link.active).map(({ href, title }) => ({ href, title })), [{ href: route.href, title: route.title }]);
    assert.equal((html.match(/<header class="site-header"/g) || []).length, 1);
    assert.equal((html.match(/<footer class="site-footer"/g) || []).length, 1);
  });
}

test("所有概览页使用相同导航路径和顺序，首页始终位于首项", () => {
  const expected = routes.filter((route) => route.href !== "/contact").map(({ href, title }) => ({ href, title }));
  for (const section of saved.customSections.filter((section) => section.id !== "education")) {
    expected.push({ href: `/custom/${section.id}`, title: section.title });
  }
  expected.push({ href: "/contact", title: saved.sectionTitles.contact });
  for (const [path, html] of rendered) {
    assert.deepEqual(navigationLinks(html).map(({ href, title }) => ({ href, title })), expected, path);
  }
});

test("品牌文字返回首页，校徽与院徽保留原有官网外链", () => {
  for (const [path, html] of rendered) {
    assert.match(html, /<a class="brand-copy" href="\/">/, path);
    for (const url of ["https://www.xpu.edu.cn", "https://math.xpu.edu.cn"]) {
      const anchor = [...html.matchAll(/<a\b([^>]*)>(.*?)<\/a>/gs)].find(([, attributes]) => attributes.includes(`href="${url}"`));
      assert.ok(anchor, `${path}: ${url}`);
      assert.match(anchor[1], /target="_blank"/);
      assert.match(anchor[1], /rel="noopener noreferrer"/);
      assert.match(anchor[2], /<img\b/);
    }
  }
});

test("自定义栏目增删不改变首页地址，新增栏目按其稳定ID高亮", () => {
  const content = structuredClone(saved);
  content.customSections = [{ id: "extra-navigation", title: "新增栏目", english: "", intro: "", body: "", image: "", items: [], subsections: [] }];
  const links = navigationLinks(renderToStaticMarkup(h(pages.SiteHeader, { content, active: "custom-extra-navigation" })));
  assert.deepEqual(links[0], { href: "/", title: "首页", active: false });
  assert.deepEqual(links.slice(-2).map(({ href }) => href), ["/custom/extra-navigation", "/contact"]);
  assert.ok(!links.some((link) => link.href === "/custom/education"));
  assert.deepEqual(links.filter((link) => link.active), [{ href: "/custom/extra-navigation", title: "新增栏目", active: true }]);
});
