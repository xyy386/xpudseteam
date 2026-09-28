import type { SiteContent } from "./content";
import { MarkdownInline, MarkdownText } from "./markdown";

export function ContactContent({ content, variant = "page", id = "contact", onContactClick }: {
  content: SiteContent;
  variant?: "compact" | "page";
  id?: string;
  onContactClick?: () => void;
}) {
  const compact = variant === "compact";
  const title = content.sectionTitles.contact.trim() || "联系我们";
  const fields = [
    ["person", "联系人"], ["role", "职务"], ["email", "电子邮箱"],
    ["phone", "联系电话"], ["address", "联系地址"], ["extra", "其他信息"],
  ] as const;
  const details = fields.filter(([key]) => content.contactDetails[key].trim());
  const empty = !content.sectionIntros.contact.trim() && !content.contact.trim() && !details.length;
  return <section className={`contact-content ${compact ? "home-contact" : "contact-page"}`} id={id} aria-label={title}>
    <div className={compact ? "home-contact-inner" : "contact-page-inner"}>
      {compact
        ? <h2><MarkdownInline source={title} /></h2>
        : <header className="contact-page-heading"><h1><MarkdownInline source={title} /></h1></header>}
      <div className="contact-information">
        {content.sectionIntros.contact.trim() && <MarkdownText source={content.sectionIntros.contact} className="contact-intro" />}
        {content.contact.trim() && <MarkdownText source={content.contact} className="contact-copy" />}
        {details.length > 0 && <dl className="contact-fields">{details.map(([key, label]) => <div key={key} className={key === "extra" ? "contact-extra" : undefined}>
          <dt>{label}</dt><dd><MarkdownText source={content.contactDetails[key]} /></dd>
        </div>)}</dl>}
        {empty && <p className="contact-empty">联系信息待补充。</p>}
        {compact && (onContactClick
          ? <button type="button" className="contact-more" onClick={onContactClick}>查看完整联系方式 <span aria-hidden="true">›</span></button>
          : <a className="contact-more" href="/contact">查看完整联系方式 <span aria-hidden="true">›</span></a>)}
      </div>
    </div>
  </section>;
}
