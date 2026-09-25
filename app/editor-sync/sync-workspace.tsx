"use client";

import { useState } from "react";

type Preview = {
  origin: "local" | "online"; sourceRevision: string; baseOnlineRevision: string; targetRevision: string;
  assetCount: number; assetBytes: number; changedSections: string[]; canApply: boolean; warning: string;
};

const sectionNames: Record<string, string> = {
  siteName: "网站名称", institution: "机构信息", contact: "联系信息", contactDetails: "联系方式",
  hero: "首页", sectionTitles: "栏目标题", sectionIntros: "栏目介绍", pageText: "页面文字",
  backgrounds: "背景图片", backgroundVisibility: "背景显示", appearance: "电脑样式",
  appearanceMobile: "手机样式", members: "团队成员", directions: "研究方向",
  archives: "成果与新闻", customSections: "自定义栏目",
};

export default function SyncWorkspace({ environment }: { environment: "local" | "online" }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function downloadSnapshot(purpose: "export" | "backup") {
    setBusy(true); setMessage("正在打包内容和附件…");
    try {
      const response = await fetch("/api/site-snapshot", { cache: "no-store" });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error || "快照下载失败");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `site-snapshot-${environment}-${purpose}-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      if (purpose === "backup") setBackupDownloaded(true);
      setMessage(purpose === "backup"
        ? `当前环境备份已下载（${(blob.size / 1024 / 1024).toFixed(2)} MB），请保管好，再确认应用。`
        : `传递文件已下载（${(blob.size / 1024 / 1024).toFixed(2)} MB），请带到另一环境的同步页。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "快照下载失败"); }
    finally { setBusy(false); }
  }

  async function inspect() {
    if (!file) return;
    setBusy(true); setPreview(null); setReviewed(false); setBackupDownloaded(false); setMessage("正在检查内容与附件完整性…");
    try {
      const response = await fetch("/api/site-snapshot?action=preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: await file.text() });
      const result = await response.json() as Preview & { error?: string };
      if (!response.ok) throw new Error(result.error || "快照预检失败");
      setPreview(result);
      setMessage(result.canApply ? "预检完成。请核对差异、下载当前环境备份，再决定是否应用。" : result.warning);
    } catch (error) { setMessage(error instanceof Error ? error.message : "快照预检失败"); }
    finally { setBusy(false); }
  }

  async function apply() {
    if (!file || !preview || !preview.canApply || !backupDownloaded || !reviewed) return;
    setBusy(true); setMessage("正在核对目标修订并导入附件…");
    try {
      const response = await fetch("/api/site-snapshot?action=apply", { method: "POST",
        headers: { "Content-Type": "application/json", "X-Expected-Revision": preview.targetRevision }, body: await file.text() });
      const result = await response.json() as { error?: string; importedAssets?: number };
      if (!response.ok) throw new Error(result.error || "导入失败");
      setPreview(null); setReviewed(false); setBackupDownloaded(false);
      setMessage(`导入完成，新增 ${result.importedAssets ?? 0} 个附件。请打开编辑器和网站页面核对。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "导入失败"); }
    finally { setBusy(false); }
  }

  const importPanel = <section className="editor-sync-step">
    <h2>{environment === "online" ? "第二步 · 审核并应用本地修改包" : "第一步 · 导入线上现有内容"}</h2>
    <p>{environment === "online"
      ? "选择本地导出的文件。页面会核对附件和线上修订；若线上已有新修改，会拒绝覆盖。"
      : "选择线上下载的文件，先核对将改变的栏目，再应用到本地预览。"}</p>
    <label className="editor-field"><span>选择{environment === "online" ? "本地修改包" : "线上快照"}文件</span><input type="file" accept=".json,application/json" onChange={(event) => {
      setFile(event.target.files?.[0] ?? null); setPreview(null); setReviewed(false); setBackupDownloaded(false); setMessage("");
    }} /></label>
    <button type="button" onClick={() => void inspect()} disabled={!file || busy}>预检差异与附件</button>
    {preview && <div className="editor-sync-preview"><h3>预检结果</h3>
      <p>来源：{preview.origin === "online" ? "线上" : "本地"} · 附件 {preview.assetCount} 个（{(preview.assetBytes / 1024 / 1024).toFixed(2)} MB）</p>
      <p>来源修订：<code>{preview.sourceRevision || "初始内容"}</code></p>
      <p>目标当前修订：<code>{preview.targetRevision || "初始内容"}</code></p>
      <p>已对齐的线上基准：<code>{preview.baseOnlineRevision || "未建立"}</code></p>
      <p>将改变的部分：{preview.changedSections.length ? preview.changedSections.map((key) => sectionNames[key] || key).join("、") : "内容相同"}</p>
      {preview.warning && <p role="alert" className="editor-sync-warning">{preview.warning}</p>}
      {preview.canApply && <><button type="button" onClick={() => void downloadSnapshot("backup")} disabled={busy}>{backupDownloaded ? "重新下载当前环境备份" : "下载当前环境备份"}</button>
        <label className="editor-sync-check"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />我已核对差异，并确认快照中的内容与附件可用于{environment === "online" ? "线上发布" : "本地预览"}。</label>
        <button type="button" onClick={() => void apply()} disabled={busy || !reviewed || !backupDownloaded}>确认应用到{environment === "online" ? "线上网站" : "本地预览"}</button>
        {!backupDownloaded && <p className="editor-help">应用前须先下载当前环境备份。</p>}
      </>}
    </div>}
  </section>;
  const exportPanel = <section className="editor-sync-step">
    <h2>{environment === "online" ? "第一步 · 下载线上基准" : "第三步 · 导出本地修改包"}</h2>
    <p>{environment === "online"
      ? "将线上内容和引用的附件下载为一个文件，再在本地同步页导入。线上内容是修改基准。"
      : "本地修改核对无误后，下载包含内容与附件的文件，带到线上同步页预检并明确应用。"}</p>
    <button type="button" onClick={() => void downloadSnapshot("export")} disabled={busy}>{environment === "online" ? "下载线上内容与附件" : "下载本地修改包"}</button>
  </section>;
  return <div className="editor-sync-workspace">
    <p className="editor-help">当前使用手动快照传递：文件需由管理员在本地和线上页面间带入；不会在两个环境之间自动访问或覆盖内容。</p>
    {environment === "online" ? <>{exportPanel}{importPanel}</> : <>{importPanel}
      <section className="editor-sync-step"><h2>第二步 · 本地修改与预览</h2><p>在本地编辑器修改并保存，打开页面核对新闻稿和附件，再导出修改包。</p><a href="/edit">打开本地编辑器 →</a></section>
      {exportPanel}</>}
    {message && <p role="status">{message}</p>}
  </div>;
}
