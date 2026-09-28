import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { after } from "node:test";
import { build } from "esbuild";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EXAMPLE_UPDATES, fillEmptyExamples, fillLocalExamples } from "../scripts/fill-empty-examples.mjs";

const root = resolve(import.meta.dirname, "..");
const snapshot = JSON.parse(await readFile(join(root, "app/saved-content.json"), "utf8"));
const archiveIds = ["publications", "projects", "awards", "updates"];
const educationIds = ["education-student-awards", "education-graduate-destinations", "education-teaching-awards"];
const expectedIds = [...archiveIds, ...educationIds].sort();
await mkdir(join(root, ".sites-runtime"), { recursive: true });
const temp = await mkdtemp(join(root, ".sites-runtime", "examples-test-"));
after(() => rm(temp, { recursive: true, force: true }));
await build({
  stdin: {
    contents: 'export { ArchiveOverview } from "./app/archive-overview"; export { ArchiveDetailContent } from "./app/archive-detail-content"; export { EducationContent, EducationDetail } from "./app/education-content"; export { NewsListContent } from "./app/news-articles"; export { LivePreview } from "./app/edit/live-preview"; export { selectHomeNews } from "./app/home-news";',
    resolveDir: root, loader: "ts",
  },
  outfile: join(temp, "components.cjs"), bundle: true, format: "cjs", platform: "node",
  packages: "external", loader: { ".css": "empty" }, jsx: "automatic", logLevel: "error",
});
const { ArchiveOverview, ArchiveDetailContent, EducationContent, EducationDetail, NewsListContent, LivePreview, selectHomeNews } = createRequire(import.meta.url)(join(temp, "components.cjs"));

function target(content, update) {
  return update.kind === "archive"
    ? content.archives?.find((item) => item.slug === update.id)
    : content.customSections?.find((item) => item.id === "education")?.subsections?.find((item) => item.id === update.id);
}
function field(update) { return update.kind === "archive" ? "description" : "body"; }
function fixture(blank = "") {
  const value = structuredClone(snapshot);
  value.revision = "original-revision";
  value.syncBaseRevision = "original-sync-baseline";
  value.unchangedUnknownField = { nested: [1, "保留扩展字段"] };
  value.archives = value.archives.map((item) => ({ ...item, subsections: item.subsections ?? [], newsArticles: item.newsArticles ?? [] }));
  value.directions = value.directions.map((item) => ({ ...item, subsections: item.subsections ?? [] }));
  for (const update of EXAMPLE_UPDATES) {
    const item = target(value, update);
    assert.ok(item, update.id);
    item[field(update)] = blank;
  }
  const publications = value.archives.find((item) => item.slug === "publications");
  publications.gallery[0].layout = { x: 3, y: 2, w: 6, h: 4 };
  publications.gallery[0].layoutMobile = { x: 1, y: 0, w: 10, h: 5 };
  const events = value.archives.find((item) => item.slug === "events");
  events.newsArticles = [
    { id: "existing-published", title: "原有正式新闻", date: "2026-09-01", summary: "原摘要", body: "原正文", thumbnail: "", images: [], attachment: "", attachmentName: "", source: "", importWarnings: [], status: "published", externalUrl: "" },
    { id: "existing-draft", title: "原有草稿", date: "2026-09-02", summary: "草稿摘要", body: "", thumbnail: "", images: [], attachment: "", attachmentName: "", source: "", importWarnings: [], status: "draft", externalUrl: "" },
  ];
  return value;
}
function freezeDeep(value) {
  for (const child of Object.values(value)) if (child && typeof child === "object") freezeDeep(child);
  return Object.freeze(value);
}
function render(Component, props) { return renderToStaticMarkup(h(Component, props)); }
function preview(value, view, activeItemIndex = null, props = {}) {
  return render(LivePreview, {
    content: value, view, activeItemIndex, focusPath: "", mobile: false,
    educationDetailId: null, educationActiveId: null,
    onOpenEducation() {}, onBackEducation() {}, onViewChange() {}, onEdit() {}, onEditSubsection() {}, onAddCustomSection() { return "unused"; }, onModeChange() {},
    ...props,
  });
}

test("示例限定七个现有栏目且每段开头明确标注，摘要不会截掉标记", () => {
  assert.equal(EXAMPLE_UPDATES.length, 7);
  assert.deepEqual(EXAMPLE_UPDATES.map((item) => item.id).sort(), expectedIds);
  assert.deepEqual(EXAMPLE_UPDATES.filter((item) => item.kind === "archive").map((item) => item.id).sort(), [...archiveIds].sort());
  assert.deepEqual(EXAMPLE_UPDATES.filter((item) => item.kind === "education").map((item) => item.id).sort(), [...educationIds].sort());
  for (const item of EXAMPLE_UPDATES) {
    assert.match(item.text, /^【示例，仅作展示】/);
    assert.ok(Array.from(item.text).length <= (item.kind === "education" ? 60 : 120), item.id);
  }
});

test("仅填七个空目标字段，来源对象以及新闻布局版本和其他资料不变", () => {
  const source = fixture();
  const expected = structuredClone(source);
  for (const update of EXAMPLE_UPDATES) target(expected, update)[field(update)] = update.text;
  const before = structuredClone(source);
  const result = fillEmptyExamples(freezeDeep(source));
  assert.notStrictEqual(result.content, source);
  assert.deepEqual([...result.changedIds].sort(), expectedIds);
  assert.deepEqual(result.content, expected);
  assert.deepEqual(source, before);
});

test("空白字段可填充，已有正文及用户写入的待补充文字全部保留", () => {
  for (const blank of [" ", "\n\t", "　"]) {
    const result = fillEmptyExamples(fixture(blank));
    assert.deepEqual([...result.changedIds].sort(), expectedIds);
    for (const update of EXAMPLE_UPDATES) assert.equal(target(result.content, update)[field(update)], update.text);
  }
  for (const text of ["已有正式内容", " 内容待补充。 ", "【示例】管理员已自行调整的文字"]) {
    const value = fixture(text);
    const result = fillEmptyExamples(value);
    assert.deepEqual(result.changedIds, []);
    assert.strictEqual(result.content, value);
    for (const update of EXAMPLE_UPDATES) assert.equal(target(result.content, update)[field(update)], text);
  }
});

test("填充按固定ID定位，顺序和标题变化不影响目标，部分已有正文不覆盖", () => {
  const source = fixture();
  source.archives.reverse();
  source.customSections.find((item) => item.id === "education").subsections.reverse();
  const retainedIds = new Set(["projects", "education-graduate-destinations"]);
  for (const update of EXAMPLE_UPDATES) {
    const item = target(source, update);
    item.title = "用户修改后的名称 " + update.id;
    if (retainedIds.has(update.id)) item[field(update)] = "保留用户已写的内容";
  }
  const before = structuredClone(source);
  const result = fillEmptyExamples(source);
  assert.deepEqual([...result.changedIds].sort(), expectedIds.filter((id) => !retainedIds.has(id)));
  assert.deepEqual(result.content.archives.map((item) => item.slug), before.archives.map((item) => item.slug));
  assert.deepEqual(result.content.customSections[0].subsections.map((item) => item.id), before.customSections[0].subsections.map((item) => item.id));
  for (const update of EXAMPLE_UPDATES) {
    assert.equal(target(result.content, update).title, target(before, update).title);
    assert.equal(target(result.content, update)[field(update)], retainedIds.has(update.id) ? "保留用户已写的内容" : update.text);
  }
});

test("缺失或删除的栏目不重建，同名子区位于其他栏目时不误填", () => {
  const source = fixture();
  source.archives = source.archives.filter((item) => item.slug !== "projects");
  const education = source.customSections.find((item) => item.id === "education");
  const removed = education.subsections.find((item) => item.id === "education-student-awards");
  education.subsections = education.subsections.filter((item) => item.id !== removed.id);
  source.customSections.push({ id: "other-custom", title: "其他自定义栏目", english: "", intro: "", body: "", image: "", items: [], subsections: [removed] });
  const result = fillEmptyExamples(source);
  assert.deepEqual([...result.changedIds].sort(), expectedIds.filter((id) => id !== "projects" && id !== removed.id));
  assert.ok(!result.content.archives.some((item) => item.slug === "projects"));
  assert.ok(!result.content.customSections.find((item) => item.id === "education").subsections.some((item) => item.id === removed.id));
  assert.equal(result.content.customSections.find((item) => item.id === "other-custom").subsections[0].body, "");
  for (const value of [{ archives: [], customSections: [] }, { archives: [] }]) {
    const unchanged = fillEmptyExamples(value);
    assert.deepEqual(unchanged.changedIds, []);
    assert.strictEqual(unchanged.content, value);
  }
  assert.throws(() => fillEmptyExamples({ customSections: [] }), /格式不正确/);
});

test("重复执行不产生新变更或复制对象，当前仓库快照已有文字也不被替换", () => {
  const first = fillEmptyExamples(fixture());
  const again = fillEmptyExamples(first.content);
  assert.deepEqual(again.changedIds, []);
  assert.strictEqual(again.content, first.content);
  const current = fillEmptyExamples(snapshot);
  for (const update of EXAMPLE_UPDATES) {
    const original = target(snapshot, update);
    if (original?.[field(update)]?.trim()) assert.equal(target(current.content, update)[field(update)], original[field(update)]);
  }
  assert.deepEqual(fillEmptyExamples(current.content).changedIds, []);
});

test("七个示例在概览完整详情及电脑手机未保存预览中均显示标注", () => {
  const value = fillEmptyExamples(fixture()).content;
  const education = value.customSections.find((item) => item.id === "education");
  for (const update of EXAMPLE_UPDATES) {
    let pages;
    if (update.kind === "archive") {
      const section = target(value, update);
      const index = value.archives.indexOf(section);
      const Detail = section.slug === "updates" ? NewsListContent : ArchiveDetailContent;
      pages = [
        render(ArchiveOverview, { content: value, kind: section.homeAnchor }),
        render(Detail, { content: value, section }),
        ...[false, true].flatMap((mobile) => [preview(value, section.homeAnchor, null, { mobile }), preview(value, section.homeAnchor, index, { mobile })]),
      ];
    } else {
      const item = target(value, update);
      pages = [
        render(EducationContent, { section: education }),
        render(EducationDetail, { section: education, item }),
        ...[false, true].flatMap((mobile) => [preview(value, "custom-education", null, { mobile }), preview(value, "custom-education", null, { mobile, educationDetailId: update.id, educationActiveId: update.id })]),
      ];
    }
    for (const html of pages) {
      assert.ok(html.includes(update.text), update.id);
      assert.match(html, /【示例，仅作展示】/);
    }
  }
});

test("填示例不创建或发布新闻，首页最新动态不变且研究进展仍无文章", () => {
  const source = fixture();
  const result = fillEmptyExamples(source).content;
  assert.deepEqual(result.archives.map((item) => item.newsArticles), source.archives.map((item) => item.newsArticles));
  assert.deepEqual(selectHomeNews(result.archives), selectHomeNews(source.archives));
  const updates = result.archives.find((item) => item.slug === "updates");
  assert.deepEqual(updates.newsArticles, []);
  assert.equal(updates.summary, source.archives.find((item) => item.slug === "updates").summary);
  const html = render(NewsListContent, { content: result, section: updates });
  assert.match(html, /【示例，仅作展示】/);
  assert.match(html, /尚无已发布的新闻稿。/);
  assert.doesNotMatch(html, /class="detail-news-row"/);
});

async function databaseFixture(live, seed = fixture(), race = false) {
  const directory = await mkdtemp(join(temp, "local-"));
  const snapshotPath = join(directory, "snapshot.json");
  const backupDirectory = join(directory, "backups");
  await writeFile(snapshotPath, JSON.stringify(seed, null, 2) + "\n");
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE site_content (id INTEGER PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL)");
  sqlite.prepare("INSERT INTO site_content VALUES (1, ?, ?)").run(JSON.stringify(live), "original-row-version");
  const queries = [];
  const racingContent = { ...structuredClone(live), siteName: "同时编辑的新团队名", revision: "concurrent-version" };
  const database = {
    prepare(sql) {
      assert.match(sql, /site_content/);
      queries.push(sql);
      return {
        params: [], bind(...params) { this.params = params; return this; },
        async first() { return sqlite.prepare(sql).get(...this.params); },
        async run() {
          assert.equal((await readdir(backupDirectory)).length, 1, "首次数据库写入前必须完成完整备份");
          if (race) sqlite.prepare("UPDATE site_content SET data = ?, updated_at = ? WHERE id = 1").run(JSON.stringify(racingContent), "concurrent-version");
          return { meta: { changes: Number(sqlite.prepare(sql).run(...this.params).changes) } };
        },
      };
    },
  };
  return {
    database, queries, options: { snapshotPath, backupDirectory }, racingContent,
    row: () => ({ ...sqlite.prepare("SELECT * FROM site_content WHERE id = 1").get() }),
    close: () => sqlite.close(),
  };
}

test("本地执行使用当前数据库并先备份，只修改允许字段和版本，重跑不再写入", async () => {
  const live = fixture();
  live.archives.find((item) => item.slug === "projects").description = "数据库已有项目说明";
  const seed = fixture();
  const f = await databaseFixture(live, seed);
  try {
    const before = f.row();
    const originalSnapshot = await readFile(f.options.snapshotPath, "utf8");
    const result = await fillLocalExamples(f.database, f.options);
    assert.deepEqual([...result.liveIds].sort(), expectedIds.filter((id) => id !== "projects"));
    assert.deepEqual([...result.snapshotIds].sort(), expectedIds);
    const stored = f.row();
    assert.notEqual(stored.updated_at, before.updated_at);
    assert.equal(result.revision, stored.updated_at);
    assert.deepEqual(JSON.parse(stored.data), { ...fillEmptyExamples(live).content, revision: result.revision });
    assert.deepEqual(JSON.parse(await readFile(f.options.snapshotPath, "utf8")), fillEmptyExamples(seed).content);
    const backup = JSON.parse(await readFile(result.backupPath, "utf8"));
    assert.deepEqual(backup.siteContentRow, before);
    assert.equal(backup.initialSnapshot, originalSnapshot);
    assert.match(f.queries.find((sql) => sql.startsWith("UPDATE")), /AND updated_at = \?/);
    const unchangedSnapshot = await readFile(f.options.snapshotPath, "utf8");
    const repeated = await fillLocalExamples(f.database, f.options);
    assert.deepEqual(repeated.liveIds, []);
    assert.deepEqual(repeated.snapshotIds, []);
    assert.equal(repeated.backupPath, null);
    assert.deepEqual(f.row(), stored);
    assert.equal(await readFile(f.options.snapshotPath, "utf8"), unchangedSnapshot);
    assert.equal((await readdir(f.options.backupDirectory)).length, 1);
  } finally { f.close(); }
});

test("数据库版本冲突时保留并发修改和原始快照，备份仍可恢复", async () => {
  const f = await databaseFixture(fixture(), fixture(), true);
  try {
    const before = f.row();
    const originalSnapshot = await readFile(f.options.snapshotPath, "utf8");
    await assert.rejects(fillLocalExamples(f.database, f.options), /版本已变更/);
    assert.deepEqual(JSON.parse(f.row().data), f.racingContent);
    assert.equal(f.row().updated_at, "concurrent-version");
    assert.equal(await readFile(f.options.snapshotPath, "utf8"), originalSnapshot);
    const backups = await readdir(f.options.backupDirectory);
    assert.equal(backups.length, 1);
    const backup = JSON.parse(await readFile(join(f.options.backupDirectory, backups[0]), "utf8"));
    assert.deepEqual(backup.siteContentRow, before);
    assert.equal(backup.initialSnapshot, originalSnapshot);
  } finally { f.close(); }
});
