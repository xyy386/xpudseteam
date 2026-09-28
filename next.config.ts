import type { NextConfig } from "next";

// GitHub Pages 项目页部署在 /<仓库名>/ 子路径下：
// 构建时设置 NEXT_PUBLIC_BASE_PATH=/仓库名 即可让 Next 资源走子路径；
// 内容里的根相对链接与图片由 scripts/apply-base-path.mjs 在构建后统一加前缀。
// 本地预览时不设置该变量，站点运行在根路径。
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/+$/, "") ?? "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
};

export default nextConfig;
