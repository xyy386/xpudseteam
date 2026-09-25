import { notFound, redirect } from "next/navigation";
import { getSiteContent, isPublishedArticle } from "../../../content";
import { appearanceStyle } from "../../../appearance";
import { MarkdownInline, MarkdownText } from "../../../markdown";

export default async function NewsArticlePage({ params }: { params: Promise<{ slug: string; articleId: string }> }) {
  const { slug, articleId } = await params;
  if (slug !== "events" && slug !== "updates") notFound();
  const content = await getSiteContent();
  const section = content.archives.find((item) => item.slug === slug);
  const article = section?.newsArticles.find((item) => item.id === articleId);
  if (!section || !article || !isPublishedArticle(article)) notFound();
  const isPdf = article.attachment.toLowerCase().split("?")[0].endsWith(".pdf");
  if (isPdf && article.attachment.startsWith("/api/news-file/")) {
    const query = new URLSearchParams({ preview: "1", name: article.attachmentName || `${article.title}.pdf` });
    redirect(`${article.attachment.split("?")[0]}?${query}`);
  }
  const showSummaryAsContent = !article.body && !isPdf;

  return <main className="archive-page news-detail-page site-page" style={appearanceStyle(content.appearance, content.appearanceMobile)}>
    <article className="news-detail-article"><div className="container news-detail-container">
      <a className="news-detail-back" href={`/archive/${slug}`}>← 返回{section.title}</a>
      <h1><MarkdownInline source={article.title || "未命名新闻稿"} /></h1>
      <div className="news-detail-meta">{article.date && <time dateTime={article.date}>{article.date}</time>}{article.source && <span>来源：{article.source}</span>}</div>
      {article.body && !isPdf && <MarkdownText source={article.body} className="news-detail-body" />}
      {showSummaryAsContent && article.summary && <MarkdownText source={article.summary} className="news-detail-body" />}
      {!article.body && !article.summary && article.attachment.toLowerCase().endsWith(".docx") && <p className="news-conversion-note">此 Word 文档未能生成网页预览，请下载原文件阅读。</p>}
      {isPdf && <p className="news-conversion-note"><a href={article.attachment}>查看 PDF 新闻稿</a></p>}
      {article.images.filter((item) => item.image && !isPdf && !article.body.includes(item.image)).map((item, index) => <figure className="news-detail-figure" key={index}>
        <img src={item.image} alt={item.caption || `${article.title}图片 ${index + 1}`} />
        {item.caption && <figcaption><MarkdownInline source={item.caption} /></figcaption>}
      </figure>)}
      {article.attachment && <div className="news-original-file"><a href={`${article.attachment}?name=${encodeURIComponent(article.attachmentName || "新闻稿")}`}>下载原文件：{article.attachmentName || "新闻稿"} ↗</a></div>}
      {article.externalUrl && <div className="news-original-file"><a href={article.externalUrl} target="_blank" rel="noopener noreferrer">查看论文或相关链接 ↗</a></div>}
    </div></article>
  </main>;
}
