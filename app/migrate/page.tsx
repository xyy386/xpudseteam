import Link from "next/link";
import { requireChatGPTUser } from "../chatgpt-auth";
import { isSiteEditor } from "../editor-auth";

export const dynamic = "force-dynamic";

export default async function MigrationPage() {
  await requireChatGPTUser("/migrate");
  if (!(await isSiteEditor())) return <main><h1>没有编辑权限</h1><Link href="/">返回网站</Link></main>;

  return <main style={{ maxWidth: 680, margin: "5rem auto", padding: "0 1.5rem", lineHeight: 1.7 }}>
    <h1>导入本地网站资料</h1>
    <p>从已核对的站点包导入 7 张原始图片及页面资料。系统会逐一核对文件内容，先保存图片，再保存页面资料；已有不同的在线资料不会被覆盖。</p>
    <form action="/api/migrate" method="post">
      <button type="submit" style={{ display: "block", marginTop: 24, padding: "10px 18px" }}>导入并核对</button>
    </form>
    <p><Link href="/api/migrate">查看在线资料核对结果</Link></p>
  </main>;
}
