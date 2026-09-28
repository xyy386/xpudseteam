# 团队网站（静态版）

[English](README.md) | 简体中文

数据驱动的科学工程建模与计算团队（西安工程大学 理学院）的官方网站，基于 Next.js App Router 构建，**纯静态导出**，可部署到 GitHub Pages 等任意静态托管。

> 本版本由原 Cloudflare Workers 全栈版（含 D1 数据库、编辑后台、成员认证）精简而来：仅保留公开页面，显示效果不变。网站内容打包在 `app/saved-content.json` 中，更新内容后重新构建即可。

## 快速开始

```sh
npm install        # 安装依赖（Node.js >= 22.13.0）
npm run dev        # 开发模式，http://localhost:3000，支持热更新
npm run build      # 静态导出到 out/
npm run preview    # 本地预览构建产物（serve out）
```

## 更新网站内容

1. 编辑 `app/saved-content.json`（团队成员、研究方向、动态、档案等所有内容）
2. 图片等媒体文件放在 `public/` 下，JSON 中使用根相对路径引用（如 `/migrated-media/xxx.jpg`）
3. 运行 `npm run build` 重新导出

注意：草稿状态（`status: "draft"`）的新闻稿不会出现在静态产物中；新页面路由（研究方向、档案、自定义栏目的子页面）会在构建时自动枚举生成，无需额外配置。

## 部署到 GitHub Pages

项目页地址形如 `https://<用户名>.github.io/<仓库名>/`，需要为所有 URL 加上 `/<仓库名>` 前缀：

```sh
NEXT_PUBLIC_BASE_PATH=/仓库名 npm run build
```

构建脚本会自动完成两件事：

- `next.config.ts` 读取 `NEXT_PUBLIC_BASE_PATH`，让 Next 生成的资源（JS/CSS/favicon）走子路径
- `scripts/apply-base-path.mjs` 给页面内容里的根相对链接与图片（`/team`、`/migrated-media/x.jpg` 等）统一加前缀

部署要点：

- 产物为 `out/` 目录，推送其全部内容即可；需包含一个空的 `.nojekyll` 文件（禁用 Jekyll 处理）
- 已启用 `trailingSlash: true`，导出为 `目录/index.html` 结构，与 Pages 的目录索引行为一致
- 若使用自定义域名或 `用户名.github.io` 根仓库（无子路径），无需设置 `NEXT_PUBLIC_BASE_PATH`
- 建议用 GitHub Actions 自动化：push 后执行带前缀的构建并发布 `out/`

## 目录结构

- `app/` 页面与内容模块（全部为服务端组件，构建时预渲染）
- `app/saved-content.json` 网站内容数据
- `public/` 静态资源（图片、logo）
- `scripts/apply-base-path.mjs` GitHub Pages 子路径前缀处理
- `tests/` 内容逻辑单元测试（`npm test`）

## 常用命令

- `npm run dev`：开发服务器
- `npm run build`：静态导出
- `npm run preview`：本地预览导出产物
- `npm run lint`：ESLint 检查
- `npm test`：运行单元测试
