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
    {identity ? <p>当前已登录为 {identity.email}。<a href="/edit">进入编辑器 →</a></p> : <>
      <LoginForm />
      <p className="editor-auth-owner">网站管理员可使用 <a href={chatGPTSignInPath("/edit")} target="_top">ChatGPT 管理员身份登录</a>。</p>
    </>}
  </section></main>;
}
