import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { openLocalEducationDatabase } from "./init-education.mjs";
import { projectRoot } from "./local-data-location.mjs";

export const EXAMPLE_UPDATES = [
  { kind: "archive", id: "publications", text: "【示例，仅作展示】《数据驱动的微分方程数值求解方法》——探索数据方法与传统数值算法的结合。" },
  { kind: "archive", id: "projects", text: "【示例，仅作展示】复杂动力系统的数据驱动建模与仿真——开展模型构建、数值计算与结果验证。" },
  { kind: "archive", id: "awards", text: "【示例，仅作展示】某项数值计算研究成果获得校级科研成果奖。" },
  { kind: "archive", id: "updates", text: "【示例，仅作展示】完成某数值模型的初步验证，并整理阶段性研究结果。" },
  { kind: "education", id: "education-student-awards", text: "【示例，仅作展示】某同学参加全国大学生数学建模竞赛，获得省级二等奖。" },
  { kind: "education", id: "education-graduate-destinations", text: "【示例，仅作展示】某同学硕士毕业后，进入某高校继续攻读博士学位。" },
  { kind: "education", id: "education-teaching-awards", text: "【示例，仅作展示】某教师主持的数值计算课程建设项目获得校级教学成果奖。" },
];

// Only this explicitly invoked local script supplies examples; normal reads never seed content.
export function fillEmptyExamples(content) {
  if (!content || typeof content !== "object" || !Array.isArray(content.archives)) {
    throw new Error("网站内容格式不正确，未填写示例。");
  }
  const next = structuredClone(content);
  const education = next.customSections?.find((item) => item.id === "education");
  const changedIds = [];
  for (const example of EXAMPLE_UPDATES) {
    const item = example.kind === "archive"
      ? next.archives.find((item) => item.slug === example.id)
      : education?.subsections?.find((item) => item.id === example.id);
    const field = example.kind === "archive" ? "description" : "body";
    if (!item || (item[field] != null && typeof item[field] !== "string") || item[field]?.trim()) continue;
    item[field] = example.text;
    changedIds.push(example.id);
  }
  return { content: changedIds.length ? next : content, changedIds };
}

export async function fillLocalExamples(database, {
  snapshotPath = path.join(projectRoot, "app/saved-content.json"),
  backupDirectory = path.join(projectRoot, ".sites-runtime/content-example-backups"),
} = {}) {
  const snapshotRaw = await readFile(snapshotPath, "utf8");
  const snapshot = fillEmptyExamples(JSON.parse(snapshotRaw));
  const row = await database.prepare("SELECT id, data, updated_at FROM site_content WHERE id = 1").first();
  if (!row) throw new Error("未找到本地网站内容，未填写示例。");
  const live = fillEmptyExamples(JSON.parse(row.data));
  if (!live.changedIds.length && !snapshot.changedIds.length) {
    return { liveIds: [], snapshotIds: [], revision: row.updated_at, backupPath: null };
  }

  await mkdir(backupDirectory, { recursive: true });
  const backupPath = path.join(backupDirectory, `before-examples-${crypto.randomUUID()}.json`);
  await writeFile(backupPath, JSON.stringify({
    purpose: "before-local-example-content", savedAt: new Date().toISOString(),
    siteContentRow: row, initialSnapshot: snapshotRaw,
  }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  if (await readFile(snapshotPath, "utf8") !== snapshotRaw) throw new Error("初始快照已变更，未覆盖，请重新执行。");

  let revision = row.updated_at;
  if (live.changedIds.length) {
    revision = crypto.randomUUID();
    const result = await database.prepare("UPDATE site_content SET data = ?, updated_at = ? WHERE id = 1 AND updated_at = ?")
      .bind(JSON.stringify({ ...live.content, revision }), revision, row.updated_at).run();
    if (result.meta?.changes !== 1) throw new Error("本地内容版本已变更，未覆盖新内容或初始快照，请重新执行。");
  }
  if (snapshot.changedIds.length) {
    if (await readFile(snapshotPath, "utf8") !== snapshotRaw) throw new Error("本地数据已更新，但初始快照发生冲突，未覆盖，请重新执行。");
    const tempPath = `${snapshotPath}.${crypto.randomUUID()}.tmp`;
    await writeFile(tempPath, JSON.stringify(snapshot.content, null, 2) + "\n", { flag: "wx" });
    await rename(tempPath, snapshotPath);
  }
  return { liveIds: live.changedIds, snapshotIds: snapshot.changedIds, revision, backupPath };
}

async function main() {
  const { values } = parseArgs({ options: { local: { type: "boolean" }, help: { type: "boolean" } } });
  if (values.help) {
    console.log("node scripts/fill-empty-examples.mjs --local\n仅填写7个指定空字段并同步初始快照；保留非空内容与已删除栏目，写入前备份并检查版本。不会发布新闻或部署站点。");
    return;
  }
  if (!values.local) throw new Error("示例填写仅支持 --local。");
  const connection = await openLocalEducationDatabase({ local: true });
  try {
    console.log(JSON.stringify(await fillLocalExamples(connection.database), null, 2));
  } finally { await connection.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
