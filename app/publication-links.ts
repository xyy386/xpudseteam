import type { ArchiveItem } from "./content";

const titleLabels = ["题目", "标题", "论文题目", "论文标题", "著作名称", "title"];
const linkLabels = ["链接", "原文链接", "论文链接", "doi", "url"];

export function resolvePublicationUrl(value: string) {
  if (typeof value !== "string") return "";
  const source = value.trim();
  const doi = source.match(/^(?:doi:\s*)?(10\.\d{4,9}\/\S+)$/i);
  try {
    if (doi) return `https://doi.org/${encodeURI(doi[1]).replaceAll("?", "%3F").replaceAll("#", "%23")}`;
    if (!/^https?:\/\//i.test(source) || /[\s\\]/.test(source)) return "";
    const url = new URL(source);
    return /^(https?:)$/.test(url.protocol) && url.hostname ? source : "";
  } catch { return ""; }
}

export function publicationColumnIndices(columns: readonly string[]) {
  return {
    titleIndex: columns.findIndex((column) => typeof column === "string" && titleLabels.includes(column.trim().toLowerCase())),
    linkIndex: columns.findIndex((column) => typeof column === "string" && linkLabels.includes(column.trim().toLowerCase())),
  };
}

export type PublicationValidationError = { archiveIndex: number; rowIndex: number | null; message: string };

export function findPublicationValidationError(archives: readonly Pick<ArchiveItem, "slug" | "columns" | "rows">[]): PublicationValidationError | null {
  for (const [archiveIndex, archive] of archives.entries()) {
    if (archive?.slug !== "publications") continue;
    if (!Array.isArray(archive.rows)) return { archiveIndex, rowIndex: null, message: "“论文与著作”的条目表格格式不正确。" };
    const rows: Array<{ row: string[]; rowIndex: number }> = [];
    for (const [index, row] of archive.rows.entries()) {
      if (!Array.isArray(row) || row.some((cell) => typeof cell !== "string")) {
        return { archiveIndex, rowIndex: index + 1, message: `“论文与著作”第 ${index + 1} 条格式不正确，请使用文字填写各列。` };
      }
      if (row.some((cell) => cell.trim())) rows.push({ row, rowIndex: index + 1 });
    }
    if (!rows.length) continue;
    const { titleIndex, linkIndex } = publicationColumnIndices(Array.isArray(archive.columns) ? archive.columns : []);
    if (titleIndex < 0 || linkIndex < 0) {
      return {
        archiveIndex, rowIndex: null,
        message: `“论文与著作”需包含论文标题列和原文链接列。标题列可命名为：${titleLabels.join("、")}；链接列可命名为：${linkLabels.join("、")}。`,
      };
    }
    for (const { row, rowIndex } of rows) {
      if (!row[titleIndex]?.trim()) return { archiveIndex, rowIndex, message: `“论文与著作”第 ${rowIndex} 条缺少论文标题，请补充后保存。` };
      if (!resolvePublicationUrl(row[linkIndex] ?? "")) {
        return { archiveIndex, rowIndex, message: `“论文与著作”第 ${rowIndex} 条缺少有效原文链接，请填写完整的 HTTP(S) 地址或 DOI 后保存。` };
      }
    }
  }
  return null;
}
