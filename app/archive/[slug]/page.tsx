import Link from "next/link";
import { notFound } from "next/navigation";
import { getSiteContent } from "../../content";
import { appearanceStyle } from "../../appearance";
import { MarkdownInline, MarkdownText } from "../../markdown";
import { PhotoMosaic } from "../../photo-mosaic";
import { SubsectionCards } from "../../subsections";

export default async function ArchivePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = await getSiteContent();
  const section = content.archives.find((item) => item.slug === slug);
  if (!section) notFound();

  return (
    <main className="archive-page site-page" style={appearanceStyle(content.appearance, content.appearanceMobile)}>
      <header className="site-header">
        <div className="container header-inner">
          <Link className="brand" href="/"><span className="brand-monogram">数研</span><span><strong>{content.siteName}</strong><small>{content.institution}</small></span></Link>
          <nav className="main-nav" aria-label="主导航"><Link href="/#team">团队成员</Link><Link href="/#research">研究方向</Link><Link href="/#outcomes">研究成果</Link><Link href="/#news">团队动态</Link><Link href="/#other">其他</Link>{content.customSections.map((item) => <Link href={`/#custom-${item.id}`} key={item.id}><MarkdownInline source={item.title} /></Link>)}<Link href="/#contact">联系我们</Link><Link href="/edit">编辑网站</Link></nav>
        </div>
      </header>
      <section className="archive-hero"><div className="container">
        <Link className="back-link" href={`/#${section.homeAnchor}`}>← 返回{section.group}</Link>
        <p className="archive-eyebrow">{section.group} / <MarkdownInline source={section.english} /></p>
        <h1><MarkdownInline source={section.title} /></h1>
        <MarkdownText source={section.description} className="archive-intro" />
      </div></section>

      <section className="site-section archive-gallery-section"><div className="container">
        <div className="section-heading"><div className="section-heading-line"><span>01</span><h2><MarkdownInline source={content.pageText.galleryTitle} /></h2><small>GALLERY</small></div><MarkdownText source={content.pageText.galleryIntro} className="section-intro-markdown" /></div>
        <PhotoMosaic kind="gallery" items={section.gallery.map((item) => ({ title: item.label, description: item.caption, image: item.image, layout: item.layout, layoutMobile: item.layoutMobile }))} />
      </div></section>

      <section className="site-section archive-table-section"><div className="container">
        <div className="section-heading"><div className="section-heading-line"><span>02</span><h2><MarkdownInline source={content.pageText.tableTitle} /></h2><small>INDEX</small></div><MarkdownText source={content.pageText.tableIntro} className="section-intro-markdown" /></div>
        <div className="table-scroll"><table className="archive-table"><caption>{section.title}资料表</caption><thead><tr>{section.columns.map((column, index) => <th scope="col" key={`${index}-${column}`}><MarkdownInline source={column} /></th>)}</tr></thead><tbody>{section.rows.map((row, rowIndex) => <tr key={rowIndex}>{section.columns.map((_, columnIndex) => <td key={columnIndex}>{/^https?:\/\//.test(row[columnIndex] ?? "") ? <a href={row[columnIndex]} target="_blank" rel="noopener noreferrer">查看链接 ↗</a> : <MarkdownText source={row[columnIndex] ?? ""} />}</td>)}</tr>)}</tbody></table></div>
      </div></section>

      {section.subsections.length > 0 && <section className="site-section subsections-section"><div className="container"><SubsectionCards sections={section.subsections} /></div></section>}

      <section className="site-section archive-more-section"><div className="container">
        <div className="section-heading"><div className="section-heading-line"><span>{section.subsections.length ? "04" : "03"}</span><h2><MarkdownInline source={content.pageText.moreTitle} /></h2><small>EXPLORE</small></div></div>
        <div className="archive-more">{content.archives.filter((item) => item.slug !== slug).map((item) => <Link href={`/archive/${item.slug}`} key={item.slug}><span>{item.group}</span><strong><MarkdownInline source={item.title} /></strong><b aria-hidden="true">↗</b></Link>)}</div>
      </div></section>

      <footer><div className="container footer-inner"><div><strong><MarkdownInline source={content.siteName} /></strong><p><MarkdownInline source={content.institution} /></p></div></div></footer>
    </main>
  );
}
