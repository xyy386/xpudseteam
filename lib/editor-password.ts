// The production Workers runtime supports at most 100,000 PBKDF2 iterations.
const PASSWORD_ITERATIONS = 100_000;

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
  if (method !== "pbkdf2-sha256" || !Number.isInteger(iterations) || iterations < 100_000 || iterations > PASSWORD_ITERATIONS || !saltText || !expectedText) return false;
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

