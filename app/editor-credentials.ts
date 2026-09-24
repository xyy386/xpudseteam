import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { getChatGPTUser } from "./chatgpt-auth";

export const SESSION_COOKIE = "research_editor_session";
const PASSWORD_ITERATIONS = 310_000;
const SESSION_LIFETIME = 12 * 60 * 60 * 1000;

export type EditorIdentity =
  | { role: "owner"; email: string; id: string }
  | { role: "member"; email: string; id: string; expiresAt: number };

type AccountRow = {
  id: string; email: string; password_hash: string; expires_at: number;
  revoked_at: number | null; failed_attempts: number; locked_until: number | null;
};

function database() {
  if (!env.DB) throw new Error("内容数据库不可用");
  return env.DB;
}

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomSecret(size = 24): string {
  return bytesToBase64url(crypto.getRandomValues(new Uint8Array(size)));
}

export async function sha256(value: string): Promise<string> {
  return bytesToBase64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" }, key, 256));
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${bytesToBase64url(salt)}$${bytesToBase64url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [method, iterationText, saltText, expectedText] = stored.split("$");
  const iterations = Number(iterationText);
  if (method !== "pbkdf2-sha256" || !Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000 || !saltText || !expectedText) return false;
  try {
    const salt = base64urlToBytes(saltText);
    const expected = base64urlToBytes(expectedText);
    if (salt.length !== 16 || expected.length !== 32) return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new Uint8Array(salt), iterations, hash: "SHA-256" }, key, 256));
    let mismatch = 0;
    for (let index = 0; index < actual.length; index++) mismatch |= actual[index] ^ expected[index];
    return mismatch === 0;
  } catch { return false; }
}

export function validPassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= 12 && password.length <= 128;
}

export function normalizedEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
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

export async function getEditorIdentity(): Promise<EditorIdentity | null> {
  const chatgpt = await getChatGPTUser();
  const ownerEmail = env.SITE_EDITOR_EMAIL?.trim().toLowerCase();
  if (chatgpt && (ownerEmail ? chatgpt.email.toLowerCase() === ownerEmail : import.meta.env.DEV && chatgpt.email === "seedy@sites.test")) {
    return { role: "owner", email: chatgpt.email, id: chatgpt.userId };
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{40,80}$/.test(token)) return null;
  const tokenHash = await sha256(token);
  const now = Date.now();
  try {
    const row = await database().prepare(`SELECT a.id, a.email, a.expires_at
      FROM editor_sessions s JOIN editor_accounts a ON a.id = s.account_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND a.expires_at > ? AND a.revoked_at IS NULL`).bind(tokenHash, now, now).first<{ id: string; email: string; expires_at: number }>();
    return row ? { role: "member", id: row.id, email: row.email, expiresAt: row.expires_at } : null;
  } catch (error) {
    console.error("Editor identity lookup failed", error);
    return null;
  }
}

export async function isSiteOwner(): Promise<boolean> {
  return (await getEditorIdentity())?.role === "owner";
}

export async function loginMember(email: string, password: string, request: Request): Promise<string | null> {
  const now = Date.now();
  const account = await database().prepare("SELECT id, email, password_hash, expires_at, revoked_at, failed_attempts, locked_until FROM editor_accounts WHERE email = ?").bind(email).first<AccountRow>();
  if (!account || account.revoked_at !== null || account.expires_at <= now || (account.locked_until ?? 0) > now) return null;
  const valid = await verifyPassword(password, account.password_hash);
  if (!valid) {
    const failures = account.failed_attempts + 1;
    await database().prepare("UPDATE editor_accounts SET failed_attempts = ?, locked_until = ? WHERE id = ?")
      .bind(failures, failures >= 5 ? now + 15 * 60_000 : null, account.id).run();
    return null;
  }
  const token = randomSecret(32);
  const expiresAt = Math.min(account.expires_at, now + SESSION_LIFETIME);
  await database().batch([
    database().prepare("UPDATE editor_accounts SET failed_attempts = 0, locked_until = NULL WHERE id = ?").bind(account.id),
    database().prepare("INSERT INTO editor_sessions (token_hash, account_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(await sha256(token), account.id, expiresAt, now),
  ]);
  return sessionCookie(token, request, Math.max(0, Math.floor((expiresAt - now) / 1000)));
}

export async function logoutMember(token: string | undefined): Promise<void> {
  if (token) await database().prepare("DELETE FROM editor_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export async function changeMemberPassword(identity: EditorIdentity, current: string, next: string): Promise<boolean> {
  if (identity.role !== "member" || !validPassword(next)) return false;
  const row = await database().prepare("SELECT password_hash FROM editor_accounts WHERE id = ? AND revoked_at IS NULL AND expires_at > ?")
    .bind(identity.id, Date.now()).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(current, row.password_hash))) return false;
  const passwordHash = await hashPassword(next);
  await database().batch([
    database().prepare("UPDATE editor_accounts SET password_hash = ?, updated_at = ? WHERE id = ?").bind(passwordHash, Date.now(), identity.id),
    database().prepare("DELETE FROM editor_sessions WHERE account_id = ?").bind(identity.id),
  ]);
  return true;
}
