import { isPublishedArticle, type ArchiveItem, type SiteContent } from "./content";
import { appearanceStyle } from "./appearance";
import { MarkdownInline, MarkdownText } from "./markdown";
import { PhotoMosaic } from "./photo-mosaic";
import { SubsectionCards } from "./subsections";
import { SiteFooter, SiteHeader } from "./site-shell";

export function NewsListPage({ content, section }: { content: SiteContent; section: ArchiveItem }) {
  const gallery = section.gallery.filter((item) => item.image || item.caption);
  const publishedArticles = section.newsArticles.filter(isPublishedArticle);
  return <main className="archive-page news-list-page site-page" style={appearanceStyle(content.appearance, content.appearanceMobile)}>
    <SiteHeader content={content} active="news" />
    <section className="archive-hero"><div className="container">
      <nav className="news-breadcrumb" aria-label="面包屑导航"><a href="/">首页</a><span aria-hidden="true">›</span><a href="/news">团队动态</a><span aria-hidden="true">›</span><span aria-current="page">{section.title}</span></nav>
      <a className="back-link" href="/news">← 返回团队动态</a>
      <p className="archive-eyebrow">团队动态 / <MarkdownInline source={section.english} /></p>
      <h1><MarkdownInline source={section.title} /></h1>
      {section.description && <MarkdownText source={section.description} className="archive-intro" />}
    </div></section>
    <section className="site-section news-list-section"><div className="container">
      <div className="section-heading"><div className="section-heading-line"><span>01</span><h2>新闻稿</h2><small>ARTICLES</small></div></div>
      {publishedArticles.length ? <div className="news-article-list">
        {publishedArticles.map((article) => <article className="news-article-card" key={article.id}>
          {article.thumbnail && <a className="news-article-thumb" href={`/archive/${section.slug}/${article.id}`}><img src={article.thumbnail} alt="" /></a>}
          <div className="news-article-card-copy">
            <div className="news-article-card-line"><h2><a href={`/archive/${section.slug}/${article.id}`}><MarkdownInline source={article.title || "未命名新闻稿"} /></a></h2>{article.date && <time dateTime={article.date}>{article.date}</time>}</div>
            {article.summary && <MarkdownText source={article.summary} className="news-article-summary" />}
            <a className="news-article-read" href={`/archive/${section.slug}/${article.id}`}>阅读全文 ↗</a>
          </div>
        </article>)}
      </div> : <div className="news-article-empty">尚无已发布的新闻稿。</div>}
      {section.summary && publishedArticles.length === 0 && <MarkdownText source={section.summary} className="news-legacy-summary" />}
    </div></section>
    {(gallery.length > 0 || section.rows.length > 0 || section.subsections.length > 0) && <section className="site-section news-legacy-section"><div className="container">
      <div className="section-heading"><div className="section-heading-line"><span>02</span><h2>相关资料</h2><small>MATERIALS</small></div></div>
      {gallery.length > 0 && <PhotoMosaic kind="gallery" items={gallery.map((item) => ({ title: item.label, description: item.caption, image: item.image, layout: item.layout, layoutMobile: item.layoutMobile }))} />}
      {section.rows.length > 0 && <div className="table-scroll"><table className="archive-table"><thead><tr>{section.columns.map((column, index) => <th scope="col" key={index}><MarkdownInline source={column} /></th>)}</tr></thead><tbody>{section.rows.map((row, rowIndex) => <tr key={rowIndex}>{section.columns.map((_, columnIndex) => <td key={columnIndex}><MarkdownText source={row[columnIndex] ?? ""} /></td>)}</tr>)}</tbody></table></div>}
      {section.subsections.length > 0 && <SubsectionCards sections={section.subsections} />}
    </div></section>}
    <SiteFooter content={content} />
  </main>;
}
