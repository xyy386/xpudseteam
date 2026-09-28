import type { ArchiveItem, NewsArticle, SiteContent } from "./content";
import { isPublishedArticle } from "./home-news";
import { appearanceStyle } from "./appearance";
import { MarkdownInline, MarkdownText } from "./markdown";
import { DetailGallery, DetailLayout, DetailLink, DetailSection, DetailSubsections, DetailTable, hasDetailRows } from "./detail-layout";
import { SiteFooter, SiteHeader } from "./site-shell";

export function NewsListContent({ content, section, onBack, onOpenArticle, includeDrafts = false, activeSubsectionId, onEditSubsection }: {
  content: SiteContent;
  section: ArchiveItem;
  onBack?: () => void;
  onOpenArticle?: (id: string) => void;
  includeDrafts?: boolean;
  activeSubsectionId?: string;
  onEditSubsection?: (id: string) => void;
}) {
  const parentTitle = content.sectionTitles[section.homeAnchor as keyof SiteContent["sectionTitles"]] || section.group;
  const back = { title: parentTitle, href: `/${section.homeAnchor}#archive-${encodeURIComponent(section.slug)}`, onClick: onBack };
  const gallery = section.gallery.filter((item) => item.image.trim() || item.caption.trim());
  const articles = section.newsArticles.filter((article) => includeDrafts || isPublishedArticle(article));
  const hasRows = hasDetailRows(section);

  return <DetailLayout title={section.title} breadcrumbs={[back, { title: section.title }]} back={back}>
    {section.description.trim() && <MarkdownText source={section.description} />}
    <DetailSection title="新闻稿">
      {articles.length > 0 ? <div className="detail-news-list">
        {articles.map((article) => {
          const href = `/archive/${encodeURIComponent(section.slug)}/${encodeURIComponent(article.id)}`;
          const open = onOpenArticle ? () => onOpenArticle(article.id) : undefined;
          return <article className="detail-news-row" key={article.id}>
            {article.thumbnail && <DetailLink className="detail-news-thumbnail" href={href} onClick={open}><img src={article.thumbnail} alt={article.title || "新闻配图"} loading="lazy" /></DetailLink>}
            <div className="detail-news-copy">
              <div className="detail-news-line">
                <h3><DetailLink href={href} onClick={open}><MarkdownInline source={article.title || "未命名新闻稿"} /></DetailLink></h3>
                {(article.date || (includeDrafts && !isPublishedArticle(article))) && <div className="detail-news-meta">{article.date && <time dateTime={article.date}>{article.date}</time>}{includeDrafts && !isPublishedArticle(article) && <span className="detail-news-draft">草稿</span>}</div>}
              </div>
              {article.summary.trim() && <MarkdownText source={article.summary} className="detail-news-summary" />}
              <DetailLink className="detail-news-read" href={href} onClick={open}>阅读全文 <span aria-hidden="true">›</span></DetailLink>
            </div>
          </article>;
        })}
      </div> : <p className="education-empty">尚无已发布的新闻稿。</p>}
      {section.summary.trim() && !articles.length && <MarkdownText source={section.summary} />}
    </DetailSection>
    {(gallery.length > 0 || hasRows || section.subsections.length > 0) && <DetailSection title="相关资料">
      <DetailGallery items={gallery.map((item) => ({ title: item.label, description: item.caption, image: item.image, url: "", layout: item.layout, layoutMobile: item.layoutMobile }))} />
      {hasRows && <DetailTable section={section} />}
      <DetailSubsections sections={section.subsections} activeId={activeSubsectionId} onEdit={onEditSubsection} />
    </DetailSection>}
  </DetailLayout>;
}

export function NewsArticleContent({ section, article, onBack }: {
  section: ArchiveItem;
  article: NewsArticle;
  onBack?: () => void;
}) {
  const title = article.title || "未命名新闻稿";
  const back = { title: section.title, href: `/archive/${encodeURIComponent(section.slug)}`, onClick: onBack };
  const isPdf = article.attachment.toLowerCase().split("?")[0].endsWith(".pdf");
  const showSummaryAsContent = !article.body && !isPdf;
  const images = article.images.filter((item) => item.image && !isPdf && !article.body.includes(item.image));

  return <DetailLayout title={title} breadcrumbs={[back, { title }]} back={back}>
    {(article.date || article.source) && <div className="detail-news-meta">{article.date && <time dateTime={article.date}>{article.date}</time>}{article.source && <span>来源：{article.source}</span>}</div>}
    {article.body && !isPdf && <MarkdownText source={article.body} />}
    {showSummaryAsContent && article.summary && <MarkdownText source={article.summary} />}
    {!article.body && !article.summary && article.attachment.toLowerCase().endsWith(".docx") && <p className="education-empty">此 Word 文档未能生成网页预览，请下载原文件阅读。</p>}
    {isPdf && <p><a href={article.attachment}>查看 PDF 新闻稿</a></p>}
    {images.map((item, index) => <figure className="detail-news-figure" key={index}>
      <img src={item.image} alt={item.caption || `${title}图片 ${index + 1}`} loading="lazy" />
      {item.caption && <figcaption><MarkdownInline source={item.caption} /></figcaption>}
    </figure>)}
    {(article.attachment || article.externalUrl) && <div className="detail-news-attachments">
      {article.attachment && <p><a href={`${article.attachment}?name=${encodeURIComponent(article.attachmentName || "新闻稿")}`}>下载原文件：{article.attachmentName || "新闻稿"} ↗</a></p>}
      {article.externalUrl && <p><a href={article.externalUrl} target="_blank" rel="noopener noreferrer">查看论文或相关链接 ↗</a></p>}
    </div>}
    {!article.body && !article.summary && !images.length && !article.attachment && !article.externalUrl && <p className="education-empty">内容待补充。</p>}
  </DetailLayout>;
}

export function NewsListPage({ content, section }: { content: SiteContent; section: ArchiveItem }) {
  return <main className="archive-page news-list-page site-page" style={appearanceStyle(content.appearance, content.appearanceMobile)}>
    <SiteHeader content={content} active={section.homeAnchor} />
    <NewsListContent content={content} section={section} />
    <SiteFooter />
  </main>;
}
