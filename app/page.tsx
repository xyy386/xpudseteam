import { getSiteContent, isPublishedArticle } from "./content";
import { appearanceStyle } from "./appearance";
import { MarkdownInline, MarkdownText } from "./markdown";
import { heroBackgroundStyle } from "./hero-background";
import { ContactSection, ImageSlot, SiteFooter, SiteHeader } from "./site-shell";

export default async function Home() {
  const content = await getSiteContent();
  const featuredNews = content.archives.find((item) => item.homeAnchor === "news" && item.slug === content.hero.featureTargetSlug);
  const featuredArticle = featuredNews?.newsArticles.find((item) => item.id === content.hero.featureArticleId && isPublishedArticle(item));
  const featuredHref = featuredArticle ? `/archive/${featuredNews?.slug}/${featuredArticle.id}` : featuredNews ? `/archive/${featuredNews.slug}` : "/news";
  return <main id="top" className="site-page" style={appearanceStyle(content.appearance, content.appearanceMobile)}>
    <SiteHeader content={content} />
      <section className="hero-shell" style={heroBackgroundStyle(content.hero.background, content.hero.backgroundVisibility)}>
        <div className="hero container">
          <div className="hero-copy">
            <p className="eyebrow"><MarkdownInline source={content.hero.eyebrow} /></p>
            <h1><MarkdownInline source={content.hero.title} /></h1>
            <p className="hero-subtitle"><MarkdownInline source={content.hero.subtitle} /></p>
            <MarkdownText source={content.hero.detail} className="hero-detail" />
            <a className="outline-button" href="/team">认识团队 <span aria-hidden="true">↗</span></a>
            <p className="hero-caption">数学方法 <span>/</span> 数据科学 <span>/</span> 工程计算</p>
          </div>
          <aside className="hero-news" aria-label="最新动态">
            <div className="news-topline"><span>最新动态</span><span>LATEST NEWS</span></div>
            <a href={featuredHref} aria-label={`查看${featuredArticle?.title ?? featuredNews?.title ?? "团队动态"}`}><ImageSlot label="活动照片或论文封面待上传" className="news-photo" src={content.hero.featureImage} /></a>
            <div className="news-content">
              {content.hero.featureLabel && <span className="news-kicker"><MarkdownInline source={content.hero.featureLabel} /></span>}
              <h2><a href={featuredHref}><MarkdownInline source={content.hero.featureTitle} /></a></h2>
              {content.hero.featureText && <MarkdownText source={content.hero.featureText} className="news-description" />}
              <a href={featuredHref}>查看动态详情 <span aria-hidden="true">↗</span></a>
            </div>
          </aside>
        </div>
      </section>
    <ContactSection content={content} />
    <SiteFooter content={content} />
  </main>;
}
