import { redirect } from "next/navigation";
import { getEditorIdentity } from "../editor-credentials";
import PasswordForm from "./password-form";

export const dynamic = "force-dynamic";

export default async function EditorAccountPage() {
  const identity = await getEditorIdentity();
  if (!identity) redirect("/login");
  return <main className="editor-auth-page"><section className="editor-auth-card">
    <a href="/edit" className="editor-auth-home">← 返回编辑器</a>
    <h1>账号设置</h1>
    <p>{identity.email}</p>
    {identity.role === "member" ? <><p>授权有效至 {new Date(identity.expiresAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}。</p></> : <p>管理员账号</p>}
    <PasswordForm />
  </section></main>;
}
