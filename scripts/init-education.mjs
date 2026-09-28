import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { projectRoot, readLocalDataDir } from "./local-data-location.mjs";

const LOCAL_DATABASE_ID = "00000000-0000-4000-8000-000000000000";
const backupDirectory = path.join(projectRoot, ".sites-runtime/education-backups");

export function createEducationSection() {
  return {
    id: "education", title: "人才培养", english: "", intro: "", body: "", image: "", items: [],
    subsections: [
      ["courses", "教学课程"],
      ["student-awards", "学生获奖"],
      ["graduate-destinations", "毕业生去向"],
      ["teaching-awards", "教学获奖"],
    ].map(([id, title]) => ({ id: `education-${id}`, title, body: "", image: "", url: "", items: [] })),
  };
}

export function addEducationSection(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw new Error("网站内容不是有效对象，未进行初始化。");
  }
  if (content.customSections !== undefined && !Array.isArray(content.customSections)) {
    throw new Error("自定义栏目数据格式不正确，未进行初始化。");
  }
  const sections = content.customSections ?? [];
  if (sections.some((section) => section?.id === "education")) return { content, changed: false };
  return { content: { ...content, customSections: [...sections, createEducationSection()] }, changed: true };
}

async function backupLocalContent(snapshot) {
  await mkdir(backupDirectory, { recursive: true });
  const filename = `site-content-before-education-${new Date().toISOString().replaceAll(":", "-")}-${crypto.randomUUID()}.json`;
  const backupPath = path.join(backupDirectory, filename);
  await writeFile(backupPath, JSON.stringify(snapshot, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return backupPath;
}

export async function initializeEducation(database, { fallbackContent, backup = backupLocalContent } = {}) {
  const row = await database.prepare("SELECT id, data, updated_at FROM site_content WHERE id = 1").first();
  const current = row ? JSON.parse(row.data) : fallbackContent;
  const result = addEducationSection(current);
  if (row && !result.changed) return { changed: false, created: false, revision: row.updated_at, backupPath: null };

  // Keep the exact row, including its serialized data, so a failed CAS remains recoverable.
  const backupPath = await backup({
    purpose: "before-local-education-initialization", savedAt: new Date().toISOString(),
    siteContentRow: row ? { id: row.id, data: row.data, updated_at: row.updated_at } : null,
    ...(row ? {} : { initialContent: current }),
  });
  const revision = crypto.randomUUID();
  const next = { ...result.content, revision };
  const update = row
    ? await database.prepare("UPDATE site_content SET data = ?, updated_at = ? WHERE id = 1 AND updated_at = ?")
      .bind(JSON.stringify(next), revision, row.updated_at).run()
    : await database.prepare("INSERT INTO site_content (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO NOTHING")
      .bind(JSON.stringify(next), revision).run();
  if (update.meta?.changes !== 1) {
    const error = new Error("网站内容在初始化期间已更新，未覆盖新内容。请检查后重新运行本地初始化。");
    error.code = "EDUCATION_INIT_CONFLICT";
    error.backupPath = backupPath;
    throw error;
  }
  return { changed: true, created: !row, revision, backupPath };
}

export async function openLocalEducationDatabase(options) {
  if (!options?.local || options.remote || options["account-id"] || options["database-id"]) {
    throw new Error("人才培养初始化仅支持 --local，不接受远程数据库或账号标识。");
  }
  const manifest = JSON.parse(await readFile(path.join(projectRoot, ".openai/hosting.json"), "utf8"));
  if (manifest.d1 !== "DB") throw new Error("本项目未配置 DB 绑定。");
  const { Miniflare } = await import("miniflare");
  const runtime = new Miniflare({
    modules: true, script: "", d1Databases: { DB: LOCAL_DATABASE_ID },
    d1Persist: path.join(path.resolve(options["persist-to"] || readLocalDataDir()), "v3/d1"),
  });
  try {
    return { database: await runtime.getD1Database("DB"), close: () => runtime.dispose() };
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    local: { type: "boolean" }, "persist-to": { type: "string" }, help: { type: "boolean" },
  } });
  if (values.help) {
    console.log("node scripts/init-education.mjs --local [--persist-to 数据目录]\n仅增量初始化本地 site_content 的人才培养栏目；已有栏目保持原样。写入前备份到 .sites-runtime/education-backups，并检查内容版本以避免覆盖同时发生的编辑。不会修改账号或会话。");
    return;
  }
  const fallbackContent = JSON.parse(await readFile(path.join(projectRoot, "app/saved-content.json"), "utf8"));
  const connection = await openLocalEducationDatabase(values);
  try {
    const result = await initializeEducation(connection.database, { fallbackContent });
    console.log(result.changed ? "本地人才培养栏目已初始化。" : "本地已有人才培养栏目，全部内容保持原样。");
    if (result.backupPath) console.log(`初始化前备份：${result.backupPath}`);
  } finally { await connection.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.code === "EDUCATION_INIT_CONFLICT" || error.code?.startsWith("ERR_PARSE_ARGS")
      || /仅支持|未配置|不是有效对象|数据格式不正确/.test(error.message)
      ? error.message : "本地人才培养初始化失败；请检查本地数据目录及数据库迁移。未输出数据库内容。");
    if (error.backupPath) console.error(`初始化前备份：${error.backupPath}`);
    process.exitCode = 1;
  });
}
