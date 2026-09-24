import { notFound } from "next/navigation";
import { getSiteContent } from "./content";
import { appearanceStyle } from "./appearance";
import { MarkdownInline, MarkdownText } from "./markdown";
import { PhotoMosaic } from "./photo-mosaic";
import { SubsectionCards } from "./subsections";
import { ImageSlot, SectionTitle, SiteFooter, SiteHeader } from "./site-shell";

export type SectionKind = "team" | "research" | "outcomes" | "news" | "other";

export async function SectionPage({ kind }: { kind: SectionKind }) {
  const content = await getSiteContent();
  const outcomes = content.archives.filter((item) => item.homeAnchor === "outcomes");
  const news = content.archives.filter((item) => item.homeAnchor === "news");
  const other = content.archives.filter((item) => item.homeAnchor === "other");
  return <main className="site-page section-page" style={appearanceStyle(content.appearance, content.appearanceMobile)}>
    <SiteHeader content={content} active={kind} />
      {kind === "team" && (
      <section className="site-section team-section" id="team" style={content.backgrounds.team ? { backgroundImage: `linear-gradient(180deg,rgba(213,233,245,${1 - content.backgroundVisibility.team}),rgba(225,236,244,${1 - content.backgroundVisibility.team * .7})),url('${content.backgrounds.team}')`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
        <div className="container">
          <SectionTitle number="01" title={content.sectionTitles.team} english="OUR TEAM" intro={content.sectionIntros.team} level={1} />
          <div className="member-grid">
            {content.members.map((member, index) => (
              <article className="member-card" key={`${index}-${member.name}`}>
                <div className="member-photo">{member.photo && <img src={member.photo} alt={`${member.name}的照片`} loading="lazy" />}</div>
                <div className="member-copy"><h2><MarkdownInline source={member.name} /></h2><p className="member-role"><MarkdownInline source={member.role} /></p><MarkdownText source={member.focus} className="member-focus" />{member.url && <a href={member.url} target="_blank" rel="noopener noreferrer">查看学院简介 <span aria-hidden="true">↗</span></a>}</div>
              </article>
            ))}
          </div>
        </div>
      </section>
      )}
      {kind === "research" && (
      <section className="site-section research-section" id="research">
        <div className="container">
          <SectionTitle number="02" title={content.sectionTitles.research} english="RESEARCH AREAS" intro={content.sectionIntros.research} level={1} />
          <div className="direction-grid">
            {content.directions.map((direction, index) => (
              <article className="direction-card" key={direction.slug}>
                <a className="direction-image" href={`/research/${direction.slug}`} aria-label={`查看${direction.title}`}>{direction.image && <img src={direction.image} alt={`${direction.title}概念插图`} loading="lazy" />}<span className={`formula-badge formula-badge--${direction.slug}`}><MarkdownInline source={direction.equation} /></span></a>
                <div className="direction-copy">
                  <div className="direction-meta"><span>{String(index + 1).padStart(2, "0")}</span><small><MarkdownInline source={direction.english} /></small></div>
                  <h2><a href={`/research/${direction.slug}`}><MarkdownInline source={direction.title} /></a></h2>
                  <MarkdownText source={direction.summary} className="direction-description" />
                  <a className="direction-link" href={`/research/${direction.slug}`}>了解研究内容与论文展示 <span aria-hidden="true">↗</span></a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      )}
      {kind === "outcomes" && (
      <section className="site-section outcomes-section" id="outcomes" style={content.backgrounds.outcomes ? { backgroundImage: `linear-gradient(90deg,rgba(226,237,245,${1 - content.backgroundVisibility.outcomes * .8}),rgba(226,237,245,${1 - content.backgroundVisibility.outcomes})),url('${content.backgrounds.outcomes}')`, backgroundSize: "cover", backgroundPosition: "center 45%" } : undefined}>
        <div className="container">
          <SectionTitle number="03" title={content.sectionTitles.outcomes} english="OUTCOMES" intro={content.sectionIntros.outcomes} level={1} />
          <div className="outcome-grid">
            {outcomes.map((item, index) => <article className="outcome-card" key={item.slug}><a href={`/archive/${item.slug}`} aria-label={`查看${item.title}图片及表格`}><ImageSlot label={`${item.title}图片待上传`} src={item.cover} /></a><div><small>{String(index + 1).padStart(2, "0")} / <MarkdownInline source={item.english} /></small><h2><a href={`/archive/${item.slug}`}><MarkdownInline source={item.title} /></a></h2><MarkdownText source={item.summary} className="module-description" /><a className="module-link" href={`/archive/${item.slug}`}>查看图片与资料表 <span aria-hidden="true">↗</span></a></div></article>)}
          </div>
        </div>
      </section>
      )}
      {kind === "news" && (
      <section className="site-section news-section" id="news" style={content.backgrounds.news ? { backgroundImage: `linear-gradient(180deg,rgba(231,242,249,${1 - content.backgroundVisibility.news}),rgba(237,243,248,${1 - content.backgroundVisibility.news * .7})),url('${content.backgrounds.news}')`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
        <div className="container">
          <SectionTitle number="04" title={content.sectionTitles.news} english="NEWS & EVENTS" intro={content.sectionIntros.news} level={1} />
          <div className="news-grid">
            {news.map((item) => <article className="news-card" key={item.slug}><a href={`/archive/${item.slug}`} aria-label={`查看${item.title}`}><ImageSlot label={`${item.title}图片待上传`} src={item.cover} /></a><div><small><MarkdownInline source={item.english} /></small><h2><a href={`/archive/${item.slug}`}><MarkdownInline source={item.title} /></a></h2><MarkdownText source={item.summary} className="module-description" /><a className="module-link" href={`/archive/${item.slug}`}>查看图片与资料表 <span aria-hidden="true">↗</span></a></div></article>)}
          </div>
        </div>
      </section>
      )}
      {kind === "other" && (
      <section className="site-section other-section" id="other" style={content.backgrounds.other ? { backgroundImage: `linear-gradient(180deg,rgba(231,242,249,${1 - content.backgroundVisibility.other}),rgba(237,243,248,${1 - content.backgroundVisibility.other * .7})),url('${content.backgrounds.other}')`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
        <div className="container">
          <SectionTitle number="05" title={content.sectionTitles.other} english="MORE" intro={content.sectionIntros.other} level={1} />
          <div className="outcome-grid">
            {other.map((item, index) => <article className="outcome-card" key={item.slug}><a href={`/archive/${item.slug}`} aria-label={`查看${item.title}`}><ImageSlot label={item.title} src={item.cover} /></a><div><small>{String(index + 1).padStart(2, "0")} / <MarkdownInline source={item.english} /></small><h2><a href={`/archive/${item.slug}`}><MarkdownInline source={item.title} /></a></h2>{item.summary && <MarkdownText source={item.summary} className="module-description" />}<a className="module-link" href={`/archive/${item.slug}`}>查看栏目 <span aria-hidden="true">↗</span></a></div></article>)}
          </div>
        </div>
      </section>
      )}
    <SiteFooter content={content} />
  </main>;
}

export async function CustomPage({ id }: { id: string }) {
  const content = await getSiteContent();
  const index = content.customSections.findIndex((item) => item.id === id);
  if (index < 0) notFound();
  const section = content.customSections[index];
  return <main className="site-page section-page" style={appearanceStyle(content.appearance, content.appearanceMobile)}>
    <SiteHeader content={content} active={`custom-${id}`} />
      <section className="site-section custom-section" id={`custom-${section.id}`}>
        <div className="container">
          <SectionTitle number={String(index + 6).padStart(2, "0")} title={section.title} english={section.english} intro={section.intro} level={1} />
          {(section.body || section.image) && <div className={`custom-section-feature${section.image ? " has-image" : ""}`}>
            {section.body && <MarkdownText source={section.body} className="custom-section-body" />}
            {section.image && <div className="custom-section-image"><img src={section.image} alt={section.title} loading="lazy" /></div>}
          </div>}
          <PhotoMosaic kind="gallery" items={section.items} />
          <SubsectionCards sections={section.subsections} />
        </div>
      </section>
    <SiteFooter content={content} />
  </main>;
}
