import { notFound, redirect } from "next/navigation";
import { getSiteContent, isPublishedArticle } from "../../../content";
import { appearanceStyle } from "../../../appearance";
import { NewsArticleContent } from "../../../news-articles";
import { SiteFooter, SiteHeader } from "../../../site-shell";

export async function generateStaticParams() {
  const content = await getSiteContent();
  return content.archives
    .filter((section) => section.slug === "events" || section.slug === "updates")
    .flatMap((section) => section.newsArticles.filter(isPublishedArticle).map((article) => ({ slug: section.slug, articleId: article.id })));
}

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
  return <main className="archive-page news-detail-page site-page" style={appearanceStyle(content.appearance, content.appearanceMobile)}>
    <SiteHeader content={content} active={section.homeAnchor} />
    <NewsArticleContent section={section} article={article} />
    <SiteFooter />
  </main>;
}
