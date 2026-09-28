"use client";

import { useEffect, useState } from "react";

type Member = { id: string; email: string; expiresAt: number; revokedAt: number | null; createdAt: number };

export default function MembersManager() {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [days, setDays] = useState(7);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState("");

  async function refresh() {
    const response = await fetch("/api/editor-members", { cache: "no-store" });
    const result = await response.json() as { members?: Member[]; error?: string };
    if (!response.ok) throw new Error(result.error || "加载失败");
    setMembers(result.members || []);
  }
  useEffect(() => { void refresh().catch((error) => setMessage(error.message)); }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(""); setSecret(null);
    try {
      const response = await fetch("/api/editor-members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, days }) });
      const result = await response.json() as { error?: string; initialPassword?: string };
      if (!response.ok) throw new Error(result.error || "创建失败");
      setSecret({ email, password: result.initialPassword || "" }); setEmail(""); await refresh();
      setMessage("成员账号已创建。请立即复制初始密码并自行发送给成员。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "创建失败"); }
    finally { setBusy(false); }
  }
  async function act(member: Member, action: "renew" | "revoke" | "reset" | "delete") {
    setBusy(true); setMessage(""); setSecret(null);
    try {
      const response = await fetch("/api/editor-members", { method: action === "delete" ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: member.id, action, days }) });
      const result = await response.json() as { error?: string; initialPassword?: string };
      if (!response.ok) throw new Error(result.error || "操作失败");
      if (result.initialPassword) setSecret({ email: member.email, password: result.initialPassword });
      setDeleteId(""); await refresh();
      setMessage(action === "renew" ? "有效期已延长。" : action === "revoke" ? "授权已撤销，现有会话立即失效。" : action === "delete" ? "成员已删除。" : "密码已重置，旧会话立即失效。请复制新密码。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusy(false); }
  }
  return <>
    <form className="editor-auth-form editor-member-create" onSubmit={create}>
      <label>成员邮箱<input type="email" autoComplete="off" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>授权天数<input type="number" min={1} max={365} value={days} onChange={(event) => setDays(Number(event.target.value))} /></label>
      <button type="submit" disabled={busy}>创建临时账号</button>
    </form>
    {secret && <div className="editor-issued-secret" role="status"><strong>仅显示一次：{secret.email}</strong><code>{secret.password}</code><button type="button" onClick={() => void navigator.clipboard.writeText(`编辑地址：${window.location.origin}/login\n邮箱：${secret.email}\n初始密码：${secret.password}`)}>复制登录信息</button><button type="button" onClick={() => setSecret(null)}>已保存，关闭</button></div>}
    {message && <p role="status">{message}</p>}
    <div className="editor-member-list">{members.length === 0 ? <p>暂无临时成员。</p> : members.map((member) => <article key={member.id}>
      <div><strong>{member.email}</strong><small>{member.revokedAt ? "已撤销" : member.expiresAt <= Date.now() ? "已过期" : "有效"} · 截止 {new Date(member.expiresAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</small></div>
      <div className="editor-member-actions"><button type="button" disabled={busy} onClick={() => void act(member, "renew")}>续期 {days} 天</button><button type="button" disabled={busy} onClick={() => void act(member, "reset")}>重置密码</button><button type="button" disabled={busy || Boolean(member.revokedAt)} onClick={() => void act(member, "revoke")}>撤销</button>
        {deleteId === member.id ? <><button type="button" disabled={busy} onClick={() => void act(member, "delete")}>确认删除</button><button type="button" onClick={() => setDeleteId("")}>取消</button></> : <button type="button" disabled={busy} onClick={() => setDeleteId(member.id)}>删除</button>}
      </div>
    </article>)}</div>
  </>;
}
