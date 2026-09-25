"use client";

import { useEffect, useRef, useState } from "react";
import type { SyncEnvironment } from "../sync-environment";

const CHANNEL = "research-site-sync-v1";
const MAX_MESSAGE_LENGTH = 50 * 1024 * 1024;
const sectionNames: Record<string, string> = {
  siteName: "网站名称", institution: "单位信息", contact: "联系信息", contactDetails: "联系详情",
  hero: "首页横幅", sectionTitles: "栏目标题", sectionIntros: "栏目介绍", pageText: "页面文字",
  backgrounds: "栏目背景", backgroundVisibility: "背景效果", appearance: "电脑端样式",
  appearanceMobile: "手机端样式", members: "团队成员", directions: "研究方向",
  archives: "新闻与资料", customSections: "自定义栏目",
};

function describeSections(sections: string[]): string {
  return sections.length ? sections.map((section) => sectionNames[section] ?? section).join("、") : "内容相同";
}

function describePath(path: string): string {
  const section = path.split(/[.[]/, 1)[0];
  return (sectionNames[section] ?? section) + " · " + path;
}

type BridgeMessage = {
  channel: typeof CHANNEL; nonce: string;
  action: "ready" | "snapshot" | "prepared" | "commit" | "complete" | "error";
  role?: SyncEnvironment; snapshotText?: string; sourceRevision?: string;
  targetRevision?: string; revision?: string; backupId?: string;
  changedSections?: string[]; changedPaths?: string[]; affectedPaths?: string[];
  conflicts?: string[]; assetCount?: number; assetBytes?: number;
  backupVerified?: boolean; canApply?: boolean; mirrorSnapshotText?: string; error?: string;
};
type Preview = {
  canApply: boolean; warning: string; sourceRevision: string; targetRevision: string;
  changedSections: string[]; changedPaths: string[]; affectedPaths: string[];
  conflicts: string[]; assetCount: number; assetBytes: number;
  backupId?: string; backupVerified?: boolean;
};
type ApplyResult = { ok?: boolean; revision?: string; backupId?: string; changedSections?: string[]; error?: string };
type BackupItem = { id: string; size: number; uploaded: string };
type SourceSession = {
  nonce: string; popup: Window; phase: "opening" | "exporting" | "waiting" | "review" | "committing";
  sourceRevision: string; timer: ReturnType<typeof setTimeout> | null; prepared: Preview | null;
};
type TargetSession = {
  nonce: string; opener: Window; phase: "awaiting" | "previewing" | "prepared" | "applying" | "done";
  snapshotText: string; targetRevision: string; backupId: string;
};

function bridgeMessage(nonce: string, action: BridgeMessage["action"], more: Partial<BridgeMessage> = {}): BridgeMessage {
  return { channel: CHANNEL, nonce, action, ...more };
}
function resultError(value: unknown, fallback: string): string {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string"
    ? value.error : fallback;
}
async function jsonResult(response: Response): Promise<Record<string, unknown>> {
  try { return await response.json() as Record<string, unknown>; }
  catch { return {}; }
}

export default function SyncWorkspace({ environment, peerOrigin, localDataDir, hasOnlineBase,
  compact = false, canStart = true, onSynchronized }: {
  environment: SyncEnvironment; peerOrigin: string; localDataDir: string; hasOnlineBase: boolean;
  compact?: boolean; canStart?: boolean; onSynchronized?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [baseReady, setBaseReady] = useState(hasOnlineBase);
  const [message, setMessage] = useState("");
  const [bridgeTarget, setBridgeTarget] = useState(false);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [lastResult, setLastResult] = useState<{ changedSections: string[]; backupId: string } | null>(null);
  const [review, setReview] = useState<Preview | null>(null);
  const [synced, setSynced] = useState(false);
  const sourceRef = useRef<SourceSession | null>(null);
  const targetRef = useRef<TargetSession | null>(null);
  const canStartRef = useRef(canStart);
  const onSynchronizedRef = useRef(onSynchronized);
  canStartRef.current = canStart;
  onSynchronizedRef.current = onSynchronized;

  async function refreshBackups() {
    try {
      const response = await fetch("/api/site-snapshot?action=backups", { cache: "no-store" });
      if (response.ok) {
        const result = await response.json() as { items?: BackupItem[] };
        setBackups(result.items ?? []);
      }
    } catch { /* Backup history is optional for page rendering. */ }
  }

  async function commitPrepared(session: SourceSession) {
    if (sourceRef.current !== session || session.phase !== "review"
      || !session.prepared?.canApply || !session.prepared.backupVerified) return;
    if (!canStartRef.current) {
      sourceRef.current = null; setBusy(false); setReview(null);
      setMessage("编辑页出现未保存的修改。请先保存，再重新同步。");
      session.popup.postMessage(bridgeMessage(session.nonce, "error", { error: "来源出现未保存的修改" }), peerOrigin);
      return;
    }
    session.phase = "committing";
    setMessage("正在复核来源修订并自动应用已验证的内容…");
    try {
      const response = await fetch("/api/site-content", { cache: "no-store" });
      if (!response.ok) throw new Error("无法复核本站最新修订");
      const current = await response.json() as { revision?: string };
      if (current.revision !== session.sourceRevision) throw new Error("来源内容在预检期间发生变化，请重新同步");
      setReview(null);
      session.timer = setTimeout(() => {
        if (sourceRef.current === session) {
          sourceRef.current = null; setBusy(false);
          setMessage("目标应用超时。请先查看目标窗口的实际状态，避免重复操作。");
        }
      }, 120_000);
      session.popup.postMessage(bridgeMessage(session.nonce, "commit"), peerOrigin);
    } catch (error) {
      if (session.timer) clearTimeout(session.timer);
      sourceRef.current = null; setBusy(false); setReview(null);
      const reason = error instanceof Error ? error.message : "来源修订复核失败";
      setMessage(reason);
      session.popup.postMessage(bridgeMessage(session.nonce, "error", { error: reason }), peerOrigin);
    }
  }

  useEffect(() => {
    if (!compact) void refreshBackups();
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const nonce = hash.get("syncNonce");
    if (nonce && /^[a-f0-9-]{36}$/.test(nonce)) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      if (window.opener) {
        targetRef.current = { nonce, opener: window.opener, phase: "awaiting", snapshotText: "", targetRevision: "", backupId: "" };
        setBridgeTarget(true); setBusy(true);
        setMessage("已连接到同步发起页，正在等待内容与附件…");
        window.opener.postMessage(bridgeMessage(nonce, "ready", { role: environment }), peerOrigin);
      } else setMessage("浏览器没有保留同步窗口连接。请返回原页面，再点击同步按钮。");
    }

    function sourceFailed(session: SourceSession, reason: string) {
      if (session.timer) clearTimeout(session.timer);
      if (sourceRef.current !== session) return;
      sourceRef.current = null;
      setBusy(false); setReview(null); setMessage(reason);
      try { session.popup.postMessage(bridgeMessage(session.nonce, "error", { error: reason }), peerOrigin); }
      catch { /* The other window may already be closed. */ }
    }
    function targetFailed(session: TargetSession, reason: string) {
      if (targetRef.current !== session) return;
      session.phase = "done";
      setBusy(false); setMessage(reason);
      try { session.opener.postMessage(bridgeMessage(session.nonce, "error", { error: reason }), peerOrigin); }
      catch { /* The source window may already be closed. */ }
    }

    async function handleSource(message: BridgeMessage, session: SourceSession) {
      if (message.action === "error") {
        sourceFailed(session, message.error || "目标环境未能完成同步");
        return;
      }
      if (message.action === "ready" && session.phase === "opening") {
        if (message.role === environment) return sourceFailed(session, "同步目标环境不正确");
        if (session.timer) clearTimeout(session.timer);
        session.timer = setTimeout(() => sourceFailed(session, "同步等待超时。请在目标窗口确认登录和网络连接。"), 120_000);
        session.phase = "exporting";
        setMessage("目标环境已连接，正在读取本站内容与附件…");
        try {
          const response = await fetch("/api/site-snapshot", { cache: "no-store" });
          if (!response.ok) throw new Error(resultError(await jsonResult(response), "本站快照读取失败"));
          const snapshotText = await response.text();
          if (snapshotText.length > MAX_MESSAGE_LENGTH) throw new Error("内容与附件超过同步上限");
          const snapshot = JSON.parse(snapshotText) as { content?: { revision?: string }; origin?: string };
          if (typeof snapshot.content?.revision !== "string" || snapshot.origin !== environment) throw new Error("本站快照格式不正确");
          session.sourceRevision = snapshot.content.revision;
          session.phase = "waiting";
          session.popup.postMessage(bridgeMessage(session.nonce, "snapshot", { snapshotText, sourceRevision: session.sourceRevision }), peerOrigin);
          setMessage("内容已安全传至目标页面，正在检查冲突并自动备份…");
        } catch (error) { sourceFailed(session, error instanceof Error ? error.message : "快照传递失败"); }
        return;
      }
      if (message.action === "prepared" && session.phase === "waiting") {
        if (message.sourceRevision !== session.sourceRevision || typeof message.targetRevision !== "string"
          || typeof message.canApply !== "boolean" || !Array.isArray(message.changedSections)
          || !Array.isArray(message.changedPaths) || !Array.isArray(message.affectedPaths)
          || !Array.isArray(message.conflicts)
          || !Number.isInteger(message.assetCount) || !Number.isInteger(message.assetBytes)) {
          return sourceFailed(session, "目标预检信息不完整，已取消同步");
        }
        if (message.canApply && (!message.backupVerified || !message.backupId)) {
          return sourceFailed(session, "目标备份未完成，已取消同步");
        }
        if (session.timer) clearTimeout(session.timer);
        session.timer = null;
        session.phase = "review";
        const preview: Preview = {
          canApply: message.canApply, warning: message.canApply ? "" : "发现双方修改同一位置，请先人工核对。",
          sourceRevision: message.sourceRevision,
          targetRevision: message.targetRevision, changedSections: message.changedSections,
          changedPaths: message.changedPaths, affectedPaths: message.affectedPaths,
          conflicts: message.conflicts,
          assetCount: message.assetCount!, assetBytes: message.assetBytes!,
          backupId: message.backupId, backupVerified: message.backupVerified,
        };
        session.prepared = preview;
        if (compact && message.canApply) {
          setMessage("预检、附件校验和目标备份已通过，正在自动同步…");
          void commitPrepared(session);
        } else {
          setReview(preview);
          setMessage(message.canApply
            ? "目标已完成附件校验和自动备份。请核对下方路径，再明确确认应用。"
            : "发现冲突，目标未被修改。请查看冲突路径并人工核对。");
          if (compact && !message.canApply) {
            sourceRef.current = null;
            setBusy(false);
          }
        }
        return;
      }
      if (message.action === "complete" && session.phase === "committing") {
        if (session.timer) clearTimeout(session.timer);
        sourceRef.current = null; setBusy(false); setReview(null);
        if (environment === "local" && message.revision) {
          try {
            if (!message.mirrorSnapshotText) throw new Error("线上未返回更新后快照");
            const mirror = JSON.parse(message.mirrorSnapshotText) as { origin?: string; content?: { revision?: string } };
            if (mirror.origin !== "online" || mirror.content?.revision !== message.revision) {
              throw new Error("线上更新后快照修订不一致");
            }
            const response = await fetch("/api/site-snapshot?action=ack", {
              method: "POST", headers: { "Content-Type": "application/json",
                "X-Expected-Revision": session.sourceRevision },
              body: message.mirrorSnapshotText,
            });
            if (!response.ok) throw new Error(resultError(await jsonResult(response), "本地内容更新失败"));
            setBaseReady(true);
            setMessage(compact
              ? "同步完成。本地已接收线上其他更新，两边内容一致。目标网页已在新窗口打开。"
              : "同步完成。本地已接收线上其他更新，两边内容一致。两边原内容均有备份。");
            setSynced(true);
            void onSynchronizedRef.current?.();
            if (compact) try { session.popup.location.href = peerOrigin + "/"; } catch { /* The target link remains available. */ }
          } catch {
            setMessage("线上已更新，但本地未能接收更新后快照。请从线上同步到本地并核对，再做下一次修改。");
          }
        } else {
          setMessage(compact
            ? "同步完成。本地原内容已自动备份。目标网页已在新窗口打开。"
            : "同步完成。本地原内容已自动备份。");
          setSynced(true);
          void onSynchronizedRef.current?.();
          if (compact) try { session.popup.location.href = peerOrigin + "/"; } catch { /* The target link remains available. */ }
        }
        setLastResult({ changedSections: message.changedSections ?? [], backupId: message.backupId ?? "" });
        if (!compact) void refreshBackups();
      }
    }

    async function handleTarget(message: BridgeMessage, session: TargetSession) {
      if (message.action === "error") return targetFailed(session, message.error || "来源环境取消了同步");
      if (message.action === "snapshot" && session.phase === "awaiting") {
        session.phase = "previewing";
        setMessage("已收到来源内容，正在校验文件、附件和修订…");
        try {
          if (!message.snapshotText || message.snapshotText.length > MAX_MESSAGE_LENGTH) throw new Error("同步内容超过上限或为空");
          const snapshot = JSON.parse(message.snapshotText) as { origin?: string; content?: { revision?: string } };
          if (snapshot.origin === environment || typeof snapshot.content?.revision !== "string"
            || snapshot.content.revision !== message.sourceRevision) throw new Error("来源环境或修订信息不正确");
          session.snapshotText = message.snapshotText;
          const response = await fetch("/api/site-snapshot?action=prepare", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: session.snapshotText,
          });
          const result = await response.json() as Preview & { error?: string };
          if (!response.ok) throw new Error(result.error || result.warning || "预检未通过");
          session.targetRevision = result.targetRevision;
          session.backupId = result.backupId ?? "";
          session.phase = result.canApply ? "prepared" : "done";
          if (!result.canApply) setBusy(false);
          session.opener.postMessage(bridgeMessage(session.nonce, "prepared", {
            sourceRevision: result.sourceRevision, targetRevision: result.targetRevision,
            changedSections: result.changedSections, assetCount: result.assetCount,
            changedPaths: result.changedPaths, affectedPaths: result.affectedPaths,
            conflicts: result.conflicts, canApply: result.canApply,
            assetBytes: result.assetBytes, backupId: result.backupId, backupVerified: result.backupVerified,
          }), peerOrigin);
          setMessage(result.canApply
            ? "目标备份已完成，正在等待发起页继续同步。"
            : "发现同一位置被双方修改。请在发起页查看冲突路径；目标未被修改。");
        } catch (error) { targetFailed(session, error instanceof Error ? error.message : "预检失败"); }
        return;
      }
      if (message.action === "commit" && session.phase === "prepared") {
        session.phase = "applying";
        setMessage("目标备份已保存，正在导入图片、附件和正文…");
        try {
          const response = await fetch("/api/site-snapshot?action=apply", {
            method: "POST", headers: { "Content-Type": "application/json", "X-Expected-Revision": session.targetRevision,
              "X-Prepared-Backup-Id": session.backupId },
            body: session.snapshotText,
          });
          const result = await response.json() as ApplyResult;
          if (!response.ok || !result.ok || !result.revision) throw new Error(result.error || "目标应用失败");
          session.phase = "done"; setBusy(false);
          if (environment === "local") setBaseReady(true);
          setMessage("同步完成。原有内容已自动备份，可以在下方查看和恢复。");
          setLastResult({ changedSections: result.changedSections ?? [], backupId: result.backupId ?? "" });
          void refreshBackups();
          let mirrorSnapshotText = "";
          if (environment === "online") {
            try {
              const mirrorResponse = await fetch("/api/site-snapshot", { cache: "no-store" });
              if (mirrorResponse.ok) {
                const text = await mirrorResponse.text();
                if (text.length <= MAX_MESSAGE_LENGTH) mirrorSnapshotText = text;
              }
            } catch { /* The source window reports that local reconciliation is needed. */ }
          }
          session.opener.postMessage(bridgeMessage(session.nonce, "complete", {
            revision: result.revision, backupId: result.backupId, changedSections: result.changedSections,
            mirrorSnapshotText,
          }), peerOrigin);
        } catch (error) { targetFailed(session, error instanceof Error ? error.message : "应用失败"); }
      }
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== peerOrigin || !event.data || typeof event.data !== "object") return;
      const message = event.data as BridgeMessage;
      if (message.channel !== CHANNEL || !/^[a-f0-9-]{36}$/.test(message.nonce)) return;
      const source = sourceRef.current;
      if (source && event.source === source.popup && message.nonce === source.nonce) {
        void handleSource(message, source);
        return;
      }
      const target = targetRef.current;
      if (target && event.source === target.opener && message.nonce === target.nonce) void handleTarget(message, target);
    }
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (sourceRef.current?.timer) clearTimeout(sourceRef.current.timer);
    };
  }, [environment, peerOrigin, compact]);

  function startSync() {
    if (busy || bridgeTarget) return;
    if (!canStartRef.current) { setMessage("请先保存全部修改，再点击同步。"); return; }
    setSynced(false);
    setReview(null);
    setLastResult(null);
    const nonce = crypto.randomUUID();
    const destination = peerOrigin + "/editor-sync#syncNonce=" + encodeURIComponent(nonce);
    const popup = window.open(destination, "_blank");
    if (!popup) {
      setMessage("浏览器阻止了同步窗口。请允许本站打开新窗口后重试。");
      return;
    }
    const session: SourceSession = { nonce, popup, phase: "opening", sourceRevision: "", timer: null, prepared: null };
    session.timer = setTimeout(() => {
      if (sourceRef.current === session) {
        sourceRef.current = null; setBusy(false);
        setMessage(environment === "online"
          ? "本地预览未能连接。请双击“启动本地预览.command”后重试；也请确认目标窗口已登录。"
          : "线上同步页未能连接。请检查网络、目标窗口登录状态，以及线上是否已部署新版。");
      }
    }, 18_000);
    sourceRef.current = session;
    setBusy(true);
    setMessage("已打开目标窗口，正在等待管理员登录和页面连接…");
  }

  async function confirmSync() {
    const session = sourceRef.current;
    if (session) await commitPrepared(session);
  }

  function cancelSync() {
    const session = sourceRef.current;
    if (!session || session.phase !== "review") return;
    if (session.timer) clearTimeout(session.timer);
    sourceRef.current = null; setBusy(false); setReview(null);
    setMessage("已取消本次同步；目标内容未改动，预检备份会保留。");
    session.popup.postMessage(bridgeMessage(session.nonce, "error", { error: "管理员取消了本次同步" }), peerOrigin);
  }

  async function downloadCurrentBackup() {
    if (busy) return;
    setBusy(true); setMessage("正在核对内容与附件并生成完整备份…");
    try {
      const created = await fetch("/api/site-snapshot?action=backup-current", { method: "POST" });
      const result = await created.json() as { ok?: boolean; backupId?: string; error?: string };
      if (!created.ok || !result.ok || !result.backupId) throw new Error(result.error || "备份生成失败");
      const response = await fetch("/api/site-snapshot?action=backup&id=" + encodeURIComponent(result.backupId));
      if (!response.ok) throw new Error(resultError(await jsonResult(response), "备份读取失败"));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "site-backup-" + result.backupId + ".json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage("完整备份已保存在本站，编号 " + result.backupId + "；浏览器也已开始下载副本。");
      void refreshBackups();
    } catch (error) { setMessage(error instanceof Error ? error.message : "备份失败"); }
    finally { setBusy(false); }
  }

  async function restoreBackup(id: string) {
    if (busy || !window.confirm("要用这份备份替换当前环境的内容吗？系统会先自动备份当前内容。")) return;
    setBusy(true); setMessage("正在核对当前修订并恢复备份…");
    try {
      const currentResponse = await fetch("/api/site-content", { cache: "no-store" });
      if (!currentResponse.ok) throw new Error("无法读取当前修订");
      const current = await currentResponse.json() as { revision: string };
      const response = await fetch("/api/site-snapshot?action=restore", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Expected-Revision": current.revision },
        body: JSON.stringify({ backupId: id }),
      });
      const result = await response.json() as ApplyResult;
      if (!response.ok || !result.ok) throw new Error(result.error || "恢复失败");
      setMessage("备份已恢复。恢复前的内容也已自动备份，请刷新网站核对。");
      void refreshBackups();
    } catch (error) { setMessage(error instanceof Error ? error.message : "恢复失败"); }
    finally { setBusy(false); }
  }

  if (compact) return <div className="editor-quick-sync">
    <button type="button" disabled={busy || !canStart} onClick={startSync}
      title={!canStart ? "请先保存全部修改，再同步" : undefined}>
      {busy ? "同步中…" : environment === "online" ? "同步到本地" : "同步到线上"}
    </button>
    {!canStart && <span className="editor-quick-sync-hint">请先保存全部修改</span>}
    {message && <span role="status" className="editor-quick-sync-message">{message}</span>}
    {synced && <a href={peerOrigin + "/"} target="_blank" rel="noopener noreferrer">查看目标网页 ↗</a>}
    {review && !review.canApply && <div role="alert" className="editor-quick-sync-conflict">
      <strong>同步已停止，目标内容未改动。</strong>
      {review.conflicts.length > 0 && <p>冲突位置：{review.conflicts.map(describePath).join("；")}</p>}
      <a href="/editor-sync">查看同步详情与备份</a>
    </div>}
  </div>;

  return <div className="editor-sync-workspace">
    <section className="editor-sync-step">
      <h2>{bridgeTarget ? "自动同步目标窗口" : environment === "online" ? "线上内容 → 本地预览" : "本地修改 → 线上网站"}</h2>
      <p>{bridgeTarget ? "这个窗口由另一环境发起同步；正在校验内容和权限。请勿关闭。"
        : environment === "online"
          ? "线上编辑保存后，点击一次即可把网站内容、图片和附件传到本地。原本地内容会自动备份。"
          : "本地编辑保存并核对后，点击一次即可只把本地修改处合并到线上；线上其他内容会保留。同一位置双方都改过时会提示冲突。"}</p>
      {!bridgeTarget && <button type="button" disabled={busy} onClick={startSync}>
        {busy ? "同步进行中…" : environment === "online" ? "同步到本地" : "同步到线上"}
      </button>}
      {environment === "local" && !baseReady && <p className="editor-help" role="status">
        本地尚无上次线上内容作为比较基线。首次使用请先在线上管理员同步页点击“同步到本地”；应用前会显示差异并自动备份当前本地内容。
      </p>}
      {environment === "online" && <p className="editor-help">本地预览须在同一台电脑运行。如果目标窗口无法打开，请先双击本地项目中的“启动本地预览.command”。</p>}
      <p className="editor-help">浏览器将在另一环境打开管理员页面，通过限定来源的一次性窗口消息传递内容；两个页面各自使用自己的登录状态。不会传账号或密码。</p>
    </section>
    {message && <p role="status" className="editor-sync-status">{message}</p>}
    {review && <section className="editor-sync-preview" aria-label="同步前审核">
      <h2>同步前审核 · 尚未覆盖目标</h2>
      <p>来源修订：<code>{review.sourceRevision || "初始内容"}</code></p>
      <p>目标修订：<code>{review.targetRevision || "初始内容"}</code></p>
      <p>{environment === "online" ? "线上与本地的差异：" : "本地改变的路径："}</p>
      {review.changedPaths.length ? <ul>{review.changedPaths.map((path) => <li key={path}>{describePath(path)}</li>)}</ul> : <p>{environment === "online" ? "内容无差异。" : "无本地内容变更。"}</p>}
      <p>目标将受影响的位置：</p>
      {review.affectedPaths.length ? <ul>{review.affectedPaths.map((path) => <li key={path}>{describePath(path)}</li>)}</ul> : <p>目标内容无需修改。</p>}
      {review.conflicts.length > 0 && <><p role="alert">{review.warning}</p>
        <p>冲突位置：</p><ul>{review.conflicts.map((path) => <li key={path}>{describePath(path)}</li>)}</ul></>}
      <p>需要传送的附件：{review.assetCount} 个（{(review.assetBytes / 1024 / 1024).toFixed(2)} MB）。</p>
      {review.backupVerified && review.backupId && <p>目标自动备份：已完成，编号 <code>{review.backupId}</code>。</p>}
      <div className="editor-sync-review-actions">
        {review.canApply && <button type="button" onClick={() => void confirmSync()}>确认应用到{environment === "local" ? "线上网站" : "本地预览"}</button>}
        <button type="button" onClick={cancelSync}>取消同步</button>
      </div>
    </section>}
    {lastResult && <p>本次变更：{describeSections(lastResult.changedSections)}。{lastResult.backupId && "目标自动备份编号：" + lastResult.backupId}</p>}
    {environment === "local" && <section className="editor-sync-step"><h2>本地资料存储位置</h2>
      <p>页面内容、成员、研究方向、新闻稿、上传的图片与附件以及同步备份，统一保存在本地数据目录。项目源码位置与该目录分开。</p>
      <p>当前实际目录：<code>{localDataDir || "尚未读取到目录配置"}</code></p>
      <p>若要更改目录，请在项目文件夹双击“选择本地数据位置.command”，在系统文件夹选择器里选定位置。工具会暂停预览、完整复制并校验数据、重启预览；旧目录保留为备份。网页本身无法直接写入任意磁盘路径。</p>
    </section>}
    <details className="editor-sync-preview"><summary>查看或恢复本环境备份</summary>
      <p><button type="button" disabled={busy} onClick={() => void downloadCurrentBackup()}>
        生成并下载当前完整备份（内容与引用附件）
      </button></p>
      {backups.length ? <ul>{backups.map((item) => <li key={item.id}>
        <span>{new Date(item.uploaded).toLocaleString("zh-CN")} · {(item.size / 1024 / 1024).toFixed(2)} MB </span>
        <a href={"/api/site-snapshot?action=backup&id=" + encodeURIComponent(item.id)}>下载</a>
        <button type="button" disabled={busy} onClick={() => void restoreBackup(item.id)}>恢复</button>
      </li>)}</ul> : <p>尚无自动备份。</p>}
    </details>
  </div>;
}
