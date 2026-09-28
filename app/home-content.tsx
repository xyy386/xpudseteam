import type { SiteContent } from "./content";
import { heroBackgroundStyle } from "./hero-background";
import { selectHomeNews } from "./home-news";
import { MarkdownInline, MarkdownText } from "./markdown";
import { ContactContent } from "./contact-content";

export function HomepageContent({ content, contactId = "contact", onTeamClick, onNewsClick, onArticleClick, onContactClick }: {
  content: SiteContent;
  contactId?: string;
  onTeamClick?: () => void;
  onNewsClick?: () => void;
  onArticleClick?: (archiveIndex: number, articleIndex: number) => void;
  onContactClick?: () => void;
}) {
  const news = selectHomeNews(content.archives);
  return <div className="home-surface">
    <section className="home-overview" style={heroBackgroundStyle(content.hero.background, content.hero.backgroundVisibility)} aria-label="课题组简介与最新动态">
      <div className="home-overview-inner">
        <section className="home-introduction" aria-label="课题组简介">
          <div className="home-column-heading"><h1>课题组简介</h1></div>
          <MarkdownText source={content.hero.detail} className="home-introduction-body" />
          {onTeamClick
            ? <button type="button" className="home-team-link" onClick={onTeamClick}>查看团队成员 <span aria-hidden="true">→</span></button>
            : <a className="home-team-link" href="/team">查看团队成员 <span aria-hidden="true">→</span></a>}
        </section>
        <section className="home-latest-news" aria-label="最新动态">
          <div className="home-column-heading">
            <h2>最新动态</h2>
            {onNewsClick
              ? <button type="button" className="home-news-more" onClick={onNewsClick}>更多 <span aria-hidden="true">›</span></button>
              : <a className="home-news-more" href="/news" aria-label="更多团队动态">更多 <span aria-hidden="true">›</span></a>}
          </div>
          {news.length ? <ul className="home-news-items">{news.map((item) => <li key={item.href}>
            {onArticleClick
              ? <button type="button" className="home-news-item" onClick={() => onArticleClick(item.archiveIndex, item.articleIndex)}><span><MarkdownInline source={item.title} /></span>{item.date && <time dateTime={item.date}>{item.date}</time>}</button>
              : <a className="home-news-item" href={item.href}><span><MarkdownInline source={item.title} /></span>{item.date && <time dateTime={item.date}>{item.date}</time>}</a>}
          </li>)}</ul> : <p className="home-news-empty">暂无已发布动态。</p>}
        </section>
      </div>
    </section>
    <ContactContent content={content} variant="compact" id={contactId} onContactClick={onContactClick} />
  </div>;
}

export function ContactBlock({ content, id = "contact" }: { content: SiteContent; id?: string }) {
  return <ContactContent content={content} variant="compact" id={id} />;
}
