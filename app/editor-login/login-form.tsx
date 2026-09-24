"use client";

import { useState } from "react";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function login(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/editor-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "登录失败");
      window.location.assign("/edit");
    } catch (error) { setMessage(error instanceof Error ? error.message : "登录失败"); }
    finally { setBusy(false); }
  }
  return <form onSubmit={login} className="editor-auth-form">
    <label>成员邮箱<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label>网站密码<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    <button type="submit" disabled={busy}>{busy ? "登录中…" : "登录并编辑"}</button>
    {message && <p role="alert">{message}</p>}
  </form>;
}
