import type { ArchiveItem, NewsArticle } from "./content";

export function isPublishedArticle(article: NewsArticle) {
  return article.status !== "draft";
}

export function selectHomeNews(archives: ArchiveItem[]) {
  return archives.flatMap((section, archiveIndex) => section.homeAnchor === "news"
    ? section.newsArticles.flatMap((article, articleIndex) => isPublishedArticle(article)
      ? [{
        title: article.title.trim() || "未命名动态",
        date: article.date?.trim() ?? "",
        href: `/archive/${section.slug}/${article.id}`,
        archiveIndex,
        articleIndex,
      }]
      : [])
    : [])
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
}
