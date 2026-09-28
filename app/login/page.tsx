import { cookies } from "next/headers";
import { getEditorIdentity, SESSION_COOKIE } from "../editor-credentials";
import LoginForm from "../editor-login/login-form";
import LogoutButton from "./logout-button";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const identity = await getEditorIdentity();
  const sessionPresent = (await cookies()).has(SESSION_COOKIE);
  return <main className="editor-auth-page"><section className="editor-auth-card">
    <a href="/" className="editor-auth-home">← 返回网站</a>
    <p className="editor-eyebrow">SITE EDITOR</p>
    <h1>网站管理登录</h1>
    {identity ? <div className="editor-login-current">
      <p>当前账号：{identity.email}</p>
      <p>{identity.role === "owner" ? "管理员" : "团队成员"}</p>
      <a href="/edit">进入编辑器 →</a>
      <LogoutButton label="退出并切换账号" />
    </div> : <>
      {sessionPresent && <p role="status">登录已失效，请重新登录。</p>}
      <LoginForm />
    </>}
  </section></main>;
}
