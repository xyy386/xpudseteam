import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import test, { after } from "node:test";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
await mkdir(join(root, ".sites-runtime"), { recursive: true });
const temp = await mkdtemp(join(root, ".sites-runtime", "publication-test-"));
after(() => rm(temp, { recursive: true, force: true }));

const mockSource = [
  "let stored; const calls = [];",
  "export function configureFixture(value) { stored = structuredClone(value); calls.length = 0; }",
  "export function databaseCalls() { return structuredClone(calls); }",
  "export async function getEditorIdentity() { return { role: 'owner', email: 'test@example.invalid' }; }",
  "export async function isSiteEditor() { return true; }",
  "export async function getSiteContent() { return structuredClone(stored); }",
  "export const env = { DB: { prepare(sql) {",
  "  calls.push({ method: 'prepare', sql });",
  "  return { params: [], bind(...params) { this.params = params; return this; },",
  "    async run() { calls.push({ method: 'run', sql, params: this.params }); return { meta: { changes: 1 } }; } };",
  "} } };",
].join("\n");

await build({
  stdin: {
    contents: 'export { resolvePublicationUrl, publicationColumnIndices, findPublicationValidationError } from "./app/publication-links"; export { POST } from "./app/api/site-content/route"; export { configureFixture, databaseCalls } from "publication-fixture";',
    resolveDir: root, loader: "ts",
  },
  outfile: join(temp, "components.cjs"), bundle: true, format: "cjs", platform: "node",
  packages: "external", logLevel: "error",
  plugins: [{
    name: "isolated-publication-save",
    setup(builder) {
      builder.onResolve({ filter: /^(publication-fixture|cloudflare:workers|\.\.\/\.\.\/(?:content|editor-auth|editor-credentials))$/ }, () => ({ path: "fixture", namespace: "publication-test" }));
      builder.onLoad({ filter: /^fixture$/, namespace: "publication-test" }, () => ({ contents: mockSource, loader: "js" }));
    },
  }],
});
const { resolvePublicationUrl, publicationColumnIndices, findPublicationValidationError, POST, configureFixture, databaseCalls } = createRequire(import.meta.url)(join(temp, "components.cjs"));

function archive(slug = "publications", columns = ["题目", "链接"], rows = []) {
  return { slug, title: slug, group: "研究成果", homeAnchor: "outcomes", english: "", description: "", summary: "", cover: "", gallery: [], columns, rows, subsections: [], newsArticles: [] };
}
function content(archives) {
  return {
    revision: "existing-revision", syncBaseRevision: "existing-sync-baseline", siteName: "测试团队",
    members: [], directions: [], archives, customSections: [],
    hero: { featureTargetSlug: "", featureArticleId: "" }, sectionIntros: {}, backgrounds: {},
  };
}
function freezeDeep(value) {
  for (const child of Object.values(value)) if (child && typeof child === "object") freezeDeep(child);
  return Object.freeze(value);
}
async function save(value, stored = value) {
  configureFixture(stored);
  const response = await POST(new Request("https://example.test/api/site-content", {
    method: "POST", headers: { Origin: "https://example.test", "Content-Type": "application/json" },
    body: JSON.stringify(value),
  }));
  return { response, body: await response.json(), calls: databaseCalls() };
}

test("完整HTTP和HTTPS原文地址可用，首尾空格不进入链接", () => {
  for (const url of ["https://example.test/paper", "http://example.test/paper", "https://doi.org/10.1000/example", "https://example.test/paper?source=journal#abstract"]) {
    assert.equal(resolvePublicationUrl(" \n" + url + "\t "), url);
  }
});

test("裸DOI与大小写doi前缀统一解析为HTTPS原文入口", () => {
  for (const value of ["10.1000/example", "doi:10.1000/example", " DOI: 10.1000/example "]) {
    assert.equal(resolvePublicationUrl(value), "https://doi.org/10.1000/example");
  }
  assert.equal(resolvePublicationUrl("10.1000/abc(2026)01"), "https://doi.org/10.1000/abc(2026)01");
  assert.equal(resolvePublicationUrl("10.1000/example?part#note"), "https://doi.org/10.1000/example%3Fpart%23note");
});

test("缺地址、不完整网址、不支持的协议和不完整DOI均被拒绝", () => {
  for (const value of ["", " \n", "https://", "http://", "https://example.test/a b", "example.test/paper", "/paper.pdf", "//example.test/paper", "javascript:alert(1)", "data:text/html,test", "ftp://example.test/paper", "mailto:paper@example.test", "10.1000", "10.12/example", "doi:not-a-doi", "10.1000/has space"]) {
    assert.equal(resolvePublicationUrl(value), "", value);
  }
});

test("题目和链接支持约定列名别名，忽略大小写空格并按列位置返回", () => {
  const titles = ["题目", "标题", "论文题目", "论文标题", "著作名称", "TITLE"];
  const links = ["链接", "原文链接", "论文链接", "DOI", "Url"];
  for (const title of titles) for (const link of links) {
    assert.deepEqual(publicationColumnIndices(["年份", " " + link + " ", "作者", " " + title + " "]), { titleIndex: 3, linkIndex: 1 });
  }
  assert.deepEqual(publicationColumnIndices(["年份", "作者"]), { titleIndex: -1, linkIndex: -1 });
});

test("空目录及全空行可以保存，非空论文逐行要求题目和原文链接", () => {
  for (const rows of [[], [[], ["", " \n", "　"]]]) assert.equal(findPublicationValidationError([archive("publications", [], rows)]), null);
  const good = archive("publications", ["年份", "原文链接", "论文标题"], [
    ["", "", ""], ["2026", "https://example.test/paper", "论文甲"], ["2025", "doi:10.1000/example", "论文乙"],
  ]);
  assert.equal(findPublicationValidationError([good]), null);
  const missingLink = findPublicationValidationError([archive("publications", ["题目", "链接"], [["论文甲", ""]])]);
  assert.equal(missingLink.archiveIndex, 0);
  assert.equal(missingLink.rowIndex, 1);
  assert.match(missingLink.message, /链接|DOI|doi/);
  const missingTitle = findPublicationValidationError([archive("publications", ["题目", "链接"], [[" ", "https://example.test/paper"]])]);
  assert.equal(missingTitle.rowIndex, 1);
  assert.match(missingTitle.message, /题目|标题/);
});

test("错误保留原档案索引及原始行号，跳过前面的全空行而不重新编号", () => {
  const error = findPublicationValidationError([
    archive("projects", [], [["其他栏目不校验"]]),
    archive("publications", ["题目", "链接"], [["", ""], ["合法论文", "10.1000/example"], ["缺链接论文", ""]]),
  ]);
  assert.equal(error.archiveIndex, 1);
  assert.equal(error.rowIndex, 3);
});

test("有论文内容但缺失约定列时报列错误，缺题目或链接列均不可误存", () => {
  for (const columns of [["年份", "作者"], ["题目", "作者"], ["年份", "链接"]]) {
    const error = findPublicationValidationError([archive("publications", columns, [["2026", "资料"]])]);
    assert.ok(error);
    assert.equal(error.archiveIndex, 0);
    assert.equal(error.rowIndex, null);
    assert.match(error.message, /列/);
  }
});

test("其他栏目不受论文校验影响，校验不重排或改写任何原始字段", () => {
  const source = [
    archive("projects", ["题目", "链接"], [["项目", "非网址说明"]]),
    archive("awards", [], [["奖项", ""]]),
    archive("publications", ["链接", "题目"], [[" DOI:10.1000/example ", "原论文标题"]]),
  ];
  const before = structuredClone(source);
  assert.equal(findPublicationValidationError(freezeDeep(source)), null);
  assert.deepEqual(source, before);
});

test("保存接口遇到缺题目、缺链接、无效链接或列错误返回400且不触发数据库写入", async () => {
  const cases = [
    archive("publications", ["题目", "链接"], [["论文", ""]]),
    archive("publications", ["题目", "链接"], [["", "https://example.test/paper"]]),
    archive("publications", ["题目", "链接"], [["论文", "javascript:alert(1)"]]),
    archive("publications", ["年份", "作者"], [["2026", "作者"]]),
  ];
  for (const section of cases) {
    const value = content([section]);
    const before = structuredClone(value);
    const result = await save(value);
    assert.equal(result.response.status, 400);
    assert.equal(typeof result.body.error, "string");
    assert.ok(result.body.error.length);
    assert.deepEqual(result.calls, []);
    assert.deepEqual(value, before);
  }
});

test("格式损坏的论文行返回可处理的400而不是500，也不会写数据库", async () => {
  for (const section of [
    { ...archive(), rows: null },
    { ...archive(), rows: [null] },
    { ...archive(), rows: [["论文", false]] },
    { ...archive(), columns: null, rows: [["论文", "https://example.test/paper"]] },
  ]) {
    const result = await save(content([section]));
    assert.equal(result.response.status, 400);
    assert.match(result.body.error, /论文与著作/);
    assert.deepEqual(result.calls, []);
  }
});

test("保存合法论文保留原HTTP或DOI字段，仍通过既有版本检查写入", async () => {
  const value = content([archive("publications", ["链接", "题目"], [
    ["https://example.test/paper", "论文甲"], [" DOI:10.1000/example ", "论文乙"], ["http://example.test/book", "著作丙"],
  ])]);
  const result = await save(value);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.ok, true);
  const writes = result.calls.filter((call) => call.method === "run");
  assert.equal(writes.length, 1);
  assert.match(writes[0].sql, /AND updated_at = \?/);
  const stored = JSON.parse(writes[0].params[0]);
  assert.deepEqual(stored.archives, value.archives);
  assert.equal(stored.syncBaseRevision, value.syncBaseRevision);
  assert.equal(stored.revision, result.body.revision);
});

test("保存空论文目录和其他栏目时保持原行为，不要求虚构论文或链接", async () => {
  for (const archives of [
    [archive("publications", [], [["", " \n"]])],
    [archive("projects", ["题目", "链接"], [["科研项目", "已有项目说明"]])],
    [],
  ]) {
    const result = await save(content(archives));
    assert.equal(result.response.status, 200);
    assert.equal(result.calls.filter((call) => call.method === "run").length, 1);
  }
});

test("内容版本过期仍优先返回409，论文校验不会绕过并发保护", async () => {
  const stored = content([archive("publications", ["题目", "链接"], [["正式论文", "https://example.test/paper"]])]);
  const stale = { ...content([archive("publications", ["题目", "链接"], [["缺链接论文", ""]])]), revision: "stale-version" };
  const result = await save(stale, stored);
  assert.equal(result.response.status, 409);
  assert.equal(result.body.current.revision, stored.revision);
  assert.deepEqual(result.calls, []);
});
