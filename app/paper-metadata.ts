export type PaperMetadata = {
  sourceUrl: string;
  doi: string;
  title: string;
  authors: string;
  venue: string;
  publishedDate: string;
  abstract: string;
  warnings: string[];
};

const pageHosts = new Set([
  "arxiv.org", "export.arxiv.org", "www.nature.com", "link.springer.com",
  "www.sciencedirect.com", "sciencedirect.com", "ieeexplore.ieee.org", "dl.acm.org",
  "journals.aps.org", "pubs.acs.org", "onlinelibrary.wiley.com",
  "www.tandfonline.com", "academic.oup.com", "journals.plos.org",
  "pmc.ncbi.nlm.nih.gov", "pubmed.ncbi.nlm.nih.gov",
  "www.frontiersin.org", "www.mdpi.com",
]);

function cleanText(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    const key = entity.toLowerCase();
    if (key.startsWith("#")) {
      const point = key.startsWith("#x") ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    }
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " } as Record<string, string>)[key] ?? match;
  }).replace(/\s+/g, " ").trim();
}

function doiFromText(value: string): string {
  const match = /10\.\d{4,9}\/[^\s?#<>"']+/i.exec(value);
  return match?.[0].replace(/[.,;:)\]]+$/, "").slice(0, 250) ?? "";
}

export function normalizePaperUrl(value: string): URL {
  const input = value.trim();
  if (input.length > 2048) throw new Error("链接过长");
  const url = new URL(/^10\.\d{4,9}\//i.test(input) ? `https://doi.org/${input}` : input);
  if (url.protocol !== "https:" || url.username || url.password || url.port || !url.hostname
    || !(url.hostname === "doi.org" || url.hostname === "dx.doi.org" || pageHosts.has(url.hostname))) {
    throw new Error("目前支持 DOI、arXiv 和常见论文出版平台的 HTTPS 页面；其他链接请上传 PDF。");
  }
  url.hash = "";
  return url;
}

async function boundedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.ok) throw new Error("来源服务暂不可用");
  const declared = Number(response.headers.get("content-length"));
  if (declared > maxBytes) throw new Error("来源页面过大");
  if (!response.body) throw new Error("来源服务没有返回内容");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.length;
      if (size > maxBytes) throw new Error("来源页面过大");
      chunks.push(result.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

function metaTags(html: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = new Map<string, string>();
    for (const match of tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
    }
    const name = (attributes.get("name") || attributes.get("property") || "").toLowerCase();
    const content = cleanText(attributes.get("content") || "").slice(0, 4000);
    if (name && content) result.set(name, [...(result.get(name) ?? []), content]);
  }
  return result;
}

function first(meta: Map<string, string[]>, ...keys: string[]): string {
  for (const key of keys) if (meta.get(key)?.[0]) return meta.get(key)![0];
  return "";
}

async function publisherPage(url: URL): Promise<Partial<PaperMetadata>> {
  const response = await fetch(url.toString(), {
    method: "GET", redirect: "manual", signal: AbortSignal.timeout(8_000),
    headers: { Accept: "text/html" },
  });
  if (response.status >= 300 && response.status < 400) throw new Error("论文页面发生跳转；请提供最终页面地址或上传 PDF");
  if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) throw new Error("链接不是可读取的论文网页");
  const meta = metaTags(await boundedText(response, 500_000));
  return {
    doi: doiFromText(first(meta, "citation_doi", "dc.identifier", "prism.doi")),
    title: first(meta, "citation_title", "dc.title", "og:title"),
    authors: (meta.get("citation_author") ?? []).slice(0, 20).join("、"),
    venue: first(meta, "citation_journal_title", "prism.publicationname"),
    publishedDate: first(meta, "citation_publication_date", "citation_date", "dc.date"),
    abstract: first(meta, "citation_abstract", "dc.description", "description", "og:description").slice(0, 3000),
  };
}

async function crossref(doi: string): Promise<Partial<PaperMetadata>> {
  const path = doi.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`https://api.crossref.org/works/${path}`, {
    method: "GET", redirect: "manual", signal: AbortSignal.timeout(8_000),
    headers: { Accept: "application/json", "User-Agent": "ResearchTeamSite/1.0 (paper metadata lookup)" },
  });
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new Error("DOI 元数据服务未返回 JSON");
  const raw = JSON.parse(await boundedText(response, 750_000)) as { message?: Record<string, unknown> };
  const item = raw.message ?? {};
  const authorRows = Array.isArray(item.author) ? item.author as Array<{ given?: string; family?: string; name?: string }> : [];
  const dateRow = (item.published ?? item["published-online"] ?? item["published-print"]) as { "date-parts"?: number[][] } | undefined;
  return {
    doi: typeof item.DOI === "string" ? item.DOI.slice(0, 250) : doi,
    title: cleanText(Array.isArray(item.title) ? String(item.title[0] ?? "") : "").slice(0, 500),
    authors: authorRows.slice(0, 20).map((author) => author.name || [author.given, author.family].filter(Boolean).join(" ")).filter(Boolean).join("、"),
    venue: cleanText(Array.isArray(item["container-title"]) ? String(item["container-title"][0] ?? "") : "").slice(0, 300),
    publishedDate: dateRow?.["date-parts"]?.[0]?.filter((part) => Number.isInteger(part)).join("-") ?? "",
    abstract: cleanText(typeof item.abstract === "string" ? item.abstract : "").slice(0, 3000),
  };
}

export async function getPaperMetadata(value: string): Promise<PaperMetadata> {
  const url = normalizePaperUrl(value);
  const isDoiUrl = url.hostname === "doi.org" || url.hostname === "dx.doi.org";
  let doi = isDoiUrl ? doiFromText(decodeURIComponent(url.pathname.slice(1))) : doiFromText(decodeURIComponent(url.pathname));
  if (!doi && url.hostname === "www.nature.com") {
    const article = /^\/articles\/(s[0-9a-z-]+)$/i.exec(url.pathname);
    if (article) doi = `10.1038/${article[1]}`;
  }
  let page: Partial<PaperMetadata> = {};
  const warnings: string[] = [];
  if (!isDoiUrl) {
    try { page = await publisherPage(url); doi ||= page.doi ?? ""; }
    catch (error) { warnings.push(error instanceof Error ? error.message : "论文页面元数据不可用"); }
  }
  let record: Partial<PaperMetadata> = {};
  if (doi) {
    try { record = await crossref(doi); }
    catch { warnings.push("Crossref 暂未返回该 DOI 的元数据，请对照原论文补充。"); }
  }
  if ((record.title || record.abstract) && warnings.some((warning) => warning.startsWith("论文页面") || warning.startsWith("来源服务"))) {
    warnings.splice(0, warnings.length, "原网页未能直接读取；当前信息来自 Crossref 元数据。");
  }
  const combined = { ...record, ...Object.fromEntries(Object.entries(page).filter(([, item]) => Boolean(item))) };
  const metadata: PaperMetadata = {
    sourceUrl: url.toString(), doi: combined.doi || doi,
    title: combined.title || "", authors: combined.authors || "", venue: combined.venue || "",
    publishedDate: combined.publishedDate || "", abstract: combined.abstract || "", warnings,
  };
  if (!metadata.title && !metadata.abstract) throw new Error("未能从链接取得论文题名或摘要；请上传 PDF/DOCX 原件，或手工建立草稿。");
  if (!metadata.abstract) metadata.warnings.push("目前仅取得题名等元数据，没有摘要或全文；请上传 PDF 后再整理研究结论。");
  else metadata.warnings.push("仅取得公开摘要和元数据，尚未读取论文全文；研究结论请上传 PDF 后核对。");
  return metadata;
}
