import { notFound } from "next/navigation";
import { getSiteContent } from "../../../content";
import { appearanceStyle } from "../../../appearance";
import { MarkdownInline, MarkdownText } from "../../../markdown";
import { SiteFooter, SiteHeader } from "../../../site-shell";

export default async function NewsArticlePage({ params }: { params: Promise<{ slug: string; articleId: string }> }) {
  const { slug, articleId } = await params;
  if (slug !== "events" && slug !== "updates") notFound();
  const content = await getSiteContent();
  const section = content.archives.find((item) => item.slug === slug);
  const article = section?.newsArticles.find((item) => item.id === articleId);
  if (!section || !article) notFound();

  return <main className="archive-page news-detail-page site-page" style={appearanceStyle(content.appearance, content.appearanceMobile)}>
    <SiteHeader content={content} active="news" />
    <section className="archive-hero news-detail-hero"><div className="container">
      <nav className="news-breadcrumb" aria-label="面包屑导航"><a href="/">首页</a><span aria-hidden="true">›</span><a href="/news">团队动态</a><span aria-hidden="true">›</span><a href={`/archive/${slug}`}>{section.title}</a><span aria-hidden="true">›</span><span aria-current="page">{article.title || "未命名新闻稿"}</span></nav>
      <a className="back-link" href={`/archive/${slug}`}>← 返回{section.title}</a>
      <p className="archive-eyebrow">团队动态 / <MarkdownInline source={section.title} /></p>
      <h1><MarkdownInline source={article.title || "未命名新闻稿"} /></h1>
      <div className="news-detail-meta">{article.date && <time dateTime={article.date}>{article.date}</time>}{article.source && <span>来源：{article.source}</span>}</div>
      {article.summary && <MarkdownText source={article.summary} className="archive-intro" />}
    </div></section>
    <article className="site-section news-detail-content"><div className="container news-detail-container">
      {article.attachment && <div className="news-original-file"><span>原始新闻稿：{article.attachmentName || "附件"}</span><a href={`${article.attachment}?name=${encodeURIComponent(article.attachmentName || "新闻稿")}`}>下载原文件 ↗</a></div>}
      {article.attachment.toLowerCase().endsWith(".pdf") && <div className="news-pdf-embed"><iframe title={`${article.title} PDF 原稿`} src={`${article.attachment}?preview=1`} /><p>如果浏览器未显示 PDF，请使用上方的下载链接查看原稿。</p></div>}
      {article.body && !article.attachment.toLowerCase().endsWith(".pdf") && <MarkdownText source={article.body} className="news-detail-body" />}
      {!article.body && article.attachment.toLowerCase().endsWith(".docx") && <p className="news-conversion-note">此 Word 文档未能生成网页预览，请下载原文件阅读。</p>}
      {article.images.filter((item) => item.image && !article.attachment.toLowerCase().endsWith(".pdf")).map((item, index) => <figure className="news-detail-figure" key={index}>
        <img src={item.image} alt={item.caption || `${article.title}图片 ${index + 1}`} />
        {item.caption && <figcaption><MarkdownInline source={item.caption} /></figcaption>}
      </figure>)}
      <a className="news-detail-back" href={`/archive/${slug}`}>← 返回{section.title}列表</a>
    </div></article>
    <SiteFooter content={content} />
  </main>;
}
