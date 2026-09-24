import { getSiteContent } from "./content";
import { appearanceStyle } from "./appearance";
import { MarkdownInline, MarkdownText } from "./markdown";
import { heroBackgroundStyle } from "./hero-background";
import { PhotoMosaic } from "./photo-mosaic";
import { SubsectionCards } from "./subsections";

function SectionTitle({ number, title, english, intro }: { number: string; title: string; english: string; intro?: string }) {
  return (
    <div className="section-heading">
      <div className="section-heading-line"><span>{number}</span><h2><MarkdownInline source={title} /></h2><small>{english}</small></div>
      {intro && <MarkdownText source={intro} className="section-intro-markdown" />}
    </div>
  );
}

function ImageSlot({ label, className = "", src = "" }: { label: string; className?: string; src?: string }) {
  return <div className={`media-slot ${className}`} aria-label={label}>{src && <img src={src} alt={label} />}</div>;
}

export default async function Home() {
  const content = await getSiteContent();
  const outcomes = content.archives.filter((item) => item.homeAnchor === "outcomes");
  const news = content.archives.filter((item) => item.homeAnchor === "news");
  const other = content.archives.filter((item) => item.homeAnchor === "other");
  const featuredNews = news.find((item) => item.slug === content.hero.featureTargetSlug);
  const featuredHref = featuredNews ? `/archive/${featuredNews.slug}` : "#news";
  return (
    <main id="top" className="site-page" style={appearanceStyle(content.appearance, content.appearanceMobile)}>
      <header className="site-header">
        <div className="container header-inner">
          <a className="brand" href="#top"><span className="brand-monogram">数研</span><span><strong><MarkdownInline source={content.siteName} /></strong><small><MarkdownInline source={content.institution} /></small></span></a>
          <nav className="main-nav" aria-label="主导航">
            <a href="#team">团队成员</a><a href="#research">研究方向</a><a href="#outcomes">研究成果</a><a href="#news">团队动态</a><a href="#other">其他</a>{content.customSections.map((section) => <a href={`#custom-${section.id}`} key={section.id}><MarkdownInline source={section.title} /></a>)}<a href="#contact">联系我们</a><a href="/edit">编辑网站</a>
          </nav>
        </div>
      </header>
      <section className="hero-shell" style={heroBackgroundStyle(content.hero.background, content.hero.backgroundVisibility)}>
        <div className="hero container">
          <div className="hero-copy">
            <p className="eyebrow"><MarkdownInline source={content.hero.eyebrow} /></p>
            <h1><MarkdownInline source={content.hero.title} /></h1>
            <p className="hero-subtitle"><MarkdownInline source={content.hero.subtitle} /></p>
            <MarkdownText source={content.hero.detail} className="hero-detail" />
            <a className="outline-button" href="#team">认识团队 <span aria-hidden="true">↗</span></a>
            <p className="hero-caption">数学方法 <span>/</span> 数据科学 <span>/</span> 工程计算</p>
          </div>
          <aside className="hero-news" aria-label="最新动态">
            <div className="news-topline"><span>最新动态</span><span>LATEST NEWS</span></div>
            <a href={featuredHref} aria-label={`查看${featuredNews?.title ?? "团队动态"}`}><ImageSlot label="活动照片或论文封面待上传" className="news-photo" src={content.hero.featureImage} /></a>
            <div className="news-content">
              {content.hero.featureLabel && <span className="news-kicker"><MarkdownInline source={content.hero.featureLabel} /></span>}
              <h2><a href={featuredHref}><MarkdownInline source={content.hero.featureTitle} /></a></h2>
              {content.hero.featureText && <MarkdownText source={content.hero.featureText} className="news-description" />}
              <a href={featuredHref}>查看动态详情 <span aria-hidden="true">↗</span></a>
            </div>
          </aside>
        </div>
      </section>

      <section className="site-section team-section" id="team" style={content.backgrounds.team ? { backgroundImage: `linear-gradient(180deg,rgba(213,233,245,${1 - content.backgroundVisibility.team}),rgba(225,236,244,${1 - content.backgroundVisibility.team * .7})),url('${content.backgrounds.team}')`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
        <div className="container">
          <SectionTitle number="01" title={content.sectionTitles.team} english="OUR TEAM" intro={content.sectionIntros.team} />
          <div className="member-grid">
            {content.members.map((member, index) => (
              <article className="member-card" key={`${index}-${member.name}`}>
                <div className="member-photo">{member.photo && <img src={member.photo} alt={`${member.name}的照片`} loading="lazy" />}</div>
                <div className="member-copy"><h3><MarkdownInline source={member.name} /></h3><p className="member-role"><MarkdownInline source={member.role} /></p><MarkdownText source={member.focus} className="member-focus" />{member.url && <a href={member.url} target="_blank" rel="noopener noreferrer">查看学院简介 <span aria-hidden="true">↗</span></a>}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="site-section research-section" id="research">
        <div className="container">
          <SectionTitle number="02" title={content.sectionTitles.research} english="RESEARCH AREAS" intro={content.sectionIntros.research} />
          <div className="direction-grid">
            {content.directions.map((direction, index) => (
              <article className="direction-card" key={direction.slug}>
                <a className="direction-image" href={`/research/${direction.slug}`} aria-label={`查看${direction.title}`}>{direction.image && <img src={direction.image} alt={`${direction.title}概念插图`} loading="lazy" />}<span className={`formula-badge formula-badge--${direction.slug}`}><MarkdownInline source={direction.equation} /></span></a>
                <div className="direction-copy">
                  <div className="direction-meta"><span>{String(index + 1).padStart(2, "0")}</span><small><MarkdownInline source={direction.english} /></small></div>
                  <h3><a href={`/research/${direction.slug}`}><MarkdownInline source={direction.title} /></a></h3>
                  <MarkdownText source={direction.summary} className="direction-description" />
                  <a className="direction-link" href={`/research/${direction.slug}`}>了解研究内容与论文展示 <span aria-hidden="true">↗</span></a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="site-section outcomes-section" id="outcomes" style={content.backgrounds.outcomes ? { backgroundImage: `linear-gradient(90deg,rgba(226,237,245,${1 - content.backgroundVisibility.outcomes * .8}),rgba(226,237,245,${1 - content.backgroundVisibility.outcomes})),url('${content.backgrounds.outcomes}')`, backgroundSize: "cover", backgroundPosition: "center 45%" } : undefined}>
        <div className="container">
          <SectionTitle number="03" title={content.sectionTitles.outcomes} english="OUTCOMES" intro={content.sectionIntros.outcomes} />
          <div className="outcome-grid">
            {outcomes.map((item, index) => <article className="outcome-card" key={item.slug}><a href={`/archive/${item.slug}`} aria-label={`查看${item.title}图片及表格`}><ImageSlot label={`${item.title}图片待上传`} src={item.cover} /></a><div><small>{String(index + 1).padStart(2, "0")} / <MarkdownInline source={item.english} /></small><h3><a href={`/archive/${item.slug}`}><MarkdownInline source={item.title} /></a></h3><MarkdownText source={item.summary} className="module-description" /><a className="module-link" href={`/archive/${item.slug}`}>查看图片与资料表 <span aria-hidden="true">↗</span></a></div></article>)}
          </div>
        </div>
      </section>

      <section className="site-section news-section" id="news" style={content.backgrounds.news ? { backgroundImage: `linear-gradient(180deg,rgba(231,242,249,${1 - content.backgroundVisibility.news}),rgba(237,243,248,${1 - content.backgroundVisibility.news * .7})),url('${content.backgrounds.news}')`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
        <div className="container">
          <SectionTitle number="04" title={content.sectionTitles.news} english="NEWS & EVENTS" intro={content.sectionIntros.news} />
          <div className="news-grid">
            {news.map((item) => <article className="news-card" key={item.slug}><a href={`/archive/${item.slug}`} aria-label={`查看${item.title}`}><ImageSlot label={`${item.title}图片待上传`} src={item.cover} /></a><div><small><MarkdownInline source={item.english} /></small><h3><a href={`/archive/${item.slug}`}><MarkdownInline source={item.title} /></a></h3><MarkdownText source={item.summary} className="module-description" /><a className="module-link" href={`/archive/${item.slug}`}>查看图片与资料表 <span aria-hidden="true">↗</span></a></div></article>)}
          </div>
        </div>
      </section>

      <section className="site-section other-section" id="other" style={content.backgrounds.other ? { backgroundImage: `linear-gradient(180deg,rgba(231,242,249,${1 - content.backgroundVisibility.other}),rgba(237,243,248,${1 - content.backgroundVisibility.other * .7})),url('${content.backgrounds.other}')`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
        <div className="container">
          <SectionTitle number="05" title={content.sectionTitles.other} english="MORE" intro={content.sectionIntros.other} />
          <div className="outcome-grid">
            {other.map((item, index) => <article className="outcome-card" key={item.slug}><a href={`/archive/${item.slug}`} aria-label={`查看${item.title}`}><ImageSlot label={item.title} src={item.cover} /></a><div><small>{String(index + 1).padStart(2, "0")} / <MarkdownInline source={item.english} /></small><h3><a href={`/archive/${item.slug}`}><MarkdownInline source={item.title} /></a></h3>{item.summary && <MarkdownText source={item.summary} className="module-description" />}<a className="module-link" href={`/archive/${item.slug}`}>查看栏目 <span aria-hidden="true">↗</span></a></div></article>)}
          </div>
        </div>
      </section>

      {content.customSections.map((section, index) => <section className="site-section custom-section" id={`custom-${section.id}`} key={section.id}>
        <div className="container">
          <SectionTitle number={String(index + 6).padStart(2, "0")} title={section.title} english={section.english} intro={section.intro} />
          {(section.body || section.image) && <div className={`custom-section-feature${section.image ? " has-image" : ""}`}>
            {section.body && <MarkdownText source={section.body} className="custom-section-body" />}
            {section.image && <div className="custom-section-image"><img src={section.image} alt={section.title} loading="lazy" /></div>}
          </div>}
          <PhotoMosaic kind="gallery" items={section.items} />
          <SubsectionCards sections={section.subsections} />
        </div>
      </section>)}

      <section className="site-section contact-section" id="contact">
        <div className="container">
          <SectionTitle number={String(6 + content.customSections.length).padStart(2, "0")} title={content.sectionTitles.contact} english="CONTACT" intro={content.sectionIntros.contact} />
          <div className="contact-layout">
            {content.contact && <MarkdownText source={content.contact} className="contact-overview" />}
            <dl className="contact-details">
              {content.contactDetails.person && <div><dt>联系人</dt><dd><MarkdownInline source={content.contactDetails.person} /></dd></div>}
              {content.contactDetails.role && <div><dt>职务</dt><dd><MarkdownInline source={content.contactDetails.role} /></dd></div>}
              {content.contactDetails.email && <div><dt>电子邮箱</dt><dd><MarkdownInline source={content.contactDetails.email} /></dd></div>}
              {content.contactDetails.phone && <div><dt>联系电话</dt><dd><MarkdownInline source={content.contactDetails.phone} /></dd></div>}
              {content.contactDetails.address && <div><dt>联系地址</dt><dd><MarkdownInline source={content.contactDetails.address} /></dd></div>}
              {content.contactDetails.extra && <div className="contact-extra"><dt>其他信息</dt><dd><MarkdownText source={content.contactDetails.extra} /></dd></div>}
            </dl>
          </div>
        </div>
      </section>

      <footer><div className="container footer-inner"><div><strong><MarkdownInline source={content.siteName} /></strong><p><MarkdownInline source={content.institution} /></p></div></div></footer>
    </main>
  );
}
