import type { ReactNode } from "react";
import type { ArchiveItem, SiteContent } from "./content";
import { summarizeEducationBody } from "./education-summary";
import { isPublishedArticle } from "./home-news";
import { MarkdownInline, MarkdownText } from "./markdown";

export type ArchiveOverviewKind = "outcomes" | "news" | "other";

function hasArchiveContent(item: ArchiveItem) {
  return Boolean(item.summary.trim() || item.description.trim() || item.cover.trim()
    || item.gallery.some((entry) => entry.image.trim() || entry.caption.trim())
    || item.rows.some((row) => row.some((cell) => cell.trim()))
    || item.subsections.some((section) => section.body.trim() || section.image.trim() || section.url.trim()
      || section.items.some((entry) => entry.title.trim() || entry.description.trim() || entry.image.trim() || entry.url.trim()))
    || item.newsArticles.some(isPublishedArticle));
}

export function archiveOverviewSummary(item: ArchiveItem) {
  return summarizeEducationBody(item.summary) || summarizeEducationBody(item.description)
    || (hasArchiveContent(item) ? "查看完整内容。" : "内容待补充。");
}

function ArchiveOverviewLink({ href, onClick, label, className, children }: {
  href: string;
  onClick?: () => void;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return onClick
    ? <button type="button" className={className} aria-label={label} onClick={onClick}>{children}</button>
    : <a href={href} className={className} aria-label={label}>{children}</a>;
}

export function ArchiveOverview({ content, kind, activeSlug, onOpen }: {
  content: SiteContent;
  kind: ArchiveOverviewKind;
  activeSlug?: string;
  onOpen?: (slug: string) => void;
}) {
  const title = content.sectionTitles[kind];
  const intro = content.sectionIntros[kind];
  const archives = content.archives.filter((item) => item.homeAnchor === kind);
  return <section className="education-page archive-overview" id={kind} aria-label={title}>
    <div className="education-inner">
      <header className="education-heading">
        <h1><MarkdownInline source={title} /></h1>
        {intro.trim() && <MarkdownText source={intro} />}
      </header>
      <div className="education-grid">{archives.map((item) => {
        const itemTitle = item.title.trim() || "未命名分类";
        const href = `/archive/${encodeURIComponent(item.slug)}`;
        const open = onOpen ? () => onOpen(item.slug) : undefined;
        return <section className={`education-section archive-overview-item${activeSlug === item.slug ? " is-editing" : ""}`} id={`archive-${item.slug}`} key={item.slug} aria-labelledby={`archive-title-${item.slug}`}>
          <div className="education-section-heading">
            <h2 id={`archive-title-${item.slug}`}><ArchiveOverviewLink href={href} onClick={open}><MarkdownInline source={itemTitle} /></ArchiveOverviewLink></h2>
            <ArchiveOverviewLink href={href} onClick={open} className="education-more" label={`更多${itemTitle}`}>更多 <span aria-hidden="true">›</span></ArchiveOverviewLink>
          </div>
          <p className={`education-summary${hasArchiveContent(item) ? "" : " education-empty"}`}>{archiveOverviewSummary(item)}</p>
        </section>;
      })}</div>
      {!archives.length && <p className="education-empty">内容待补充。</p>}
    </div>
  </section>;
}
