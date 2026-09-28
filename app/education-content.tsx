import type { ReactNode } from "react";
import type { CustomSection, PaperItem, SubsectionItem } from "./content";
import { MarkdownInline, MarkdownText } from "./markdown";
import { summarizeEducationIntro } from "./education-summary";

function detailLink(url: string) {
  return /^(https?:\/\/|\/(?!\/)|#)/i.test(url) ? url : "";
}

function visibleItems(items: PaperItem[]) {
  return items.filter((item) => item.title.trim() || item.description.trim() || item.image || detailLink(item.url));
}

function isEmpty(item: SubsectionItem) {
  return !item.body.trim() && !item.image && !detailLink(item.url) && !visibleItems(item.items).length;
}

function EducationLink({ href, onClick, className, label, children }: {
  href: string;
  onClick?: () => void;
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  return onClick
    ? <button type="button" className={className} aria-label={label} onClick={onClick}>{children}</button>
    : <a href={href} className={className} aria-label={label}>{children}</a>;
}

function EducationGallery({ items }: { items: PaperItem[] }) {
  const entries = visibleItems(items);
  if (!entries.length) return null;
  return <div className="education-gallery">
    {entries.map((item, index) => {
      const href = detailLink(item.url);
      return <figure className="education-gallery-item" key={index}>
        {item.image && <img src={item.image} alt={item.title} loading="lazy" />}
        {(item.title || item.description || href) && <figcaption>
          {item.title && <h3><MarkdownInline source={item.title} /></h3>}
          {item.description && <MarkdownText source={item.description} />}
          {href && <a href={href} target={/^https?:\/\//i.test(href) ? "_blank" : undefined} rel={/^https?:\/\//i.test(href) ? "noopener noreferrer" : undefined}>查看详情</a>}
        </figcaption>}
      </figure>;
    })}
  </div>;
}

export function EducationContent({ section, activeId, onEdit, onOpen }: {
  section: CustomSection;
  activeId?: string;
  onEdit?: (id: string) => void;
  onOpen?: (id: string) => void;
}) {
  return <section className="education-page" aria-label={section.title}>
    <div className="education-inner">
      <header className="education-heading">
        <h1><MarkdownInline source={section.title} /></h1>
        {section.intro.trim() && <MarkdownText source={section.intro} />}
      </header>
      {(section.body.trim() || section.image || visibleItems(section.items).length > 0) && <div className="education-overview">
        {section.body.trim() && <MarkdownText source={section.body} />}
        {section.image && <img className="education-image" src={section.image} alt={section.title} loading="lazy" />}
        <EducationGallery items={section.items} />
      </div>}
      <div className="education-grid">{section.subsections.map((item) => {
        const title = item.title || "未命名分类";
        const href = `/custom/education/${encodeURIComponent(item.id)}`;
        const open = onOpen ? () => onOpen(item.id) : undefined;
        const summary = summarizeEducationIntro(item.body) || (isEmpty(item) ? "内容待补充。" : "查看完整内容。");
        return <section className={`education-section${activeId === item.id ? " is-editing" : ""}`} id={`subsection-${item.id}`} key={item.id} aria-labelledby={`education-title-${item.id}`}>
          <div className="education-section-heading">
            <h2 id={`education-title-${item.id}`}><EducationLink href={href} onClick={open}><MarkdownInline source={title} /></EducationLink></h2>
            <EducationLink href={href} onClick={open} className="education-more" label={`更多${title}`}>更多 <span aria-hidden="true">›</span></EducationLink>
          </div>
          <p className={`education-summary${isEmpty(item) ? " education-empty" : ""}`}>{summary}</p>
          {onEdit && <button type="button" className="education-edit" onClick={() => onEdit(item.id)}>编辑此分区</button>}
        </section>;
      })}</div>
      {!section.subsections.length && <p className="education-empty">内容待补充。</p>}
    </div>
  </section>;
}

export function EducationDetail({ section, item, onBack, onEdit }: {
  section: CustomSection;
  item: SubsectionItem;
  onBack?: () => void;
  onEdit?: (id: string) => void;
}) {
  const title = item.title || "未命名分类";
  const backHref = `/custom/education#subsection-${encodeURIComponent(item.id)}`;
  const href = detailLink(item.url);
  return <section className="education-page education-detail-page" aria-label={title}>
    <div className="education-inner">
      <nav className="education-breadcrumb" aria-label="当前位置">
        <EducationLink href={backHref} onClick={onBack}><MarkdownInline source={section.title} /></EducationLink>
        <span aria-hidden="true">/</span>
        <span aria-current="page"><MarkdownInline source={title} /></span>
      </nav>
      <header className="education-heading"><h1><MarkdownInline source={title} /></h1></header>
      <div className="education-detail-content" id={`subsection-${item.id}`}>
        {item.body.trim() && <MarkdownText source={item.body} />}
        {item.image && <img className="education-image" src={item.image} alt={item.title} loading="lazy" />}
        <EducationGallery items={item.items} />
        {href && <a className="education-detail-link" href={href} target={/^https?:\/\//i.test(href) ? "_blank" : undefined} rel={/^https?:\/\//i.test(href) ? "noopener noreferrer" : undefined}>相关链接</a>}
        {isEmpty(item) && <p className="education-empty">内容待补充。</p>}
        {onEdit && <button type="button" className="education-edit" onClick={() => onEdit(item.id)}>编辑此分区</button>}
      </div>
      <EducationLink href={backHref} onClick={onBack} className="education-back"><span aria-hidden="true">← </span>返回<MarkdownInline source={section.title} /></EducationLink>
    </div>
  </section>;
}
