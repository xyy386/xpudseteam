import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { emitKeypressEvents } from "node:readline";
import { parseArgs } from "node:util";
import { hashPassword, normalizedEmail, validPassword } from "../lib/editor-password.ts";
import { projectRoot, readLocalDataDir } from "./local-data-location.mjs";

const LOCAL_DATABASE_ID = "00000000-0000-4000-8000-000000000000";

export async function maintainOwner(database, action, rawEmail, password) {
  const email = normalizedEmail(rawEmail);
  if (!email || !validPassword(password) || !["init", "reset"].includes(action)) {
    throw new Error("请输入有效邮箱，密码须为 12 至 128 位，操作须为 init 或 reset。");
  }
  const passwordHash = await hashPassword(password);
  const now = Date.now();
  if (action === "init") {
    const result = await database.prepare(`INSERT INTO editor_accounts
      (id, email, role, password_hash, expires_at, created_at, updated_at)
      SELECT ?, ?, 'owner', ?, 0, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM editor_accounts WHERE role = 'owner' OR email = ?)`)
      .bind(crypto.randomUUID(), email, passwordHash, now, now, email).run();
    if (result.meta.changes !== 1) throw new Error("已有管理员或该邮箱已被占用，未创建或覆盖账号。");
  } else {
    const results = await database.batch([
      database.prepare(`UPDATE editor_accounts SET password_hash = ?, failed_attempts = 0,
        locked_until = NULL, updated_at = ? WHERE email = ? AND role = 'owner' AND revoked_at IS NULL`)
        .bind(passwordHash, now, email),
      database.prepare(`DELETE FROM editor_sessions WHERE account_id IN
        (SELECT id FROM editor_accounts WHERE email = ? AND role = 'owner' AND password_hash = ?)`)
        .bind(email, passwordHash),
    ]);
    if (results[0].meta.changes !== 1) throw new Error("未找到有效的管理员账号，未重置任何成员密码。");
  }
}

export async function openAdminDatabase(options, fetcher = fetch) {
  if (Boolean(options.local) === Boolean(options.remote)) throw new Error("必须明确选择 --local 或 --remote。");
  if (options.local) {
    if (options["account-id"] || options["database-id"]) throw new Error("本地模式不接受线上数据库标识。");
    const { Miniflare } = await import("miniflare");
    const manifest = JSON.parse(await readFile(path.join(projectRoot, ".openai/hosting.json"), "utf8"));
    if (manifest.d1 !== "DB") throw new Error("本项目未配置 DB 绑定。");
    const runtime = new Miniflare({
      modules: true,
      script: "",
      d1Databases: { DB: LOCAL_DATABASE_ID },
      d1Persist: path.join(path.resolve(options["persist-to"] || readLocalDataDir()), "v3/d1"),
    });
    try {
      return { database: await runtime.getD1Database("DB"), close: () => runtime.dispose() };
    } catch (error) {
      await runtime.dispose();
      throw error;
    }
  }
  if (options["persist-to"]) throw new Error("线上模式不接受本地数据目录。");
  const accountId = options["account-id"];
  const databaseId = options["database-id"];
  if (!/^[a-fA-F0-9]{32}$/.test(accountId || "") || !/^[a-fA-F0-9-]{36}$/.test(databaseId || "")
    || databaseId === LOCAL_DATABASE_ID) throw new Error("线上维护需要真实的 Cloudflare 账号 ID 和 D1 数据库 ID，不能使用 Sites 项目 ID 或本地占位 ID。");
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("线上维护需要通过受控环境提供具有 D1 写入权限的 CLOUDFLARE_API_TOKEN。");
  async function execute(batch) {
    const response = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ batch }),
    });
    // Never print response bodies: they may contain SQL or password hashes.
    if (!response.ok) throw new Error(`线上数据库请求失败（HTTP ${response.status}），请检查管理权限。`);
    const result = await response.json();
    if (!result.success || !Array.isArray(result.result) || result.result.length !== batch.length
      || result.result.some((item) => !item.success)) throw new Error("线上数据库执行失败；请确认角色迁移已经完成。");
    return result.result;
  }
  const database = {
    prepare(sql) {
      return {
        sql, params: [],
        bind(...params) { this.params = params.map(String); return this; },
        async run() { return (await execute([{ sql: this.sql, params: this.params }]))[0]; },
      };
    },
    batch(statements) { return execute(statements.map(({ sql, params }) => ({ sql, params }))); },
  };
  return { database, close: async () => {} };
}

function hiddenInput(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("请在交互终端运行，密码不接受命令参数、管道或文件输入。");
  emitKeypressEvents(process.stdin);
  const wasRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    function finish(error) {
      process.stdin.off("keypress", onKey);
      process.stdin.setRawMode(Boolean(wasRaw));
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error); else resolve(value);
    }
    function onKey(text, key = {}) {
      if (key.ctrl && ["c", "d"].includes(key.name)) return finish(new Error("操作已取消。"));
      if (key.name === "return" || key.name === "enter") return finish();
      if (key.name === "backspace") { value = Array.from(value).slice(0, -1).join(""); return; }
      if (text && !key.ctrl && !key.meta && !/[\x00-\x1f\x7f]/.test(text)) value += text;
    }
    process.stdin.on("keypress", onKey);
    // Disable terminal echo and attach the listener before the prompt can be seen.
    process.stdout.write(prompt);
  });
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    email: { type: "string" }, local: { type: "boolean" }, remote: { type: "boolean" },
    "persist-to": { type: "string" }, "account-id": { type: "string" }, "database-id": { type: "string" },
    help: { type: "boolean" },
  } });
  if (values.help) {
    console.log("node --experimental-strip-types scripts/editor-admin.mjs init|reset --email 邮箱 --local [--persist-to 数据目录]\n线上：将 --local 替换为 --remote --account-id Cloudflare账号ID --database-id D1数据库ID；通过受控环境提供 CLOUDFLARE_API_TOKEN。\n需先应用数据库迁移。密码在终端隐藏输入两次，不接受密码参数。");
    return;
  }
  if (positionals.length !== 1 || !["init", "reset"].includes(positionals[0]) || !normalizedEmail(values.email)) {
    throw new Error("请指定 init 或 reset、--email 以及目标环境；使用 --help 查看用法。");
  }
  const connection = await openAdminDatabase(values);
  try {
    console.log(`目标：${values.local ? "本地数据库" : "线上数据库"}；操作：${positionals[0]}；邮箱：${normalizedEmail(values.email)}`);
    let password = await hiddenInput("新密码（12 至 128 位，不显示输入）：");
    if (!validPassword(password)) throw new Error("密码须为 12 至 128 位。");
    if (password !== await hiddenInput("再次输入新密码：")) throw new Error("两次密码不一致，未修改账号。");
    await maintainOwner(connection.database, positionals[0], values.email, password);
    password = "";
    console.log(positionals[0] === "init" ? "管理员已创建，请通过 /login 登录。" : "管理员密码已重置，原有会话全部失效。");
  } finally { await connection.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    // Database drivers can embed SQL and parameter values in diagnostic errors.
    const safe = error instanceof Error && !/sql|d1_|pbkdf2|constraint|syntax|column|table/i.test(error.message);
    console.error(safe ? error.message : "账号维护失败，请先确认数据库迁移、目标环境和管理权限；未输出数据库诊断以保护凭据。");
    process.exitCode = 1;
  });
}
