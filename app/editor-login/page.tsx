import { chatGPTSignInPath } from "../chatgpt-auth";
import { getEditorIdentity } from "../editor-credentials";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function EditorLoginPage() {
  const identity = await getEditorIdentity();
  return <main className="editor-auth-page"><section className="editor-auth-card">
    <a href="/" className="editor-auth-home">← 返回网站</a>
    <p className="editor-eyebrow">SITE EDITOR</p>
    <h1>登录网站编辑器</h1>
    {identity?.role === "member" ? <p>当前已登录为 {identity.email}。<a href="/edit">进入编辑器 →</a></p> : <>
      <LoginForm />
      {identity?.role === "owner" ? <p className="editor-auth-owner">您的 ChatGPT 管理员身份已验证。<a href="/edit">以管理员身份继续 →</a> 此入口也可用于恢复管理权限。</p>
        : <p className="editor-auth-owner">网站管理员可通过 <a href={chatGPTSignInPath("/edit")} target="_top">ChatGPT 身份验证</a>进入管理后台，或恢复管理权限。团队成员请使用上方网站密码。</p>}
    </>}
  </section></main>;
}
