import type { SubsectionItem } from "./content";
import { MarkdownInline, MarkdownText } from "./markdown";
import { PhotoMosaic } from "./photo-mosaic";

export function SubsectionCards({ sections, activeId, onEdit }: { sections: SubsectionItem[]; activeId?: string; onEdit?: (id: string) => void }) {
  if (!sections.length) return null;
  return <div className="subsections-block">
    <div className="subsections-heading"><span>EXTENDED CONTENT</span><h2>子栏目</h2></div>
    <div className="subsections-list">{sections.map((section, index) => {
      const link = /^(https?:\/\/|\/|#)/i.test(section.url) ? section.url : "";
      const external = /^https?:\/\//i.test(link);
      return <article className={`subsection-card${activeId === section.id ? " is-editing" : ""}`} id={`subsection-${section.id}`} key={section.id}>
        <div className="subsection-main">
          <div className="subsection-image">{section.image && <img src={section.image} alt={section.title} loading="lazy" />}</div>
          <div className="subsection-copy"><small>{String(index + 1).padStart(2, "0")}</small><h3><MarkdownInline source={section.title} /></h3><MarkdownText source={section.body} />{link && <a href={link} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>查看详情 <span aria-hidden="true">↗</span></a>}{onEdit && <button type="button" onClick={() => onEdit(section.id)}>编辑此子栏目 ↗</button>}</div>
        </div>
        <PhotoMosaic kind="gallery" items={section.items} />
      </article>;
    })}</div>
  </div>;
}
