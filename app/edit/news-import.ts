"use client";

import TurndownService from "turndown";

type ImportedNews = {
  body: string; summary: string; images: Array<{ image: string; caption: string }>;
  attachment: string; attachmentName: string; warnings: string[];
};

type Mammoth = { convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: Array<{ message: string }> }> };
declare global { interface Window { mammoth?: Mammoth } }

let mammothLoading: Promise<Mammoth> | null = null;

function loadMammoth(): Promise<Mammoth> {
  if (window.mammoth) return Promise.resolve(window.mammoth);
  if (!mammothLoading) mammothLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/mammoth.browser.min.js";
    script.onload = () => window.mammoth ? resolve(window.mammoth) : reject(new Error("Word 解析器未能加载"));
    script.onerror = () => reject(new Error("Word 解析器未能加载"));
    document.head.appendChild(script);
  });
  return mammothLoading;
}

async function uploadFile(file: File, endpoint: string): Promise<{ url: string; name?: string }> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(endpoint, { method: "POST", body: form });
  const result = await response.json() as { url?: string; name?: string; error?: string };
  if (!response.ok || !result.url) throw new Error(result.error || "文件上传失败");
  return { url: result.url, name: result.name };
}

async function imageBlob(dataUrl: string): Promise<Blob> {
  const source = await fetch(dataUrl).then((response) => response.blob());
  if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(source.type)) return source;
  const element = new Image();
  element.src = dataUrl;
  await element.decode();
  const canvas = document.createElement("canvas");
  canvas.width = element.naturalWidth;
  canvas.height = element.naturalHeight;
  canvas.getContext("2d")?.drawImage(element, 0, 0);
  const converted = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!converted) throw new Error("图片格式无法转换");
  return converted;
}

async function importDocx(file: File, progress: (message: string) => void): Promise<Omit<ImportedNews, "attachment" | "attachmentName">> {
  progress("正在解析 Word 文档…");
  const mammoth = await loadMammoth();
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const document = new DOMParser().parseFromString(result.value, "text/html");
  const warnings = result.messages.map((item) => item.message);
  const images: ImportedNews["images"] = [];
  const elements = Array.from(document.querySelectorAll("img"));
  for (let index = 0; index < elements.length; index++) {
    const element = elements[index];
    const src = element.getAttribute("src") || "";
    if (!src.startsWith("data:image/")) { warnings.push(`第 ${index + 1} 张图片无法自动读取，请对照原文件补录。`); element.remove(); continue; }
    progress(`正在保存 Word 图片 ${index + 1}/${elements.length}…`);
    try {
      const blob = await imageBlob(src);
      const extension = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : blob.type === "image/gif" ? "gif" : "png";
      const uploaded = await uploadFile(new File([blob], `word-image-${index + 1}.${extension}`, { type: blob.type }), "/api/media");
      images.push({ image: uploaded.url, caption: element.getAttribute("alt") || `原文图片 ${index + 1}` });
    } catch {
      warnings.push(`第 ${index + 1} 张图片无法自动导入，请对照原文件手动上传。`);
    }
    element.remove();
  }
  const service = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });
  const body = service.turndown(document.body.innerHTML).trim();
  const summary = (document.querySelector("p")?.textContent || document.body.textContent || "").trim().replace(/\s+/g, " ").slice(0, 180);
  if (images.length) warnings.push("Word 中的图片已集中放在正文后，可在编辑器中调整图片与说明；复杂排版请对照原文件检查。");
  return { body, summary, images, warnings };
}

async function importPdf(file: File, progress: (message: string) => void): Promise<Omit<ImportedNews, "attachment" | "attachmentName">> {
  progress("正在解析 PDF 文档…");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true }).promise;
  if (pdf.numPages > 50) throw new Error("PDF 超过 50 页，请拆分后导入，以便逐页核对图片。");
  const paragraphs: string[] = [];
  let firstText = "";
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    progress(`正在提取 PDF 第 ${pageNumber}/${pdf.numPages} 页…`);
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const chunks = textContent.items.filter((item): item is typeof item & { str: string; transform: number[] } => "str" in item);
    const lines: string[] = [];
    let line = "";
    let lastY: number | null = null;
    for (const chunk of chunks) {
      const y = chunk.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2 && line.trim()) { lines.push(line.trim()); line = ""; }
      line += `${chunk.str} `;
      lastY = y;
    }
    if (line.trim()) lines.push(line.trim());
    const text = lines.join("\n");
    if (!firstText && text) firstText = text.replace(/\s+/g, " ").slice(0, 180);
    paragraphs.push(`### 第 ${pageNumber} 页\n\n${text || "本页文字无法自动提取，请参阅下方原页图片并补录正文。"}`);
    page.cleanup();
  }
  await pdf.cleanup();
  return { body: paragraphs.join("\n\n"), summary: firstText, images: [],
    warnings: ["PDF 原稿将直接嵌入文章页，图表和排版以原文件为准；提取的文字仅用于摘要，请核对。"] };
}

export async function importNewsFile(file: File, progress: (message: string) => void): Promise<ImportedNews> {
  if (file.name.toLowerCase().endsWith(".doc")) throw new Error("旧版 .doc 文件请先转换为 .docx 再导入。");
  if (!/\.(docx|pdf)$/i.test(file.name)) throw new Error("仅支持 .docx 或 .pdf 文件。");
  if (file.size === 0 || file.size > 20 * 1024 * 1024) throw new Error("请选择 20 MB 以内的文件。");
  progress("正在保存原始附件…");
  const attachment = await uploadFile(file, "/api/news-file");
  try {
    const converted = file.name.toLowerCase().endsWith(".docx") ? await importDocx(file, progress) : await importPdf(file, progress);
    return { ...converted, attachment: attachment.url, attachmentName: attachment.name || file.name };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "未知解析错误";
    return { body: "", summary: "", images: [], attachment: attachment.url, attachmentName: attachment.name || file.name,
      warnings: [`原始附件已保存，但自动预览未能生成：${detail}。请下载原文件核对内容；可在“导入结果检查与修正”中补充文字或图片。`] };
  }
}
