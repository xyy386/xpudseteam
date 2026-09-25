import { getEditorIdentity } from "../editor-credentials";
import SyncWorkspace from "./sync-workspace";

export const dynamic = "force-dynamic";

export default async function EditorSyncPage() {
  const identity = await getEditorIdentity();
  if (identity?.role !== "owner") return <main className="editor-auth-page"><section className="editor-auth-card">
    <h1>仅管理员可同步网站</h1><a href="/editor-login">返回登录</a>
  </section></main>;
  return <main className="editor-auth-page"><section className="editor-auth-card editor-sync-card">
    <a href="/edit" className="editor-auth-home">← 返回编辑器</a>
    <h1>网站内容与附件同步</h1>
    <p>当前环境：<strong>{import.meta.env.DEV ? "本地预览" : "线上网站"}</strong>。快照只包含网站内容和正文引用的图片、PDF、DOCX；不包含成员账号、密码或登录会话。</p>
    <SyncWorkspace environment={import.meta.env.DEV ? "local" : "online"} />
  </section></main>;
}
