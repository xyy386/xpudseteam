"use client";

import { useState } from "react";

export default function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function change(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/editor-session", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current, next }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "修改失败");
      setCurrent(""); setNext(""); setMessage("密码已更新，请重新登录。原有登录会话已退出。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "修改失败"); }
    finally { setBusy(false); }
  }
  return <form onSubmit={change} className="editor-auth-form">
    <h2>修改网站密码</h2>
    <label>当前密码<input type="password" autoComplete="current-password" required value={current} onChange={(event) => setCurrent(event.target.value)} /></label>
    <label>新密码（至少 12 位）<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={next} onChange={(event) => setNext(event.target.value)} /></label>
    <button type="submit" disabled={busy}>{busy ? "更新中…" : "更新密码"}</button>
    {message && <p role="status">{message} <a href="/login">返回登录</a></p>}
  </form>;
}
