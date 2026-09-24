import { requireChatGPTUser } from "../chatgpt-auth";
import { isSiteEditor } from "../editor-auth";
import { getSiteContent } from "../content";
import Editor from "./editor";

export const dynamic = "force-dynamic";

export default async function EditPage() {
  await requireChatGPTUser("/edit");
  if (!(await isSiteEditor())) {
    return <main className="editor-locked"><h1>此账号没有编辑权限</h1><p>网站内容仅限指定管理员修改。</p><a href="/">返回网站</a></main>;
  }
  const content = await getSiteContent();
  return <Editor initial={content} />;
}
