import type { SiteContent } from "./content";
import { MarkdownInline, MarkdownText } from "./markdown";

export function SiteHeader({ content, active = "home" }: { content: SiteContent; active?: string }) {
  const links = [
    ["team", content.sectionTitles.team],
    ["research", content.sectionTitles.research],
    ["outcomes", content.sectionTitles.outcomes],
    ["news", content.sectionTitles.news],
    ["other", content.sectionTitles.other],
  ] as const;
  return <header className="site-header"><div className="container header-inner">
    <a className="brand" href="/"><span className="brand-monogram">数研</span><span><strong><MarkdownInline source={content.siteName} /></strong><small><MarkdownInline source={content.institution} /></small></span></a>
    <nav className="main-nav" aria-label="主导航">
      {links.map(([slug, label]) => <a href={`/${slug}`} aria-current={active === slug ? "page" : undefined} key={slug}><MarkdownInline source={label} /></a>)}
      {content.customSections.map((section) => <a href={`/custom/${section.id}`} aria-current={active === `custom-${section.id}` ? "page" : undefined} key={section.id}><MarkdownInline source={section.title} /></a>)}
      <a href="/#contact">联系我们</a><a href="/editor-login">编辑网站</a>
    </nav>
  </div></header>;
}

export function SiteFooter({ content }: { content: SiteContent }) {
  return <footer><div className="container footer-inner"><div><strong><MarkdownInline source={content.siteName} /></strong><p><MarkdownInline source={content.institution} /></p></div></div></footer>;
}

export function SectionTitle({ number, title, english, intro, level = 2 }: { number: string; title: string; english: string; intro?: string; level?: 1 | 2 }) {
  return <div className="section-heading">
    <div className="section-heading-line"><span>{number}</span>{level === 1 ? <h1><MarkdownInline source={title} /></h1> : <h2><MarkdownInline source={title} /></h2>}<small>{english}</small></div>
    {intro && <MarkdownText source={intro} className="section-intro-markdown" />}
  </div>;
}

export function ImageSlot({ label, className = "", src = "" }: { label: string; className?: string; src?: string }) {
  return <div className={`media-slot ${className}`} aria-label={label}>{src && <img src={src} alt={label} />}</div>;
}

export function ContactSection({ content }: { content: SiteContent }) {
  return <section className="site-section contact-section" id="contact"><div className="container">
    <SectionTitle number={String(6 + content.customSections.length).padStart(2, "0")} title={content.sectionTitles.contact} english="CONTACT" intro={content.sectionIntros.contact} />
    <div className="contact-layout">
      {content.contact && <MarkdownText source={content.contact} className="contact-overview" />}
      <dl className="contact-details">
        {content.contactDetails.person && <div><dt>联系人</dt><dd><MarkdownInline source={content.contactDetails.person} /></dd></div>}
        {content.contactDetails.role && <div><dt>职务</dt><dd><MarkdownInline source={content.contactDetails.role} /></dd></div>}
        {content.contactDetails.email && <div><dt>电子邮箱</dt><dd><MarkdownInline source={content.contactDetails.email} /></dd></div>}
        {content.contactDetails.phone && <div><dt>联系电话</dt><dd><MarkdownInline source={content.contactDetails.phone} /></dd></div>}
        {content.contactDetails.address && <div><dt>联系地址</dt><dd><MarkdownInline source={content.contactDetails.address} /></dd></div>}
        {content.contactDetails.extra && <div className="contact-extra"><dt>其他信息</dt><dd><MarkdownText source={content.contactDetails.extra} /></dd></div>}
      </dl>
    </div>
  </div></section>;
}
