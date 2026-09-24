import { notFound } from "next/navigation";
import { getSiteContent } from "../../content";
import { appearanceStyle } from "../../appearance";
import { MarkdownInline, MarkdownText } from "../../markdown";
import { PhotoMosaic } from "../../photo-mosaic";
import { SubsectionCards } from "../../subsections";

export default async function ResearchDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = await getSiteContent();
  const direction = content.directions.find((item) => item.slug === slug);
  if (!direction) notFound();
  const index = content.directions.findIndex((item) => item.slug === slug);

  return (
    <main className="detail-page site-page" style={appearanceStyle(content.appearance, content.appearanceMobile)}>
      <header className="site-header">
        <div className="container header-inner">
          <a className="brand" href="/"><span className="brand-monogram">数研</span><span><strong>{content.siteName}</strong><small>{content.institution}</small></span></a>
          <nav className="main-nav" aria-label="主导航"><a href="/#team">团队成员</a><a href="/#research">研究方向</a><a href="/#outcomes">研究成果</a><a href="/#news">团队动态</a><a href="/#other">其他</a>{content.customSections.map((section) => <a href={`/#custom-${section.id}`} key={section.id}><MarkdownInline source={section.title} /></a>)}<a href="/#contact">联系我们</a><a href="/edit">编辑网站</a></nav>
        </div>
      </header>
      <div className="detail-hero">
        <div className="container">
          <a className="back-link" href="/#research">← 返回研究方向</a>
          <div className="detail-hero-grid">
            <div>
              <span className="detail-index">RESEARCH {String(index + 1).padStart(2, "0")} / <MarkdownInline source={direction.english} /></span>
              <h1><MarkdownInline source={direction.title} /></h1>
              <MarkdownText source={direction.summary} className="detail-description" />
              {content.pageText.researchNote && <MarkdownText source={content.pageText.researchNote} className="detail-note" />}
            </div>
            <div className="detail-hero-image">{direction.image && <img src={direction.image} alt={`${direction.title}概念插图`} />}<span className={`formula-badge formula-badge--${direction.slug}`}><MarkdownInline source={direction.equation} /></span></div>
          </div>
        </div>
      </div>

      <section className="site-section detail-section">
        <div className="container">
          <div className="section-heading"><div className="section-heading-line"><span>01</span><h2><MarkdownInline source={content.pageText.focusTitle} /></h2><small>FOCUS AREAS</small></div><MarkdownText source={content.pageText.focusIntro} className="section-intro-markdown" /></div>
          <div className="topic-grid">
            {direction.topics.map((topic, topicIndex) => (
              <article className="topic-card" key={topic.title}>
                <div className="topic-visual">{topic.image && <img src={topic.image} alt="" loading="lazy" />}<span>{String(topicIndex + 1).padStart(2, "0")}</span></div>
                <div className="topic-content"><span>{String(topicIndex + 1).padStart(2, "0")}</span><h3><MarkdownInline source={topic.title} /></h3><MarkdownText source={topic.detail} className="topic-description" /></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="site-section paper-section">
        <div className="container">
          <div className="section-heading"><div className="section-heading-line"><span>02</span><h2><MarkdownInline source={content.pageText.papersTitle} /></h2><small>PUBLICATIONS & FIGURES</small></div><MarkdownText source={content.pageText.papersIntro} className="section-intro-markdown" /></div>
          <PhotoMosaic kind="paper" items={direction.papers.map((paper) => ({ title: paper.title, description: paper.description, image: paper.image, url: paper.url, layout: paper.layout, layoutMobile: paper.layoutMobile }))} />
          <a className="paper-index-link" href="/archive/publications">查看团队论文与著作目录 <span aria-hidden="true">↗</span></a>
        </div>
      </section>

      {direction.subsections.length > 0 && <section className="site-section subsections-section"><div className="container"><SubsectionCards sections={direction.subsections} /></div></section>}

      <section className="site-section related-section"><div className="container"><div className="section-heading"><div className="section-heading-line"><span>{direction.subsections.length ? "04" : "03"}</span><h2><MarkdownInline source={content.pageText.relatedTitle} /></h2><small>EXPLORE MORE</small></div></div><div className="related-grid">{content.directions.filter((item) => item.slug !== slug).map((item) => <a href={`/research/${item.slug}`} key={item.slug}>{item.image && <img src={item.image} alt="" loading="lazy" />}<span><MarkdownInline source={item.title} /> <b aria-hidden="true">↗</b></span></a>)}</div></div></section>
      <footer><div className="container footer-inner"><div><strong><MarkdownInline source={content.siteName} /></strong><p><MarkdownInline source={content.institution} /></p></div></div></footer>
    </main>
  );
}
