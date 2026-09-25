import { getEditorIdentity } from "../editor-credentials";
import SyncWorkspace from "./sync-workspace";
import { syncEnvironment, syncPeerOrigin } from "../sync-environment";
import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

export default async function EditorSyncPage() {
  const identity = await getEditorIdentity();
  const environment = syncEnvironment();
  if (identity?.role !== "owner") return <main className="editor-auth-page"><section className="editor-auth-card">
    <h1>仅管理员可同步网站</h1><a href="/editor-login">返回登录</a>
  </section></main>;
  return <main className="editor-auth-page"><section className="editor-auth-card editor-sync-card">
    <a href="/edit" className="editor-auth-home">← 返回编辑器</a>
    <h1>网站内容与附件同步</h1>
    <p>当前环境：<strong>{environment === "local" ? "本地预览" : "线上网站"}</strong>。自动同步只传网站内容和正文引用的图片、PDF、DOCX；不传成员账号、密码或登录会话。</p>
    <SyncWorkspace environment={environment} peerOrigin={syncPeerOrigin()} localDataDir={environment === "local" ? env.SITE_LOCAL_DATA_DIR || "" : ""} />
  </section></main>;
}
