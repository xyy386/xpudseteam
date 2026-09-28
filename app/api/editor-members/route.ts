import { env } from "cloudflare:workers";
import { hashPassword, isSiteOwner, normalizedEmail, randomSecret, sameOrigin } from "../../editor-credentials";

export const dynamic = "force-dynamic";

function database() {
  if (!env.DB) throw new Error("内容数据库不可用");
  return env.DB;
}

type MemberRow = { id: string; email: string; expires_at: number; revoked_at: number | null; created_at: number };
function publicMember(row: MemberRow) {
  return { id: row.id, email: row.email, expiresAt: row.expires_at, revokedAt: row.revoked_at, createdAt: row.created_at };
}

function validDays(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 365 ? Number(value) : null;
}

export async function GET() {
  if (!(await isSiteOwner())) return Response.json({ error: "仅管理员可管理成员" }, { status: 403 });
  try {
    const result = await database().prepare("SELECT id, email, expires_at, revoked_at, created_at FROM editor_accounts WHERE role = 'member' ORDER BY created_at DESC").all<MemberRow>();
    return Response.json({ members: result.results.map(publicMember) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("List members failed", error);
    return Response.json({ error: "成员列表暂时不可用" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!(await isSiteOwner())) return Response.json({ error: "仅管理员可管理成员" }, { status: 403 });
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  try {
    const body = await request.json() as { email?: unknown; days?: unknown };
    const email = normalizedEmail(body.email);
    const days = validDays(body.days);
    if (!email || !days) return Response.json({ error: "请输入有效邮箱及 1 至 365 天的有效期" }, { status: 400 });
    const current = await database().prepare("SELECT id FROM editor_accounts WHERE email = ?").bind(email).first<{ id: string }>();
    if (current) return Response.json({ error: "该邮箱已有账号，不能重复创建" }, { status: 409 });
    const now = Date.now();
    const password = randomSecret(18);
    const id = crypto.randomUUID();
    const expiresAt = now + days * 86_400_000;
    await database().prepare("INSERT INTO editor_accounts (id, email, role, password_hash, expires_at, created_at, updated_at) VALUES (?, ?, 'member', ?, ?, ?, ?)")
      .bind(id, email, await hashPassword(password), expiresAt, now, now).run();
    return Response.json({ member: { id, email, expiresAt, revokedAt: null, createdAt: now }, initialPassword: password }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Create member failed", error);
    return Response.json({ error: "创建成员失败，请重试" }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isSiteOwner())) return Response.json({ error: "仅管理员可管理成员" }, { status: 403 });
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  try {
    const body = await request.json() as { id?: unknown; action?: unknown; days?: unknown };
    if (typeof body.id !== "string") return Response.json({ error: "成员编号无效" }, { status: 400 });
    const row = await database().prepare("SELECT id, email, expires_at, revoked_at, created_at FROM editor_accounts WHERE id = ? AND role = 'member'").bind(body.id).first<MemberRow>();
    if (!row) return Response.json({ error: "成员不存在" }, { status: 404 });
    const now = Date.now();
    if (body.action === "renew") {
      const days = validDays(body.days);
      if (!days) return Response.json({ error: "请输入 1 至 365 天的续期天数" }, { status: 400 });
      const expiresAt = Math.max(now, row.expires_at) + days * 86_400_000;
      await database().prepare("UPDATE editor_accounts SET expires_at = ?, revoked_at = NULL, updated_at = ? WHERE id = ? AND role = 'member'").bind(expiresAt, now, row.id).run();
      return Response.json({ ok: true, expiresAt });
    }
    if (body.action === "revoke") {
      await database().batch([
        database().prepare("UPDATE editor_accounts SET revoked_at = ?, updated_at = ? WHERE id = ? AND role = 'member'").bind(now, now, row.id),
        database().prepare("DELETE FROM editor_sessions WHERE account_id = ? AND account_id IN (SELECT id FROM editor_accounts WHERE role = 'member')").bind(row.id),
      ]);
      return Response.json({ ok: true });
    }
    if (body.action === "reset") {
      const password = randomSecret(18);
      await database().batch([
        database().prepare("UPDATE editor_accounts SET password_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ? AND role = 'member'")
          .bind(await hashPassword(password), now, row.id),
        database().prepare("DELETE FROM editor_sessions WHERE account_id = ? AND account_id IN (SELECT id FROM editor_accounts WHERE role = 'member')").bind(row.id),
      ]);
      return Response.json({ ok: true, initialPassword: password }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "操作无效" }, { status: 400 });
  } catch (error) {
    console.error("Update member failed", error);
    return Response.json({ error: "成员操作失败，请重试" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isSiteOwner())) return Response.json({ error: "仅管理员可管理成员" }, { status: 403 });
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  try {
    const body = await request.json() as { id?: unknown };
    if (typeof body.id !== "string") return Response.json({ error: "成员编号无效" }, { status: 400 });
    const member = await database().prepare("SELECT id FROM editor_accounts WHERE id = ? AND role = 'member'").bind(body.id).first();
    if (!member) return Response.json({ error: "成员不存在" }, { status: 404 });
    await database().batch([
      database().prepare("DELETE FROM editor_sessions WHERE account_id = ? AND account_id IN (SELECT id FROM editor_accounts WHERE role = 'member')").bind(body.id),
      database().prepare("DELETE FROM editor_accounts WHERE id = ? AND role = 'member'").bind(body.id),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Delete member failed", error);
    return Response.json({ error: "删除成员失败，请重试" }, { status: 503 });
  }
}
