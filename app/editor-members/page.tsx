import { getEditorIdentity } from "../editor-credentials";
import MembersManager from "./members-manager";

export const dynamic = "force-dynamic";

export default async function EditorMembersPage() {
  const identity = await getEditorIdentity();
  if (!identity || identity.role !== "owner") return <main className="editor-auth-page"><section className="editor-auth-card"><h1>仅管理员可管理成员</h1><a href="/edit">返回编辑器</a></section></main>;
  return <main className="editor-auth-page"><section className="editor-auth-card editor-members-card">
    <a href="/edit" className="editor-auth-home">← 返回编辑器</a>
    <h1>临时编辑成员</h1>
    <p>创建后请自行把邮箱、初始密码和编辑地址发给成员。初始密码仅在此处显示一次。</p>
    <MembersManager />
  </section></main>;
}
