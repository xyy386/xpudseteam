/* eslint-disable @next/next/no-html-link-for-pages -- Public navigation loads each page and its styles together instead of mixing document and client transitions. */
import type { SiteContent } from "./content";
import { BrandLogos } from "./brand-logos";
import { MarkdownInline, MarkdownText } from "./markdown";

export function SiteHeader({ content, active = "home" }: { content: SiteContent; active?: string }) {
  const education = content.customSections.find((section) => section.id === "education");
  const links = [
    ["team", content.sectionTitles.team],
    ["research", content.sectionTitles.research],
    ["outcomes", content.sectionTitles.outcomes],
    ...(education ? [["custom/education", education.title] as const] : []),
    ["news", content.sectionTitles.news],
    ["other", content.sectionTitles.other],
  ] as const;
  return <header className="site-header"><div className="container header-inner">
    <div className="brand"><BrandLogos /><a className="brand-copy" href="/"><strong><MarkdownInline source={content.siteName} /></strong>{content.institution.trim() && <small><MarkdownInline source={content.institution} /></small>}</a></div>
  </div><div className="site-navigation"><nav className="main-nav container" aria-label="主导航">
      <a href="/" aria-current={active === "home" ? "page" : undefined}>首页</a>
      {links.map(([slug, label]) => <a href={`/${slug}`} aria-current={active === (slug === "custom/education" ? "custom-education" : slug) ? "page" : undefined} key={slug}><MarkdownInline source={label} /></a>)}
      {content.customSections.filter((section) => section.id !== "education").map((section) => <a href={`/custom/${section.id}`} aria-current={active === `custom-${section.id}` ? "page" : undefined} key={section.id}><MarkdownInline source={section.title} /></a>)}
      <a href="/contact" aria-current={active === "contact" ? "page" : undefined}>联系我们</a>
    </nav>
  </div></header>;
}

export function SiteFooter() {
  return <footer className="site-footer"><div className="site-footer-inner">
    <p className="site-footer-copyright">Copyright 版权所有 © 西安工程大学数据驱动科学工程建模与计算团队 版权所有</p>
    <p className="site-footer-address">地址：陕西省西安市临潼区陕鼓大道58号</p>
  </div></footer>;
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
