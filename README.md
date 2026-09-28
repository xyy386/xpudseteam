# vinext-starter

A clean full-stack starter running on [vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Portable: Windows, macOS, or Linux; no Bash required
- Managed Linux: managed Linux runtime with Bash, `flock`, `curl`, `sha256sum`, and GNU `timeout`
- Git is required only for publishing

## Sites Lifecycle

The Sites initializer copies the shared starter and selects managed-linux only when `SITES_MANAGED_LINUX_CONTAINER=1`; otherwise it selects portable. It saves the selection only in ignored `.sites-runtime/execution-profile.json`. Both profiles copy/configure first, then use the plugin's separate `install-dependencies.mjs` step to measure installation independently. Edit source under `app/` and follow the Sites skill for installation, preview, builds, and publishing.

Run `node <plugin-root>/scripts/configure-execution-profile.mjs` only when the profile is unknown for the current checkout and environment. Profile changes do not alter tracked source or require reinstalling otherwise-valid dependencies; restart an existing preview to use the new selection. Do not commit or upload `.sites-runtime/`.

This starter does not use `wrangler.jsonc`.

`install:ci` runs `npm ci` once against the shared lockfile, disables parent-workspace discovery, and includes required dev/optional dependencies despite production/omit settings. Sharp defaults to prebuilt binaries unless explicitly configured otherwise. Do not overlap installers.

- **Portable:** Preserve host HOME, npm cache, registry, proxy, temporary paths, retry/concurrency settings, and lifecycle-script policy. Use `--prefer-offline --no-audit --no-fund`.
- **Managed Linux:** Use the existing project-local HOME/cache/tmp setup and Linux install lock, tarball preflight, and timeout. Restore the image-seeded npm cache only when its lockfile hash matches; retain network fallback. Builds keep their existing timeout. These helpers are not invoked by the portable profile.

`scripts/sites-env.mjs` preserves the caller's HOME, npm cache, proxy, XDG, and temporary-directory configuration while defaulting Wrangler and Miniflare state to the checkout. If npm reports an unwritable cache, select a writable path with `npm_config_cache` for that install. The `dev` and `start` scripts also keep Wrangler logs inside the checkout. Generated `.sites-runtime/` and `.wrangler/` directories are disposable and ignored by Git.

On portable, `npm run dev` uses `vinext dev` with HMR, starting at port 5173. Vinext records the running server in ignored `.vinext/` state, rejects an ordinary duplicate launch, and recovers stale state after a stopped process; exactly simultaneous starts can race. Pass `--port <port>` or `--hostname <host>` after `npm run dev --` when needed; keep portable previews on loopback.

For browser QA on managed Linux, use `sites-preview start`. The project's dev script runs Vite and accepts the supervisor's `--host 0.0.0.0 --port 4173 --strictPort` arguments. The internal browser uses `http://terminal.local:4173/`; it is not a user-facing URL. The supervisor owns the preview lifecycle. The ignored local profile survives the supervisor's cleared process environment.

The portable profile simulates ChatGPT sign-in only for loopback development requests. Visit `/signin-with-chatgpt?return_to=/` to sign in as `local_seedy` (`seedy@sites.test`, display name `Seedy`) and `/signout-with-chatgpt?return_to=/` to sign out. The development cookie preserves that identity across server restarts. Mock auth is disabled in the managed-linux profile and is not included in production builds; hosted authentication remains dispatch-owned.

The Worker uses `vinext/server/fetch-handler`, including Vinext's config-aware image handling. After building, `npm start` runs that Worker locally through Wrangler on `127.0.0.1`, sharing `.wrangler/state` with dev preview and local D1 migrations; it does not deploy the site or simulate sign-in. Use the URL printed by the server. Pass `npm start -- --port <port>` to select a different built-preview port.

Local previews use Miniflare's placeholder `Request.cf` metadata without a network lookup. Set `CLOUDFLARE_CF_FETCH_ENABLED=true` to opt into fetching preview metadata; this setting does not change hosted request metadata.

Local tool usage metrics are disabled by default. Set `WRANGLER_SEND_METRICS=true` to opt in.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `@cloudflare/workers-types` provides Worker types; `cloudflare-env.d.ts` declares optional `DB`/`BUCKET` bindings—update these declarations if binding names change
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Use it as the durable user key; use email and name for display or contact purposes.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use the returned `userId` as the stable user key for user-owned records; do not use email as a durable identifier.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the Sites hosting platform's access policy controls for workspace-wide restrictions, or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Local D1 migrations

For a D1-backed local preview, generate SQL with `npm run db:generate`. Build once through the Sites skill's build entrypoint (or `npm run build` for standalone use) to generate `dist/server/wrangler.json`, rebuilding if bindings change. From the project root, apply each pending migration in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_example.sql
```

Replace the filename with the pending migration and `DB` with your D1 binding name if different. Use `.wrangler/state`, not `.wrangler/state/v3`; Wrangler adds the versioned directories. Do not replay migrations already applied locally. This updates only the preview database; publishing applies production migrations separately.

## Diagnostic Commands

- `npm run install:ci`: perform the one locked dependency install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: preview the built Worker locally with D1/R2 support
- `npm run db:generate`: generate Drizzle migrations after schema changes

When using the Sites plugin, follow its skill instructions for installation, builds, and publishing. These npm commands remain available for standalone use.

The portable build runs Vinext directly without a host `timeout` command. The managed-linux build uses `scripts/build-verified.sh` and its existing `SITES_BUILD_TIMEOUT` setting.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)

## 网站编辑账号

公开页面不显示管理入口。在网站根地址后加 `/login`，使用邮箱和网站密码登录；登录成功后进入 `/edit`。旧 `/editor-login` 自动转到 `/login`。ChatGPT 身份不再授予网站编辑权限，网站不开放注册。

- 管理员长期有效，可以编辑内容、管理临时成员、同步内容及使用起草助手。
- 现有成员账号和密码保留，授权仍按原截止时间生效；成员不能操作管理员账号。
- 两种身份均可在“账号设置”中修改密码。修改或重置密码后，该账号全部旧会话失效。
- 登录会话最长 12 小时，且不超过成员账号截止时间；连续 5 次错误密码后锁定 15 分钟。

### 数据库迁移与首次启用

上线顺序必须是：**应用角色迁移 → 通过受控命令创建管理员 → 部署切换认证的应用**。不得在尚未创建管理员时直接切换线上认证。Sites 常规发布会先应用迁移再上传应用，但两步之间不能交互创建账号；因此此次切换采用两阶段发布：先发布只包含角色迁移、仍使用原认证代码的过渡版本，让平台应用并登记迁移；随后通过受控命令初始化线上管理员；最后发布本次认证代码。若改用平台维护者手工迁移，必须同时正确登记该平台的迁移记录，防止后续发布再次执行 ADD COLUMN。不要把账号种子或密码写入迁移文件，也不要增加公开初始化 API。

新增迁移为 `drizzle/0003_wild_mother_askani.sql`，仅添加角色和唯一管理员索引，保留已有账号及会话。角色默认 `member`；管理员的 `expires_at=0` 表示长期有效，仅 `owner` 角色适用。迁移应用后不可重复执行或改写旧迁移。

本地已有数据库只应用尚未执行的迁移。首次空数据库则按 `drizzle/meta/_journal.json` 顺序执行全部迁移。例如在构建完成后，对采用默认数据目录的本地数据库应用本次新增迁移：

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_wild_mother_askani.sql
```

如配置了自定义本地数据位置，应将 `--persist-to` 替换为 `readLocalDataDir()` 返回的目录。维护命令默认会读取这一配置。

### 创建或重置管理员

在本机交互终端执行，把示例邮箱替换为实际邮箱。密码会隐藏输入两次，不接受命令行密码参数、密码文件或管道输入。

```sh
node --experimental-strip-types scripts/editor-admin.mjs init --email your-email@example.com --local
node --experimental-strip-types scripts/editor-admin.mjs reset --email your-email@example.com --local
```

已有管理员或邮箱与成员冲突时，初始化拒绝覆盖或提权。重置只能作用于已有管理员，且会注销其全部会话。密码须为 12–128 位。管理员初始邮箱和密码不包含在源码中，由部署维护者设置。

线上维护需要真实 Cloudflare 账号 ID、D1 数据库 ID，以及通过受控环境注入的 `CLOUDFLARE_API_TOKEN`（D1 写入权限）：

```sh
node --experimental-strip-types scripts/editor-admin.mjs init --email your-email@example.com --remote --account-id CLOUDFLARE_ACCOUNT_ID --database-id D1_DATABASE_ID
```

`reset` 用法相同。命令只向固定 Cloudflare API 地址发送参数化查询，不保存或输出密码、密码哈希及管理令牌。远程批处理接口参见 [Cloudflare D1 Query API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)。远程模式的请求结构已通过模拟接口验证；实际执行仍需目标数据库管理权限。

**Sites 项目 ID 不是 D1 数据库 ID。** 本项目生成的本地 Worker 配置使用占位数据库 ID，不能用于线上初始化。如果仅有 Sites 管理连接、没有真实 D1 维护权限，请先由平台数据库维护者完成迁移和账号初始化，不要创建绕过验证的后台接口。本地与线上账号分别维护，网站内容同步不包含账号、密码或会话。

### 隔离测试

```sh
node --experimental-strip-types --experimental-vm-modules --test tests/editor-auth.test.mjs
node --experimental-strip-types --test tests/three-way-merge.test.mjs tests/site-sync-merge.test.mjs
npx tsc --noEmit
npm run build
```

认证测试在独立内存 SQLite 中执行真实认证函数、路由和 SQL，不连接日常预览或线上数据库；覆盖旧会话迁移、管理员唯一性与初始化竞争、权限隔离、改密/重置、锁定和旧密码登录竞争。`tests/editor-identity-priority.py` 是该测试的兼容入口，不再使用模拟 ChatGPT 管理员身份。

### macOS 原生依赖无法验证

如果 macOS 拦截 `tailwindcss-oxide.darwin-arm64.node` 或类似原生依赖，可在项目目录运行 `npm run install:ci`，按锁定版本重新安装依赖，然后重新启动 `npm run dev`。复制项目时不携带旧 `node_modules`，在目标电脑上重新安装；保留 `.wrangler/state` 中的本地数据。

管理员命令另有 macOS/Linux 交互测试：`python tests/editor-admin-cli.py`。测试使用独立临时 D1，验证创建、重复创建拒绝、重置和密码不回显，不操作真实管理员。
