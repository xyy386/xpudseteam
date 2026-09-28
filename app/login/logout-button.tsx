"use client";

import { useState } from "react";

export default function LogoutButton({ label = "退出登录" }: { label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/editor-session", { method: "DELETE" });
      if (!response.ok) throw new Error("退出失败，请重试");
      window.location.assign("/login");
    } catch {
      setError("退出失败，请重试");
      setBusy(false);
    }
  }
  return <span className="editor-logout"><button type="button" onClick={logout} disabled={busy}>
    {busy ? "退出中…" : label}
  </button>{error && <span role="alert">{error}</span>}</span>;
}
