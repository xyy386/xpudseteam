"use client";

import { useEffect, useState } from "react";
import type { NewsArticle, SiteContent } from "../content";
import { importNewsFile } from "../edit/news-import";

type Proposal = {
  suggestedHeadline: string; summary: string; newsBody: string;
  paperTitle: string; authors: string; venue: string; paperDate: string;
  evidence: Array<{ claim: string; location: string }>; warnings: string[];
};
type PaperMetadata = {
  sourceUrl: string; doi: string; title: string; authors: string; venue: string;
  publishedDate: string; abstract: string; warnings: string[];
};

function emptyDraft(): NewsArticle {
  return { id: crypto.randomUUID(), status: "draft", title: "", date: "", source: "", externalUrl: "",
    summary: "", body: "", thumbnail: "", images: [], attachment: "", attachmentName: "", importWarnings: [] };
}

export default function AiWorkspace() {
  const [draft, setDraft] = useState<NewsArticle | null>(null);
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [modelMessage, setModelMessage] = useState("正在检查模型状态…");
  const [modelConfigured, setModelConfigured] = useState(false);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/editor-ai", { cache: "no-store" }).then(async (response) => {
      const result = await response.json() as { message?: string; error?: string; modelConfigured?: boolean };
      setModelMessage(result.message || result.error || "模型状态不可用");
      setModelConfigured(Boolean(result.modelConfigured));
    }).catch(() => setModelMessage("模型状态不可用，仍可手工整理资料"));
  }, []);

  async function fromFile(file: File) {
    setBusy(true); setMessage("正在提取资料并上传原件…");
    setSourceFile(null); setProposal(null);
    try {
      const imported = await importNewsFile(file, setMessage);
      setDraft({ ...emptyDraft(), body: imported.body, summary: imported.summary, images: imported.images,
        attachment: imported.attachment, attachmentName: imported.attachmentName, importWarnings: imported.warnings });
      setSourceFile(file);
      setMessage("资料已整理为未发布草稿。请对照原件核对并补齐信息。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "资料提取失败"); }
    finally { setBusy(false); }
  }

  async function fromLink() {
    const value = link.trim();
    const sourceUrl = /^10\.\d{4,9}\//i.test(value) ? `https://doi.org/${value}` : value;
    try { if (new URL(sourceUrl).protocol !== "https:") throw new Error(); }
    catch { setMessage("请输入完整的 HTTPS 论文链接或 DOI"); return; }
    setBusy(true); setSourceFile(null); setProposal(null); setMessage("正在读取公开的论文元数据…");
    try {
      const response = await fetch("/api/editor-ai?action=metadata", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: sourceUrl }),
      });
      const result = await response.json() as { metadata?: PaperMetadata; error?: string };
      if (!response.ok || !result.metadata) throw new Error(result.error || "元数据读取失败");
      const metadata = result.metadata;
      const details = [
        "> 以下仅整理公开元数据与摘要，尚未读取论文全文。发布前请上传 PDF 核对。",
        metadata.title && `论文题名：${metadata.title}`,
        metadata.authors && `作者：${metadata.authors}`,
        metadata.venue && `刊物／平台：${metadata.venue}`,
        metadata.publishedDate && `论文发表日期：${metadata.publishedDate}（非新闻发布日期）`,
        metadata.doi && `DOI：${metadata.doi}`,
        metadata.abstract && `公开摘要：${metadata.abstract}`,
      ].filter(Boolean).join("\n\n");
      setDraft({ ...emptyDraft(), title: metadata.title, source: metadata.venue, externalUrl: metadata.sourceUrl,
        summary: metadata.abstract.slice(0, 180), body: details, importWarnings: metadata.warnings });
      setMessage("已读取公开元数据并建立未发布草稿。当前没有论文全文，请上传 PDF 核对研究内容。");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "元数据读取失败";
      setDraft({ ...emptyDraft(), externalUrl: sourceUrl, importWarnings: [reason, "没有读取论文全文；请上传 PDF 或人工补充。"] });
      setMessage(`已建立空白草稿；${reason}`);
    } finally { setBusy(false); }
  }

  function update<K extends keyof NewsArticle>(key: K, value: NewsArticle[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  async function requestAiSuggestion() {
    if (!draft || !modelConfigured) return;
    setBusy(true); setMessage("正在根据原始资料生成建议，请稍候…"); setProposal(null);
    try {
      const form = new FormData();
      if (sourceFile) form.append("file", sourceFile);
      else form.append("sourceUrl", draft.externalUrl);
      const response = await fetch("/api/editor-ai", { method: "POST", body: form });
      const result = await response.json() as { proposal?: Proposal; error?: string; note?: string };
      if (!response.ok || !result.proposal) throw new Error(result.error || "AI 建议未生成");
      setProposal(result.proposal);
      setMessage(result.note || "建议已生成，请先逐项核对原文。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "AI 建议未生成"); }
    finally { setBusy(false); }
  }

  function applyProposal() {
    if (!proposal) return;
    setDraft((current) => current ? {
      ...current,
      title: proposal.suggestedHeadline || current.title,
      summary: proposal.summary || current.summary,
      body: proposal.newsBody
        ? `${proposal.newsBody}${current.body ? `\n\n---\n\n## 原文摘录（待核对）\n\n${current.body}` : ""}`
        : current.body,
      importWarnings: [...current.importWarnings, ...proposal.warnings, "AI 建议和证据位置未经人工核验，发布前请逐项对照原文。"],
    } : current);
    setProposal(null);
    setMessage("建议已填入草稿；新闻发布日期仍需人工填写。请核对并编辑后保存。");
  }

  async function saveDraft() {
    if (!draft) return;
    setBusy(true); setMessage("正在检查最新内容并保存草稿…");
    try {
      const currentResponse = await fetch("/api/site-content", { cache: "no-store" });
      if (!currentResponse.ok) throw new Error("无法读取最新站点内容，请重新登录");
      const content = await currentResponse.json() as SiteContent;
      const next = structuredClone(content);
      const archive = next.archives.find((item) => item.slug === "updates");
      if (!archive) throw new Error("未找到新闻稿栏目，请在编辑器中创建");
      archive.newsArticles.push(draft);
      const response = await fetch("/api/site-content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const result = await response.json() as { error?: string };
      if (response.status === 409) throw new Error("其他编辑者刚更新内容。草稿仍在本页，请再次核对后重试。");
      if (!response.ok) throw new Error(result.error || "草稿保存失败");
      setDraft(null); setMessage("草稿已保存，仅编辑器可见。请在编辑器中人工审核，再由管理员明确发布。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "草稿保存失败"); }
    finally { setBusy(false); }
  }

  return <div className="editor-ai-workspace">
    <p className="editor-sync-warning" role="status">AI 模型：{modelMessage}</p>
    <section><h2>从原始资料开始</h2><label className="editor-upload">选择论文 PDF / DOCX<input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void fromFile(file); event.target.value = ""; }} /></label>
      <label className="editor-field"><span>或粘贴 DOI / 论文网页链接</span><input type="text" value={link} onChange={(event) => setLink(event.target.value)} placeholder="10.1000/… 或 https://doi.org/…" /></label>
      <button type="button" disabled={busy || !link.trim()} onClick={() => void fromLink()}>读取元数据并建立草稿</button>
      <p className="editor-help">DOI 和常见论文平台页面可读取公开题名、作者、摘要等信息；网页通常不提供全文。文档提取也可能有遗漏，请对照原件核对研究内容。</p>
    </section>
    {draft && <section><h2>待审核草稿 · 仅编辑器可见</h2>
      {modelConfigured && <p><button type="button" disabled={busy || (!sourceFile && !draft.externalUrl)} onClick={() => void requestAiSuggestion()}>根据原始资料生成 AI 建议</button>
        <span className="editor-help"> PDF/DOCX 和 arXiv PDF 可供全文分析；DOI/论文网页只按公开摘要起草。上传文件须不超过 8 MB。</span></p>}
      {proposal && <div className="editor-news-warnings"><h3>AI 建议 · 请先核对原文</h3>
        <p><strong>建议标题：</strong>{proposal.suggestedHeadline || "原文未能确认"}</p>
        <p><strong>论文信息：</strong>{[proposal.paperTitle, proposal.authors, proposal.venue, proposal.paperDate].filter(Boolean).join(" · ") || "未能确认"}</p>
        <p><strong>列表摘要：</strong>{proposal.summary || "未能确认"}</p>
        <p><strong>建议正文：</strong></p><pre className="editor-ai-proposal-body">{proposal.newsBody || "未能确认"}</pre>
        <strong>证据位置</strong><ul>{proposal.evidence.map((item, index) => <li key={index}>{item.claim}（{item.location || "位置未注明"}）</li>)}</ul>
        {proposal.warnings.length > 0 && <><strong>需核对</strong><ul>{proposal.warnings.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
        <button type="button" disabled={busy} onClick={applyProposal}>采纳建议并保留原文摘录</button>
      </div>}
      <label className="editor-field"><span>标题（人工填写）</span><input value={draft.title} onChange={(event) => update("title", event.target.value)} /></label>
      <label className="editor-field"><span>发布日期（人工核对）</span><input type="date" value={draft.date} onChange={(event) => update("date", event.target.value)} /></label>
      <label className="editor-field"><span>来源</span><input value={draft.source} onChange={(event) => update("source", event.target.value)} /></label>
      <label className="editor-field"><span>论文或资料链接</span><input type="url" value={draft.externalUrl} onChange={(event) => update("externalUrl", event.target.value)} /></label>
      <label className="editor-field"><span>列表摘要</span><textarea rows={4} value={draft.summary} onChange={(event) => update("summary", event.target.value)} /></label>
      <label className="editor-field"><span>正文与摘录</span><textarea rows={12} value={draft.body} onChange={(event) => update("body", event.target.value)} /></label>
      {draft.attachment && <p>已保存原件：<a href={`${draft.attachment}?name=${encodeURIComponent(draft.attachmentName)}`} target="_blank" rel="noopener noreferrer">{draft.attachmentName || "打开附件"}</a></p>}
      {draft.importWarnings.length > 0 && <div className="editor-news-warnings"><strong>导入提示</strong><ul>{draft.importWarnings.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
      <button type="button" onClick={() => void saveDraft()} disabled={busy}>保存为待审核草稿</button>
      <p className="editor-help">保存草稿不会公开。论文发表日期与新闻发布日期不同；后者请人工填写。发布前仍须在编辑器核对并由管理员明确标记发布。</p>
    </section>}
    {message && <p role="status">{message}</p>}
  </div>;
}
