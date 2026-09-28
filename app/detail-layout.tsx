import type { ReactNode } from "react";
import type { ArchiveItem, PaperItem, SubsectionItem } from "./content";
import { MarkdownInline, MarkdownText } from "./markdown";
import { publicationColumnIndices, resolvePublicationUrl } from "./publication-links";

type DetailDestination = { title: string; href: string; onClick?: () => void };

export function DetailLink({ href, onClick, children, className }: {
  href: string; onClick?: () => void; children: ReactNode; className?: string;
}) {
  return onClick
    ? <button type="button" className={className} onClick={onClick}>{children}</button>
    : <a href={href} className={className}>{children}</a>;
}

export function DetailLayout({ title, breadcrumbs, back, children }: {
  title: string;
  breadcrumbs: Array<{ title: string; href?: string; onClick?: () => void }>;
  back: DetailDestination;
  children: ReactNode;
}) {
  return <section className="education-page content-detail-page" aria-label={title}>
    <div className="education-inner">
      <nav className="education-breadcrumb" aria-label="当前位置">
        {breadcrumbs.map((item, index) => <span className="detail-breadcrumb-item" key={index}>
          {index > 0 && <span aria-hidden="true">/</span>}
          {item.href ? <DetailLink href={item.href} onClick={item.onClick}><MarkdownInline source={item.title} /></DetailLink>
            : <span aria-current={index === breadcrumbs.length - 1 ? "page" : undefined}><MarkdownInline source={item.title} /></span>}
        </span>)}
      </nav>
      <header className="education-heading"><h1><MarkdownInline source={title} /></h1></header>
      <div className="detail-body">{children}</div>
      <DetailLink href={back.href} onClick={back.onClick} className="education-back">← 返回<MarkdownInline source={back.title} /></DetailLink>
    </div>
  </section>;
}

export function DetailSection({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return <section className="detail-section-block">
    <div className="education-section-heading"><h2><MarkdownInline source={title} /></h2></div>
    {intro?.trim() && <MarkdownText source={intro} className="detail-section-intro" />}
    {children}
  </section>;
}

function relatedUrl(url: string) {
  return /^(https?:\/\/|\/(?!\/)|#)/i.test(url) ? url : "";
}

export function visibleDetailItems(items: PaperItem[]) {
  return items.filter((item) => item.title.trim() || item.description.trim() || item.image.trim() || relatedUrl(item.url));
}

export function DetailGallery({ items, kind = "gallery" }: { items: PaperItem[]; kind?: "paper" | "gallery" }) {
  const entries = visibleDetailItems(items);
  if (!entries.length) return null;
  return <div className={`education-gallery detail-gallery detail-gallery--${kind}`}>
    {entries.map((item, index) => {
      const href = relatedUrl(item.url);
      return <figure className="education-gallery-item" key={index}>
        {item.image.trim() && <img src={item.image} alt={item.title} loading="lazy" />}
        {(item.title.trim() || item.description.trim() || href) && <figcaption>
          {item.title.trim() && <h3><MarkdownInline source={item.title} /></h3>}
          {item.description.trim() && <MarkdownText source={item.description} />}
          {href && <a href={href} target={/^https?:\/\//i.test(href) ? "_blank" : undefined} rel={/^https?:\/\//i.test(href) ? "noopener noreferrer" : undefined}>查看详情 <span aria-hidden="true">↗</span></a>}
        </figcaption>}
      </figure>;
    })}
  </div>;
}

export function DetailSubsections({ sections, activeId, onEdit }: {
  sections: SubsectionItem[]; activeId?: string; onEdit?: (id: string) => void;
}) {
  return <>{sections.map((item) => {
    const href = relatedUrl(item.url);
    const empty = !item.body.trim() && !item.image.trim() && !href && !visibleDetailItems(item.items).length;
    return <div className={`detail-subsection${activeId === item.id ? " is-editing" : ""}`} id={`subsection-${item.id}`} key={item.id}>
      <DetailSection title={item.title || "未命名分类"}>
        {item.body.trim() && <MarkdownText source={item.body} />}
        {item.image.trim() && <img className="education-image" src={item.image} alt={item.title} loading="lazy" />}
        <DetailGallery items={item.items} />
        {href && <a className="education-detail-link" href={href} target={/^https?:\/\//i.test(href) ? "_blank" : undefined} rel={/^https?:\/\//i.test(href) ? "noopener noreferrer" : undefined}>相关链接</a>}
        {empty && <p className="education-empty">内容待补充。</p>}
        {onEdit && <button type="button" className="education-edit" onClick={() => onEdit(item.id)}>编辑此分区</button>}
      </DetailSection>
    </div>;
  })}</>;
}

export function hasDetailRows(section: ArchiveItem) {
  return section.rows.some((row) => row.some((cell) => cell.trim()));
}

export function DetailTable({ section }: { section: ArchiveItem }) {
  const rows = section.rows.filter((row) => row.some((cell) => cell.trim()));
  if (!rows.length) return null;
  const columnCount = Math.max(section.columns.length, ...rows.map((row) => row.length));
  const { titleIndex, linkIndex } = publicationColumnIndices(section.columns);
  const visibleColumns = Array.from({ length: columnCount }, (_, index) => index)
    .filter((index) => section.slug !== "publications" || index !== linkIndex);
  return <div className="detail-table-scroll" role="region" aria-label={`${section.title}资料表，可横向滚动`} tabIndex={0}>
    <table className="detail-table">
      <caption>{section.title}资料表</caption>
      {section.columns.some((column) => column.trim()) && <thead><tr>{visibleColumns.map((index) => <th scope="col" key={index}><MarkdownInline source={section.columns[index] ?? ""} /></th>)}</tr></thead>}
      <tbody>{rows.map((row, index) => {
        const paperUrl = section.slug === "publications" ? resolvePublicationUrl(row[linkIndex] ?? "") : "";
        return <tr key={index}>{visibleColumns.map((columnIndex) => {
          const cell = row[columnIndex] ?? "";
          return <td key={columnIndex}>{paperUrl && columnIndex === titleIndex && cell.trim()
            ? <a href={paperUrl} target="_blank" rel="noopener noreferrer"><MarkdownInline source={cell} /></a>
            : /^https?:\/\/\S+$/i.test(cell.trim())
                ? <a href={cell.trim()} target="_blank" rel="noopener noreferrer">查看链接 ↗</a>
                : <MarkdownText source={cell} />}</td>;
        })}</tr>;
      })}</tbody>
    </table>
  </div>;
}

export function DetailRelated({ title, links }: { title: string; links: DetailDestination[] }) {
  if (!links.length) return null;
  return <DetailSection title={title}><ul className="detail-related-links">{links.map((item) => <li key={item.href}>
    <DetailLink href={item.href} onClick={item.onClick}><MarkdownInline source={item.title} /> <span aria-hidden="true">›</span></DetailLink>
  </li>)}</ul></DetailSection>;
}
