import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { maintainOwner, openAdminDatabase } from '../scripts/editor-admin.mjs';
import { hashPassword, sha256, randomSecret, verifyPassword } from '../lib/editor-password.ts';

const root = path.resolve(import.meta.dirname, '..');
const origin = 'https://research.example';
const password = 'Testing-only-password-123';
const nextPassword = 'Testing-only-password-456';
const migrations = readdirSync(path.join(root, 'drizzle')).filter(name => name.endsWith('.sql')).sort();
const cookieName = 'research_editor_session';

function sqliteD1(sqlite) {
  const database = {
    beforeBatch: null,
    prepare(sql) {
      return {
        sql, params: [],
        bind(...params) { this.params = params; return this; },
        async first() { return sqlite.prepare(sql).get(...this.params) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...this.params), success: true }; },
        async run() { const result = sqlite.prepare(sql).run(...this.params); return { success: true, meta: { changes: Number(result.changes) } }; },
      };
    },
    async batch(statements) {
      if (this.beforeBatch) { const hook = this.beforeBatch; this.beforeBatch = null; await hook(); }
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return database;
}

async function fixture({ migrate = true } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  const apply = name => sqlite.exec(readFileSync(path.join(root, 'drizzle', name), 'utf8'));
  migrations.slice(0, migrate ? undefined : 3).forEach(apply);
  const database = sqliteD1(sqlite);
  let cookieValues = new Map();
  const environment = { DB: database };
  const context = vm.createContext({ crypto, TextEncoder, Uint8Array, atob, btoa, Request, Response, Headers, URL, console });
  const modules = new Map();
  const synthetic = (id, exports) => new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context, identifier: id });
  modules.set('cloudflare:workers', synthetic('cloudflare:workers', { env: environment }));
  modules.set('next/headers', synthetic('next/headers', {
    cookies: async () => ({ get: name => cookieValues.has(name) ? { value: cookieValues.get(name) } : undefined, has: name => cookieValues.has(name) }),
    headers: async () => new Headers({ 'oai-authenticated-user-email': 'owner@example.invalid', 'oai-authenticated-user-id': 'legacy-owner' }),
  }));
  function load(id) {
    if (modules.has(id)) return modules.get(id);
    const code = ts.transpileModule(readFileSync(id, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, fileName: id,
    }).outputText;
    const module = new vm.SourceTextModule(code, { context, identifier: id });
    modules.set(id, module);
    return module;
  }
  const link = (specifier, parent) => load(specifier.startsWith('.')
    ? path.resolve(path.dirname(parent.identifier), specifier + (path.extname(specifier) ? '' : '.ts')) : specifier);
  async function imported(relative) {
    const module = load(path.join(root, relative));
    if (module.status === 'unlinked') await module.link(link);
    if (module.status === 'linked') await module.evaluate();
    return module.namespace;
  }
  const credentials = await imported('app/editor-credentials.ts');
  const session = await imported('app/api/editor-session/route.ts');
  const members = await imported('app/api/editor-members/route.ts');
  const auth = await imported('app/editor-auth.ts');
  function cookie(value = '') {
    cookieValues = new Map(value.split(';').map(item => item.trim().split('=')));
  }
  function request(method, body, suppliedOrigin = origin) {
    return new Request(origin + '/api/editor-session', {
      method, headers: { Origin: suppliedOrigin, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async function login(email, secret = password) {
    const response = await session.POST(request('POST', { email, password: secret }));
    const setCookie = response.headers.getSetCookie().find(item => item.startsWith(cookieName + '='));
    return { response, cookie: setCookie?.split(';')[0] };
  }
  async function member(email = 'member@example.invalid', expires = Date.now() + 86_400_000) {
    const id = crypto.randomUUID();
    sqlite.prepare(`INSERT INTO editor_accounts (id,email,password_hash,expires_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?)`).run(id, email, await hashPassword(password), expires, Date.now(), Date.now());
    return id;
  }
  return { sqlite, database, environment, apply, credentials, session, members, auth, cookie, request, login, member, close: () => sqlite.close() };
}

const withFixture = fn => async t => {
  const f = await fixture();
  try { await fn(f, t); } finally { f.close(); }
};

test('migration preserves old member passwords, expiry and active sessions', async () => {
  const f = await fixture({ migrate: false });
  try {
    const id = await f.member();
    const before = f.sqlite.prepare('SELECT * FROM editor_accounts WHERE id=?').get(id);
    const token = randomSecret(32);
    f.sqlite.prepare('INSERT INTO editor_sessions VALUES (?,?,?,?)').run(await sha256(token), id, Date.now() + 60_000, Date.now());
    migrations.slice(3).forEach(f.apply);
    const after = f.sqlite.prepare('SELECT * FROM editor_accounts WHERE id=?').get(id);
    assert.deepEqual({ ...after, role: undefined }, { ...before, role: undefined });
    assert.equal(after.role, 'member');
    f.cookie(`${cookieName}=${token}; research_editor_mode=member; __sites_local_auth=1`);
    assert.equal((await f.credentials.getEditorIdentity()).role, 'member');
    assert.equal((await f.members.GET()).status, 403);
    assert.equal((await f.login('member@example.invalid')).response.status, 200);
    f.sqlite.prepare('UPDATE editor_accounts SET expires_at=0 WHERE id=?').run(id);
    assert.equal(await f.credentials.getEditorIdentity(), null);
  } finally { f.close(); }
});

test('owner initialization is exclusive, refuses member collisions and races', withFixture(async f => {
  await f.member();
  await assert.rejects(maintainOwner(f.database, 'init', 'member@example.invalid', password));
  const outcomes = await Promise.allSettled([
    maintainOwner(f.database, 'init', 'owner@example.invalid', password),
    maintainOwner(f.database, 'init', 'other-owner@example.invalid', password),
  ]);
  assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM editor_accounts WHERE role='owner'").get().count, 1);
  await assert.rejects(maintainOwner(f.database, 'init', 'third@example.invalid', password));
  await assert.rejects(maintainOwner(f.database, 'reset', 'member@example.invalid', nextPassword));
  assert.equal((await f.login('member@example.invalid')).response.status, 200);
}));

test('password login is the sole source of identity and sets bounded secure sessions', withFixture(async f => {
  await maintainOwner(f.database, 'init', 'owner@example.invalid', password);
  await f.member();
  f.cookie('__sites_local_auth=1');
  assert.equal(await f.credentials.getEditorIdentity(), null);
  assert.equal((await f.members.GET()).status, 403);
  const owner = await f.login(' OWNER@example.invalid ');
  assert.equal(owner.response.status, 200);
  const headers = owner.response.headers.getSetCookie();
  assert.match(headers.join(';'), /HttpOnly/);
  assert.match(headers.join(';'), /SameSite=Lax/);
  assert.match(headers.join(';'), /Secure/);
  assert.match(headers.join(';'), /Max-Age=43200/);
  assert.match(headers.find(item => item.startsWith('research_editor_mode=')), /Max-Age=0/);
  f.cookie(owner.cookie);
  assert.equal((await f.credentials.getEditorIdentity()).role, 'owner');
  assert.equal(await f.credentials.isSiteOwner(), true);
  assert.equal((await f.members.GET()).status, 200);
  const member = await f.login('member@example.invalid');
  f.cookie(member.cookie + '; __sites_local_auth=1');
  assert.equal(await f.auth.isSiteEditor(), true);
  assert.equal(await f.credentials.isSiteOwner(), false);
  assert.equal((await f.members.GET()).status, 403);
  assert.equal((await f.session.DELETE(f.request('DELETE'))).status, 200);
  assert.equal(await f.credentials.getEditorIdentity(), null);
  f.cookie('__sites_local_auth=1');
  assert.equal(await f.credentials.getEditorIdentity(), null);
}));

test('member administration cannot see or modify owner accounts or sessions', withFixture(async f => {
  await maintainOwner(f.database, 'init', 'owner@example.invalid', password);
  const owner = await f.login('owner@example.invalid');
  await f.login('owner@example.invalid');
  f.cookie(owner.cookie);
  const ownerRow = f.sqlite.prepare("SELECT * FROM editor_accounts WHERE role='owner'").get();
  const sessions = f.sqlite.prepare('SELECT * FROM editor_sessions ORDER BY token_hash').all();
  assert.deepEqual((await (await f.members.GET()).json()).members, []);
  for (const action of ['renew', 'revoke', 'reset']) {
    assert.equal((await f.members.PATCH(f.request('PATCH', { id: ownerRow.id, action, days: 1 }))).status, 404);
  }
  assert.equal((await f.members.DELETE(f.request('DELETE', { id: ownerRow.id }))).status, 404);
  assert.equal((await f.members.POST(f.request('POST', { email: ownerRow.email, days: 1, role: 'owner' }))).status, 409);
  assert.deepEqual(f.sqlite.prepare("SELECT * FROM editor_accounts WHERE role='owner'").get(), ownerRow);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM editor_sessions ORDER BY token_hash').all(), sessions);
  const created = await f.members.POST(f.request('POST', { email: 'new@example.invalid', days: 7, role: 'owner' }));
  assert.equal(created.status, 200);
  const body = await created.json();
  assert.equal(f.sqlite.prepare('SELECT role FROM editor_accounts WHERE id=?').get(body.member.id).role, 'member');
  assert.equal((await f.login(body.member.email, body.initialPassword)).response.status, 200);
}));

test('member grants enforce 1–365 whole days and list only public account fields', withFixture(async f => {
  await maintainOwner(f.database, 'init', 'owner@example.invalid', password);
  f.cookie((await f.login('owner@example.invalid')).cookie);
  for (const days of [0, 366, 1.5, '7', null]) {
    assert.equal((await f.members.POST(f.request('POST', { email: 'invalid@example.invalid', days }))).status, 400);
  }
  for (const days of [1, 365]) {
    const before = Date.now();
    const response = await f.members.POST(f.request('POST', { email: ` MEMBER-${days}@example.invalid `, days }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json();
    assert.equal(result.member.email, `member-${days}@example.invalid`);
    assert.ok(result.member.expiresAt >= before + days * 86_400_000);
    assert.ok(result.member.expiresAt <= Date.now() + days * 86_400_000);
    assert.equal((await f.login(result.member.email, result.initialPassword)).response.status, 200);
    assert.equal((await f.members.POST(f.request('POST', { email: result.member.email, days }))).status, 409);
  }
  const response = await f.members.GET();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { members } = await response.json();
  assert.equal(members.length, 2);
  for (const member of members) assert.deepEqual(Object.keys(member).sort(), ['createdAt', 'email', 'expiresAt', 'id', 'revokedAt']);
}));

test('member renewal extends an active grant and restores expired or revoked grants', withFixture(async f => {
  await maintainOwner(f.database, 'init', 'owner@example.invalid', password);
  f.cookie((await f.login('owner@example.invalid')).cookie);
  const activeExpiry = Date.now() + 2 * 86_400_000;
  const activeId = await f.member('active@example.invalid', activeExpiry);
  for (const days of [0, 366, 1.5, '7']) {
    assert.equal((await f.members.PATCH(f.request('PATCH', { id: activeId, action: 'renew', days }))).status, 400);
  }
  const activeResponse = await f.members.PATCH(f.request('PATCH', { id: activeId, action: 'renew', days: 3 }));
  assert.equal(activeResponse.status, 200);
  assert.equal((await activeResponse.json()).expiresAt, activeExpiry + 3 * 86_400_000);
  for (const state of ['expired', 'revoked']) {
    const email = `${state}@example.invalid`;
    const id = await f.member(email, state === 'expired' ? Date.now() - 60_000 : Date.now() + 86_400_000);
    if (state === 'revoked') assert.equal((await f.members.PATCH(f.request('PATCH', { id, action: 'revoke' }))).status, 200);
    assert.equal((await f.login(email)).response.status, 401);
    const before = Date.now();
    const response = await f.members.PATCH(f.request('PATCH', { id, action: 'renew', days: 1 }));
    assert.equal(response.status, 200);
    const result = await response.json();
    if (state === 'expired') {
      assert.ok(result.expiresAt >= before + 86_400_000);
      assert.ok(result.expiresAt <= Date.now() + 86_400_000);
    }
    assert.equal((await f.login(email)).response.status, 200);
    assert.equal(f.sqlite.prepare('SELECT revoked_at FROM editor_accounts WHERE id=?').get(id).revoked_at, null);
  }
}));

test('member revocation and deletion invalidate existing sessions without affecting the owner', withFixture(async f => {
  await maintainOwner(f.database, 'init', 'owner@example.invalid', password);
  const owner = await f.login('owner@example.invalid');
  for (const action of ['revoke', 'delete']) {
    const email = `${action}@example.invalid`;
    const id = await f.member(email);
    const sessions = [await f.login(email), await f.login(email)];
    f.cookie(owner.cookie);
    const response = action === 'delete'
      ? await f.members.DELETE(f.request('DELETE', { id }))
      : await f.members.PATCH(f.request('PATCH', { id, action }));
    assert.equal(response.status, 200);
    for (const session of sessions) {
      f.cookie(session.cookie);
      assert.equal(await f.credentials.getEditorIdentity(), null);
    }
    assert.equal((await f.login(email)).response.status, 401);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM editor_sessions WHERE account_id=?').get(id).count, 0);
    if (action === 'delete') assert.equal(f.sqlite.prepare('SELECT id FROM editor_accounts WHERE id=?').get(id), undefined);
    f.cookie(owner.cookie);
    assert.equal(await f.credentials.isSiteOwner(), true);
  }
}));

test('member password reset replaces credentials, clears lockout and invalidates every prior session', withFixture(async f => {
  await maintainOwner(f.database, 'init', 'owner@example.invalid', password);
  const owner = await f.login('owner@example.invalid');
  const expiresAt = Date.now() + 86_400_000;
  const id = await f.member('reset@example.invalid', expiresAt);
  const sessions = [await f.login('reset@example.invalid'), await f.login('reset@example.invalid')];
  f.sqlite.prepare('UPDATE editor_accounts SET failed_attempts=5, locked_until=? WHERE id=?').run(Date.now() + 900_000, id);
  f.cookie(owner.cookie);
  const response = await f.members.PATCH(f.request('PATCH', { id, action: 'reset' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.equal(typeof result.initialPassword, 'string');
  for (const session of sessions) {
    f.cookie(session.cookie);
    assert.equal(await f.credentials.getEditorIdentity(), null);
  }
  assert.equal((await f.login('reset@example.invalid')).response.status, 401);
  assert.equal((await f.login('reset@example.invalid', result.initialPassword)).response.status, 200);
  assert.equal(f.sqlite.prepare('SELECT expires_at FROM editor_accounts WHERE id=?').get(id).expires_at, expiresAt);
  f.cookie(owner.cookie);
  assert.equal(await f.credentials.isSiteOwner(), true);
  assert.equal((await f.members.PATCH(f.request('PATCH', { id, action: 'revoke' }))).status, 200);
  const revokedReset = await f.members.PATCH(f.request('PATCH', { id, action: 'reset' }));
  assert.equal(revokedReset.status, 200);
  assert.equal((await f.login('reset@example.invalid', (await revokedReset.json()).initialPassword)).response.status, 401);
}));

test('member management writes reject members, anonymous callers and cross-origin owners', withFixture(async f => {
  await maintainOwner(f.database, 'init', 'owner@example.invalid', password);
  const owner = await f.login('owner@example.invalid');
  const id = await f.member();
  const member = await f.login('member@example.invalid');
  const writes = [
    ['POST', { email: 'unauthorized@example.invalid', days: 7 }],
    ...['renew', 'revoke', 'reset'].map(action => ['PATCH', { id, action, days: 7 }]),
    ['DELETE', { id }],
  ];
  for (const [cookie, requestOrigin] of [[undefined, origin], [member.cookie, origin], [owner.cookie, 'https://untrusted.example']]) {
    f.cookie(cookie);
    for (const [method, body] of writes) assert.equal((await f.members[method](f.request(method, body, requestOrigin))).status, 403);
  }
  f.cookie(owner.cookie);
  assert.equal(await f.credentials.isSiteOwner(), true);
  assert.equal((await (await f.members.GET()).json()).members.length, 1);
  f.cookie(member.cookie);
  assert.equal(await f.auth.isSiteEditor(), true);
}));

test('owner and member password changes invalidate every prior session', withFixture(async f => {
  await maintainOwner(f.database, 'init', 'owner@example.invalid', password);
  await f.member();
  for (const email of ['owner@example.invalid', 'member@example.invalid']) {
    const first = await f.login(email);
    const second = await f.login(email);
    f.cookie(first.cookie);
    assert.equal((await f.session.PATCH(f.request('PATCH', { current: 'wrong-password-123', next: nextPassword }))).status, 400);
    const response = await f.session.PATCH(f.request('PATCH', { current: password, next: nextPassword }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.getSetCookie().filter(value => value.includes('Max-Age=0')).length, 2);
    for (const oldCookie of [first.cookie, second.cookie]) { f.cookie(oldCookie); assert.equal(await f.credentials.getEditorIdentity(), null); }
    assert.equal((await f.login(email)).response.status, 401);
    assert.equal((await f.login(email, nextPassword)).response.status, 200);
  }
}));

test('trusted owner reset invalidates old sessions and blocks an in-flight old-password login', withFixture(async f => {
  await maintainOwner(f.database, 'init', 'owner@example.invalid', password);
  const first = await f.login('owner@example.invalid');
  const second = await f.login('owner@example.invalid');
  f.database.beforeBatch = () => maintainOwner(f.database, 'reset', 'owner@example.invalid', nextPassword);
  assert.equal((await f.login('owner@example.invalid')).response.status, 401);
  for (const oldCookie of [first.cookie, second.cookie]) { f.cookie(oldCookie); assert.equal(await f.credentials.getEditorIdentity(), null); }
  assert.equal((await f.login('owner@example.invalid', nextPassword)).response.status, 200);
}));

test('expired, revoked and locked accounts are rejected; sessions respect member expiry', withFixture(async f => {
  const id = await f.member('member@example.invalid', Date.now() + 120_000);
  const member = await f.login('member@example.invalid');
  const age = Number(member.response.headers.getSetCookie()[0].match(/Max-Age=(\d+)/)[1]);
  assert.ok(age > 0 && age <= 120);
  for (let index = 0; index < 5; index++) assert.equal((await f.login('member@example.invalid', 'invalid-password-123')).response.status, 401);
  assert.equal((await f.login('member@example.invalid')).response.status, 401);
  const row = f.sqlite.prepare('SELECT * FROM editor_accounts WHERE id=?').get(id);
  assert.equal(row.failed_attempts, 5);
  assert.ok(row.locked_until > Date.now() + 14 * 60_000);
  f.sqlite.prepare('UPDATE editor_accounts SET locked_until=0 WHERE id=?').run(id);
  assert.equal((await f.login('member@example.invalid')).response.status, 200);
  f.sqlite.prepare('UPDATE editor_accounts SET revoked_at=? WHERE id=?').run(Date.now(), id);
  f.cookie(member.cookie);
  assert.equal(await f.credentials.getEditorIdentity(), null);
  assert.equal((await f.login('member@example.invalid')).response.status, 401);
  f.sqlite.prepare('UPDATE editor_accounts SET revoked_at=NULL,expires_at=0 WHERE id=?').run(id);
  assert.equal((await f.login('member@example.invalid')).response.status, 401);
}));

test('cross-origin writes and malformed sessions fail closed', withFixture(async f => {
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    assert.equal((await f.session[method](f.request(method, {}, 'https://untrusted.example'))).status, 403);
  }
  f.cookie(cookieName + '=invalid');
  assert.equal(await f.credentials.getEditorIdentity(), null);
  assert.equal((await f.session.PATCH(f.request('PATCH', { current: password, next: nextPassword }))).status, 403);
  assert.equal((await f.session.POST(f.request('POST', { email: 'not-email', password }))).status, 400);
  assert.equal((await f.session.POST(f.request('POST', { email: 'absent@example.invalid', password: 'x'.repeat(129) }))).status, 401);
}));

test('remote maintenance requires real identifiers and sends parameterized batches', async () => {
  await assert.rejects(openAdminDatabase({ local: false, remote: false }));
  await assert.rejects(openAdminDatabase({ remote: true, 'account-id': 'a'.repeat(32), 'database-id': '00000000-0000-4000-8000-000000000000' }));
  const originalToken = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_API_TOKEN = 'test-only-not-a-real-token';
  const f = await fixture();
  try {
    const batches = [];
    const connection = await openAdminDatabase({ remote: true, 'account-id': 'a'.repeat(32), 'database-id': '12345678-1234-4234-8234-123456789012' }, async (url, options) => {
      assert.ok(url.startsWith('https://api.cloudflare.com/'));
      const { batch } = JSON.parse(options.body);
      assert.ok(!options.body.includes(password));
      batches.push(batch);
      const result = await f.database.batch(batch.map(({ sql, params }) => f.database.prepare(sql).bind(...params)));
      return Response.json({ success: true, result });
    });
    await maintainOwner(connection.database, 'init', 'owner@example.invalid', password);
    await maintainOwner(connection.database, 'reset', 'owner@example.invalid', nextPassword);
    assert.equal(batches[0].length, 1);
    assert.equal(batches[1].length, 2);
    assert.ok(await verifyPassword(nextPassword, f.sqlite.prepare("SELECT password_hash FROM editor_accounts WHERE role='owner'").get().password_hash));
  } finally {
    f.close();
    if (originalToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = originalToken;
  }
});
