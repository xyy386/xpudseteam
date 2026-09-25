import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { projectRoot, defaultStatePath, readLocalDataDir, settingsPath } from "./local-data-location.mjs";

const selected = process.argv[2];
if (!selected || (selected !== "--default" && !path.isAbsolute(selected))) {
  console.error("用法：node scripts/move-local-data.mjs /目标文件夹（须为绝对路径），或 --default");
  process.exit(2);
}
const port = Number(process.env.RESEARCH_SITE_PREVIEW_PORT || "5173");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("本地预览端口无效");
const source = path.resolve(readLocalDataDir());
const target = selected === "--default" ? defaultStatePath : path.join(path.resolve(selected), "research-team-site-data");
if (source === target) {
  console.log("本地数据已在该位置，无需迁移：" + source);
  process.exit(0);
}
if (target.startsWith(source + path.sep) || source.startsWith(target + path.sep)) {
  throw new Error("目标位置不能位于当前数据目录内部，当前目录也不能位于目标目录内部");
}

function listenerPid() {
  try {
    const text = execFileSync("lsof", ["-nP", "-t", "-iTCP:" + port, "-sTCP:LISTEN"], { encoding: "utf8" }).trim();
    const pids = [...new Set(text.split(/\s+/).filter(Boolean))];
    if (pids.length > 1) throw new Error("预览端口被多个进程占用");
    return pids.length ? Number(pids[0]) : null;
  } catch (error) {
    if (error?.status === 1) return null;
    throw error;
  }
}
function assertProjectProcess(pid) {
  const output = execFileSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { encoding: "utf8" });
  const cwd = output.split("\n").find((line) => line.startsWith("n"))?.slice(1);
  if (!cwd || path.resolve(cwd) !== path.resolve(projectRoot)) {
    throw new Error("预览端口被其他项目占用，已停止迁移以免关闭无关进程");
  }
}
async function stopPreview() {
  const pid = listenerPid();
  if (!pid) return;
  assertProjectProcess(pid);
  process.kill(pid, "SIGTERM");
  for (let index = 0; index < 50; index++) {
    if (!listenerPid()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("本地预览未能在 10 秒内停止，数据位置未更改");
}
function startPreview() {
  const script = path.join(projectRoot, "scripts/ensure-local-preview.sh");
  const result = spawnSync("bash", [script], { cwd: projectRoot, env: process.env, encoding: "utf8" });
  if (result.status !== 0) throw new Error("本地预览启动失败：" + (result.stderr || result.stdout).slice(-2000));
  console.log(result.stdout.trim());
}
async function readSnapshot() {
  const response = await fetch("http://127.0.0.1:" + port + "/api/site-snapshot", {
    headers: { Cookie: "__sites_local_auth=1" }, signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error("本地数据快照读取失败（HTTP " + response.status + "），请确认管理员预览可用");
  const snapshot = await response.json();
  return JSON.stringify({
    content: snapshot.content,
    assets: snapshot.assets.map((item) => ({ path: item.path, sha256: item.sha256, size: item.size })),
  });
}
async function fileManifest(root) {
  const result = [];
  async function walk(directory, relative) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const next = path.join(directory, entry.name);
      const name = path.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw new Error("数据目录包含符号链接，已停止迁移：" + name);
      if (entry.isDirectory()) await walk(next, name);
      else if (entry.isFile()) {
        const bytes = await readFile(next);
        result.push({ name, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
      } else throw new Error("数据目录包含不支持的文件：" + name);
    }
  }
  await walk(root, "");
  return JSON.stringify(result.sort((a, b) => a.name.localeCompare(b.name)));
}
async function exists(file) {
  try { await lstat(file); return true; }
  catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

const originalSettings = await exists(settingsPath) ? await readFile(settingsPath) : null;
let previewStopped = false;
let settingsChanged = false;
let priorTarget = "";
let incoming = "";
try {
  console.log("当前数据：" + source);
  console.log("目标数据：" + target);
  startPreview();
  const before = await readSnapshot();
  await stopPreview();
  previewStopped = true;
  const sourceStat = await lstat(source);
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) throw new Error("当前数据位置不是普通目录");
  const sourceManifest = await fileManifest(source);
  await mkdir(path.dirname(target), { recursive: true });
  incoming = target + ".incoming-" + randomUUID();
  await cp(source, incoming, { recursive: true, errorOnExist: true, force: false });
  if (await fileManifest(incoming) !== sourceManifest) throw new Error("新目录的文件校验失败，原数据未更改");
  if (await exists(target)) {
    priorTarget = target + ".prior-" + Date.now();
    await rename(target, priorTarget);
  }
  await rename(incoming, target);
  incoming = "";
  await mkdir(path.dirname(settingsPath), { recursive: true });
  const temporarySettings = settingsPath + ".tmp-" + randomUUID();
  await writeFile(temporarySettings, JSON.stringify({ path: target }, null, 2) + "\n", { mode: 0o600 });
  await rename(temporarySettings, settingsPath);
  settingsChanged = true;
  startPreview();
  const after = await readSnapshot();
  if (before !== after) throw new Error("重启后网站内容或附件校验与迁移前不一致");
  console.log("迁移完成；内容、图片和附件校验一致。");
  console.log("旧目录已保留备份：" + source);
  if (priorTarget) console.log("目标原有目录也已保留：" + priorTarget);
} catch (error) {
  console.error("迁移未完成：" + (error instanceof Error ? error.message : String(error)));
  if (previewStopped) {
    try { await stopPreview(); } catch (stopError) { console.error("回退前停止预览失败：", stopError); }
  }
  if (settingsChanged) {
    try {
      if (originalSettings) await writeFile(settingsPath, originalSettings);
      else await rm(settingsPath, { force: true });
    } catch (rollbackError) { console.error("恢复原配置失败：", rollbackError); }
  }
  if (priorTarget) {
    try {
      if (await exists(target)) await rename(target, target + ".failed-" + Date.now());
      await rename(priorTarget, target);
    } catch (rollbackError) { console.error("恢复目标原目录失败：", rollbackError); }
  }
  if (incoming) await rm(incoming, { recursive: true, force: true }).catch(() => undefined);
  if (previewStopped) {
    try { startPreview(); } catch (restartError) { console.error("恢复旧位置预览失败：", restartError); }
  }
  process.exitCode = 1;
}
