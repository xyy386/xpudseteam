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
  const isPdf = article.attachment.toLowerCase().endsWith(".pdf");
  const showSummaryAsContent = !article.body && !isPdf;

  return <main className="archive-page news-detail-page site-page" style={appearanceStyle(content.appearance, content.appearanceMobile)}>
    <SiteHeader content={content} active="news" />
    <article className="news-detail-article"><div className="container news-detail-container">
      <nav className="news-breadcrumb" aria-label="面包屑导航"><a href="/">首页</a><span aria-hidden="true">›</span><a href="/news">团队动态</a><span aria-hidden="true">›</span><a href={`/archive/${slug}`}>{section.title}</a><span aria-hidden="true">›</span><span aria-current="page">{article.title || "未命名新闻稿"}</span></nav>
      <h1><MarkdownInline source={article.title || "未命名新闻稿"} /></h1>
      <div className="news-detail-meta">{article.date && <time dateTime={article.date}>{article.date}</time>}{article.source && <span>来源：{article.source}</span>}</div>
      {article.body && !isPdf && <MarkdownText source={article.body} className="news-detail-body" />}
      {showSummaryAsContent && article.summary && <MarkdownText source={article.summary} className="news-detail-body" />}
      {!article.body && !article.summary && article.attachment.toLowerCase().endsWith(".docx") && <p className="news-conversion-note">此 Word 文档未能生成网页预览，请下载原文件阅读。</p>}
      {isPdf && <div className="news-pdf-embed"><iframe title={`${article.title} PDF 原稿`} src={`${article.attachment}?preview=1`} /><p>如果浏览器未显示 PDF，请下载原文件阅读。</p></div>}
      {article.images.filter((item) => item.image && !isPdf).map((item, index) => <figure className="news-detail-figure" key={index}>
        <img src={item.image} alt={item.caption || `${article.title}图片 ${index + 1}`} />
        {item.caption && <figcaption><MarkdownInline source={item.caption} /></figcaption>}
      </figure>)}
      {article.attachment && <div className="news-original-file"><span>原始文件：{article.attachmentName || "附件"}</span><a href={`${article.attachment}?name=${encodeURIComponent(article.attachmentName || "新闻稿")}`}>下载原文件 ↗</a></div>}
      <a className="news-detail-back" href={`/archive/${slug}`}>← 返回{section.title}列表</a>
    </div></article>
    <SiteFooter content={content} />
  </main>;
}
