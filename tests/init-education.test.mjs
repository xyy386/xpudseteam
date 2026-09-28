import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { addEducationSection, createEducationSection, initializeEducation, openLocalEducationDatabase } from "../scripts/init-education.mjs";

function sourceContent() {
  return {
    revision: "original-revision", syncBaseRevision: "synced-before",
    siteName: "原团队名", hero: { detail: "原首页简介", featureTitle: "旧宣传文字" },
    contact: "原联系方式", contactDetails: { person: "原联系人" },
    members: [{ name: "原成员" }], directions: [{ slug: "original-direction" }],
    archives: [{ slug: "events", newsArticles: [{ id: "existing", status: "draft", body: "原新闻正文" }] }],
    customSections: [{ id: "existing-section", title: "原栏目", items: [{ title: "原条目" }], subsections: [] }],
    retainedUnknownField: { nested: [1, "额外已有数据"] },
  };
}

function fixture(content) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE site_content (id INTEGER PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL)");
  if (content) sqlite.prepare("INSERT INTO site_content VALUES (1, ?, ?)").run(JSON.stringify(content), "row-revision");
  const queries = [];
  const backups = [];
  const database = {
    prepare(sql) {
      assert.match(sql, /site_content/);
      assert.doesNotMatch(sql, /editor_accounts|editor_sessions/);
      queries.push(sql);
      return {
        params: [], bind(...params) { this.params = params; return this; },
        async first() { return sqlite.prepare(sql).get(...this.params) ?? null; },
        async run() {
          assert.ok(backups.length, "a backup must be completed before any write");
          const result = sqlite.prepare(sql).run(...this.params);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
      };
    },
  };
  return {
    sqlite, database, queries, backups,
    backup: async snapshot => { backups.push(structuredClone(snapshot)); return "/test-backup/site-content.json"; },
    row: () => sqlite.prepare("SELECT * FROM site_content WHERE id = 1").get(),
    close: () => sqlite.close(),
  };
}

test("人才培养初始结构有固定栏目及子栏目 ID，内容字段为空", () => {
  const education = createEducationSection();
  assert.deepEqual(education, {
    id: "education", title: "人才培养", english: "", intro: "", body: "", image: "", items: [],
    subsections: [
      { id: "education-courses", title: "教学课程", body: "", image: "", url: "", items: [] },
      { id: "education-student-awards", title: "学生获奖", body: "", image: "", url: "", items: [] },
      { id: "education-graduate-destinations", title: "毕业生去向", body: "", image: "", url: "", items: [] },
      { id: "education-teaching-awards", title: "教学获奖", body: "", image: "", url: "", items: [] },
    ],
  });
  education.subsections[0].items.push({ title: "独立对象" });
  assert.deepEqual(createEducationSection().subsections[0].items, []);
});

test("纯增量更新不修改来源对象或其他栏目", () => {
  const source = sourceContent();
  const before = structuredClone(source);
  const added = addEducationSection(source);
  assert.equal(added.changed, true);
  assert.deepEqual(source, before);
  assert.deepEqual(added.content, { ...before, customSections: [...before.customSections, createEducationSection()] });
  const repeated = addEducationSection(added.content);
  assert.equal(repeated.changed, false);
  assert.strictEqual(repeated.content, added.content);
  assert.throws(() => addEducationSection({ customSections: {} }), /数据格式/);
  assert.throws(() => addEducationSection(null), /有效对象/);
});

test("当前有效数据库内容优先，增量追加前完整备份并同步版本", async () => {
  const original = sourceContent();
  const f = fixture(original);
  try {
    const before = { ...f.row() };
    const result = await initializeEducation(f.database, { fallbackContent: { siteName: "不得覆盖数据库的旧快照" }, backup: f.backup });
    const stored = f.row();
    assert.equal(result.changed, true);
    assert.equal(result.created, false);
    assert.equal(result.backupPath, "/test-backup/site-content.json");
    assert.notEqual(stored.updated_at, "row-revision");
    assert.deepEqual(JSON.parse(stored.data), {
      ...original, revision: stored.updated_at, customSections: [...original.customSections, createEducationSection()],
    });
    assert.equal(result.revision, stored.updated_at);
    assert.deepEqual(f.backups[0].siteContentRow, before);
    assert.match(f.queries.find(sql => sql.startsWith("UPDATE")), /AND updated_at = \?/);
  } finally { f.close(); }
});

test("重复初始化不写数据库、不生成备份或改动版本", async () => {
  const f = fixture(sourceContent());
  try {
    await initializeEducation(f.database, { backup: f.backup });
    const before = { ...f.row() };
    const writes = f.queries.filter(sql => /^(UPDATE|INSERT)/.test(sql)).length;
    const repeated = await initializeEducation(f.database, { backup: f.backup });
    assert.equal(repeated.changed, false);
    assert.equal(repeated.backupPath, null);
    assert.deepEqual({ ...f.row() }, before);
    assert.equal(f.backups.length, 1);
    assert.equal(f.queries.filter(sql => /^(UPDATE|INSERT)/.test(sql)).length, writes);
  } finally { f.close(); }
});

test("已有栏目修改、子项新增删除及排序后再初始化全部原样保留", async () => {
  const original = sourceContent();
  const education = createEducationSection();
  education.title = "自定义人才培养名称";
  education.body = "已填正文";
  education.intro = "已填栏目介绍";
  education.items.push({ title: "已添加顶层条目", image: "/existing.png" });
  education.subsections.splice(1, 1);
  education.subsections.reverse();
  education.subsections[0].body = "已填教学成果";
  education.subsections.push({ id: "added-by-user", title: "用户新增子项", body: "保留新内容", items: [] });
  original.customSections.unshift(education);
  const f = fixture(original);
  try {
    const before = { ...f.row() };
    const result = await initializeEducation(f.database, { fallbackContent: addEducationSection(sourceContent()).content, backup: f.backup });
    assert.equal(result.changed, false);
    assert.deepEqual({ ...f.row() }, before);
    assert.deepEqual(JSON.parse(f.row().data).customSections[0], education);
    assert.equal(f.backups.length, 0);
  } finally { f.close(); }
});

test("已有空人才培养栏目不会重新补回子栏目", async () => {
  const original = sourceContent();
  original.customSections.push({ id: "education", title: "保留空栏目", subsections: [] });
  const f = fixture(original);
  try {
    await initializeEducation(f.database, { backup: f.backup });
    assert.deepEqual(JSON.parse(f.row().data), original);
  } finally { f.close(); }
});

test("没有 site_content 行时从完整初始快照插入，不丢失其他字段", async () => {
  const original = addEducationSection(sourceContent()).content;
  const f = fixture();
  try {
    const result = await initializeEducation(f.database, { fallbackContent: original, backup: f.backup });
    assert.equal(result.created, true);
    assert.deepEqual(JSON.parse(f.row().data), { ...original, revision: result.revision });
    assert.equal(f.backups[0].siteContentRow, null);
    assert.deepEqual(f.backups[0].initialContent, original);
    assert.match(f.queries.find(sql => sql.startsWith("INSERT")), /ON CONFLICT\(id\) DO NOTHING/);
  } finally { f.close(); }
});

test("无数据库行且快照不含人才培养时追加后保留完整内容", async () => {
  const original = sourceContent();
  const f = fixture();
  try {
    const result = await initializeEducation(f.database, { fallbackContent: original, backup: f.backup });
    assert.deepEqual(JSON.parse(f.row().data), { ...addEducationSection(original).content, revision: result.revision });
  } finally { f.close(); }
});

test("备份后发生并发编辑时 CAS 拒绝覆盖且保留备份", async () => {
  const f = fixture(sourceContent());
  const changed = { ...sourceContent(), siteName: "并发编辑后的团队名" };
  try {
    await assert.rejects(initializeEducation(f.database, { backup: async snapshot => {
      const backupPath = await f.backup(snapshot);
      f.sqlite.prepare("UPDATE site_content SET data = ?, updated_at = ? WHERE id = 1").run(JSON.stringify(changed), "concurrent-revision");
      return backupPath;
    } }), error => error.code === "EDUCATION_INIT_CONFLICT" && error.backupPath === "/test-backup/site-content.json");
    assert.deepEqual(JSON.parse(f.row().data), changed);
    assert.equal(f.row().updated_at, "concurrent-revision");
    assert.equal(f.backups.length, 1);
  } finally { f.close(); }
});

test("首次插入发生竞争时保留别人新建的完整记录", async () => {
  const f = fixture();
  const concurrent = { ...sourceContent(), contact: "并发新建的联系信息" };
  try {
    await assert.rejects(initializeEducation(f.database, { fallbackContent: sourceContent(), backup: async snapshot => {
      const backupPath = await f.backup(snapshot);
      f.sqlite.prepare("INSERT INTO site_content VALUES (1, ?, ?)").run(JSON.stringify(concurrent), "concurrent-insert");
      return backupPath;
    } }), { code: "EDUCATION_INIT_CONFLICT" });
    assert.deepEqual(JSON.parse(f.row().data), concurrent);
    assert.equal(f.row().updated_at, "concurrent-insert");
  } finally { f.close(); }
});

test("备份失败或内容格式异常时不进行任何写入", async () => {
  const f = fixture(sourceContent());
  try {
    const before = { ...f.row() };
    await assert.rejects(initializeEducation(f.database, { backup: async () => { throw new Error("备份目录不可写"); } }), /备份目录不可写/);
    assert.deepEqual({ ...f.row() }, before);
    assert.equal(f.queries.filter(sql => /^(UPDATE|INSERT)/.test(sql)).length, 0);
    f.sqlite.prepare("UPDATE site_content SET data = ? WHERE id = 1").run(JSON.stringify({ customSections: "错误格式" }));
    await assert.rejects(initializeEducation(f.database, { backup: f.backup }), /数据格式/);
    assert.equal(f.backups.length, 0);
  } finally { f.close(); }
});

test("初始 JSON 快照含唯一固定人才培养栏目，后续增量初始化保持原样", async () => {
  const snapshot = JSON.parse(await readFile(new URL("../app/saved-content.json", import.meta.url), "utf8"));
  const education = snapshot.customSections.filter(section => section.id === "education");
  assert.equal(education.length, 1);
  assert.deepEqual(education[0].subsections.map(section => section.id), createEducationSection().subsections.map(section => section.id));
  const before = structuredClone(snapshot);
  const result = addEducationSection(snapshot);
  assert.equal(result.changed, false);
  assert.strictEqual(result.content, snapshot);
  assert.deepEqual(result.content, before);
});

test("初始化入口拒绝远程模式及线上标识，不打开真实数据库", async () => {
  for (const options of [{}, { remote: true }, { local: true, remote: true }, { local: true, "account-id": "example" }, { local: true, "database-id": "example" }]) {
    await assert.rejects(openLocalEducationDatabase(options), /仅支持 --local/);
  }
  const script = fileURLToPath(new URL("../scripts/init-education.mjs", import.meta.url));
  const rejected = spawnSync(process.execPath, [script, "--remote"], { encoding: "utf8" });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Unknown option '--remote'/);
  const help = spawnSync(process.execPath, [script, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /仅增量初始化本地/);
});
