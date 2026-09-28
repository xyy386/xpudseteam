// 为 GitHub Pages 项目页（/<仓库名>/ 子路径）补全前缀。
// next.config.ts 的 basePath 只作用于 Next 自己生成的资源引用（/_next、favicon 等），
// 页面内容里的根相对链接和图片（如 /team、/migrated-media/x.jpg）由本脚本统一加前缀。
// 未设置 NEXT_PUBLIC_BASE_PATH（本地预览）时直接跳过，产物保持根路径。
// 本站所有公开页面均为服务端组件，静态导出的 HTML 即最终渲染结果，
// 因此只需处理 HTML 属性与内联样式，无需触碰内嵌数据。
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");
if (!base) {
  console.log("NEXT_PUBLIC_BASE_PATH 未设置，跳过 URL 前缀处理。");
  process.exit(0);
}

async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(full);
    else if (entry.name.endsWith(".html")) yield full;
  }
}

const alreadyPrefixed = (path) =>
  path === "/_next" || path.startsWith("/_next/") || path === base || path.startsWith(`${base}/`);

// HTML 属性：href="/team"、src="/migrated-media/x.jpg"；跳过协议相对 //。
const attribute = /(\s(?:href|src)=["'])(\/(?!\/)[^"']*)(["'])/g;
// 内联样式：backgroundImage 里的 url('/campus-hero-user.png')。
const cssUrl = /(url\(["']?)(\/(?!\/)[^)"']*)(["']?\))/g;

function prefix(path) {
  return alreadyPrefixed(path) ? path : `${base}${path}`;
}

let changed = 0;
for await (const file of htmlFiles("out")) {
  const original = await readFile(file, "utf8");
  const html = original
    .replace(attribute, (_m, pre, path, post) => `${pre}${prefix(path)}${post}`)
    .replace(cssUrl, (_m, pre, path, post) => `${pre}${prefix(path)}${post}`);
  if (html !== original) {
    await writeFile(file, html);
    changed += 1;
  }
}
console.log(`已为 ${changed} 个 HTML 文件应用 base path 前缀：${base}`);
