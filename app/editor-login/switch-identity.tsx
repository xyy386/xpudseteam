"use client";

import { useState } from "react";

export default function SwitchIdentity() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function switchIdentity() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/editor-session", { method: "DELETE" });
      if (!response.ok) throw new Error("切换身份失败，请重试");
      window.location.assign("/editor-login");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "切换身份失败，请重试");
      setBusy(false);
    }
  }

  return <><button type="button" onClick={switchIdentity} disabled={busy}>
    {busy ? "切换中…" : "退出成员账号并切换身份"}
  </button>{error && <p role="alert">{error}</p>}</>;
}
