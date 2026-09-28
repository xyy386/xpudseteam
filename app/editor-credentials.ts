import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { randomSecret, sha256, verifyPassword, hashPassword, validPassword } from "../lib/editor-password";
export { randomSecret, sha256, hashPassword, normalizedEmail, validPassword } from "../lib/editor-password";

export const SESSION_COOKIE = "research_editor_session";
const LEGACY_MEMBER_MODE_COOKIE = "research_editor_mode";
const SESSION_LIFETIME = 12 * 60 * 60 * 1000;

export type EditorIdentity =
  | { role: "owner"; email: string; id: string }
  | { role: "member"; email: string; id: string; expiresAt: number };

type AccountRow = {
  id: string; email: string; role: "owner" | "member"; password_hash: string; expires_at: number;
  revoked_at: number | null; failed_attempts: number; locked_until: number | null;
};

function database() {
  if (!env.DB) throw new Error("内容数据库不可用");
  return env.DB;
}

export function sameOrigin(request: Request): boolean {
  return request.headers.get("origin") === new URL(request.url).origin;
}

export function sessionCookie(token: string, request: Request, maxAge: number): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie(request: Request): string {
  return sessionCookie("", request, 0);
}

export function clearLegacyMemberModeCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${LEGACY_MEMBER_MODE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function getEditorIdentity(): Promise<EditorIdentity | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{40,80}$/.test(token)) return null;
  try {
    const now = Date.now();
    const row = await database().prepare(`SELECT a.id, a.email, a.role, a.expires_at
      FROM editor_sessions s JOIN editor_accounts a ON a.id = s.account_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND a.revoked_at IS NULL
        AND (a.role = 'owner' OR (a.role = 'member' AND a.expires_at > ?))`)
      .bind(await sha256(token), now, now).first<Pick<AccountRow, "id" | "email" | "role" | "expires_at">>();
    if (!row) return null;
    return row.role === "owner" ? { role: "owner", id: row.id, email: row.email }
      : { role: "member", id: row.id, email: row.email, expiresAt: row.expires_at };
  } catch (error) {
    console.error("Editor identity lookup failed", error);
    return null;
  }
}

export async function isSiteOwner(): Promise<boolean> {
  return (await getEditorIdentity())?.role === "owner";
}

export async function loginEditor(email: string, password: string, request: Request): Promise<string | null> {
  if (!validPassword(password)) return null;
  const now = Date.now();
  const account = await database().prepare("SELECT id, email, role, password_hash, expires_at, revoked_at, failed_attempts, locked_until FROM editor_accounts WHERE email = ?").bind(email).first<AccountRow>();
  if (!account || !["owner", "member"].includes(account.role) || account.revoked_at !== null
    || (account.role === "member" && account.expires_at <= now) || (account.locked_until ?? 0) > now) return null;
  if (!(await verifyPassword(password, account.password_hash))) {
    await database().prepare(`UPDATE editor_accounts SET failed_attempts = failed_attempts + 1,
      locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN ? ELSE locked_until END
      WHERE id = ? AND password_hash = ? AND COALESCE(locked_until, 0) <= ?`)
      .bind(now + 15 * 60_000, account.id, account.password_hash, now).run();
    return null;
  }
  const token = randomSecret(32);
  const issuedAt = Date.now();
  const expiresAt = account.role === "owner" ? issuedAt + SESSION_LIFETIME
    : Math.min(account.expires_at, issuedAt + SESSION_LIFETIME);
  // Recheck the verified hash inside the write: a concurrent reset must not mint a new session.
  const results = await database().batch([
    database().prepare(`UPDATE editor_accounts SET failed_attempts = 0, locked_until = NULL
      WHERE id = ? AND password_hash = ? AND COALESCE(locked_until, 0) <= ?`)
      .bind(account.id, account.password_hash, issuedAt),
    database().prepare(`INSERT INTO editor_sessions (token_hash, account_id, expires_at, created_at)
      SELECT ?, id, ?, ? FROM editor_accounts WHERE id = ? AND password_hash = ? AND revoked_at IS NULL
        AND role = ? AND (role = 'owner' OR (role = 'member' AND expires_at > ?))
        AND COALESCE(locked_until, 0) <= ?`)
      .bind(await sha256(token), expiresAt, issuedAt, account.id, account.password_hash, account.role, issuedAt, issuedAt),
  ]);
  if (results[1].meta.changes !== 1) return null;
  return sessionCookie(token, request, Math.max(0, Math.floor((expiresAt - issuedAt) / 1000)));
}

export async function logoutEditor(token: string | undefined): Promise<void> {
  if (token) await database().prepare("DELETE FROM editor_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export async function changeEditorPassword(identity: EditorIdentity, current: string, next: string): Promise<boolean> {
  if (!validPassword(current) || !validPassword(next)) return false;
  const row = await database().prepare(`SELECT password_hash FROM editor_accounts WHERE id = ? AND revoked_at IS NULL
    AND (role = 'owner' OR (role = 'member' AND expires_at > ?))`)
    .bind(identity.id, Date.now()).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(current, row.password_hash))) return false;
  const passwordHash = await hashPassword(next);
  const now = Date.now();
  const results = await database().batch([
    database().prepare(`UPDATE editor_accounts SET password_hash = ?, updated_at = ?, failed_attempts = 0, locked_until = NULL
      WHERE id = ? AND password_hash = ? AND revoked_at IS NULL
        AND (role = 'owner' OR (role = 'member' AND expires_at > ?))`)
      .bind(passwordHash, now, identity.id, row.password_hash, now),
    database().prepare(`DELETE FROM editor_sessions WHERE account_id = ?
      AND EXISTS (SELECT 1 FROM editor_accounts WHERE id = ? AND password_hash = ?)`)
      .bind(identity.id, identity.id, passwordHash),
  ]);
  return results[0].meta.changes === 1;
}
