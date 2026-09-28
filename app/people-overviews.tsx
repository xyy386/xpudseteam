import type { ReactNode } from "react";
import type { SiteContent } from "./content";
import { MarkdownInline, MarkdownText } from "./markdown";

function OverviewHeading({ title, intro }: { title: string; intro: string }) {
  return <header className="people-overview-heading">
    <h1><MarkdownInline source={title} /></h1>
    {intro.trim() && <MarkdownText source={intro} />}
  </header>;
}

export function TeamContent({ content, activeIndex, onEdit }: {
  content: SiteContent;
  activeIndex?: number | null;
  onEdit?: (index: number) => void;
}) {
  return <section className="people-overview team-overview" id="team" aria-label={content.sectionTitles.team}>
    <div className="people-overview-inner">
      <OverviewHeading title={content.sectionTitles.team} intro={content.sectionIntros.team} />
      {content.members.length ? <div className="team-directory">
        {content.members.map((member, index) => <article className={`team-profile${activeIndex === index ? " is-editing" : ""}`} key={`${index}-${member.name}`}>
          <div className="team-profile-photo">
            {member.photo.trim() ? <img src={member.photo} alt={`${member.name}的照片`} loading="lazy" /> : <span>暂无照片</span>}
          </div>
          <div className="team-profile-identity">
            <h2><MarkdownInline source={member.name} /></h2>
            {member.role.trim() && <p className="team-profile-role"><MarkdownInline source={member.role} /></p>}
          </div>
          {member.focus.trim() && <MarkdownText source={member.focus} className="team-profile-focus" />}
          {(member.url.trim() || onEdit) && <div className="team-profile-actions">
            {member.url.trim() && <a href={member.url} target="_blank" rel="noopener noreferrer">个人简介 <span aria-hidden="true">↗</span></a>}
            {onEdit && <button type="button" className="people-overview-edit" onClick={() => onEdit(index)}>编辑此成员 <span aria-hidden="true">↗</span></button>}
          </div>}
        </article>)}
      </div> : <p className="people-overview-empty">内容待补充。</p>}
    </div>
  </section>;
}

function ResearchLink({ href, onOpen, className, label, children }: {
  href: string;
  onOpen?: () => void;
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  return onOpen
    ? <button type="button" className={className} aria-label={label} onClick={onOpen}>{children}</button>
    : <a className={className} aria-label={label} href={href}>{children}</a>;
}

export function ResearchOverview({ content, activeSlug, onOpen }: {
  content: SiteContent;
  activeSlug?: string;
  onOpen?: (slug: string) => void;
}) {
  return <section className="people-overview research-overview" id="research" aria-label={content.sectionTitles.research}>
    <div className="people-overview-inner">
      <OverviewHeading title={content.sectionTitles.research} intro={content.sectionIntros.research} />
      {content.directions.length ? <div className="research-card-grid">
        {content.directions.map((direction) => {
          const href = `/research/${encodeURIComponent(direction.slug)}`;
          const open = onOpen ? () => onOpen(direction.slug) : undefined;
          return <article className={`research-card${activeSlug === direction.slug ? " is-editing" : ""}`} id={`research-${direction.slug}`} key={direction.slug}>
            {direction.image.trim() && <ResearchLink href={href} onOpen={open} className="research-card-image" label={`查看${direction.title}`}>
              <img src={direction.image} alt={`${direction.title}概念插图`} loading="lazy" />
            </ResearchLink>}
            <div className="research-card-copy">
              <div className="research-card-heading">
                <h2><ResearchLink href={href} onOpen={open}><MarkdownInline source={direction.title} /></ResearchLink></h2>
                <ResearchLink href={href} onOpen={open} className="research-card-more" label={`更多${direction.title}`}>更多 <span aria-hidden="true">›</span></ResearchLink>
              </div>
              {direction.summary.trim() ? <MarkdownText source={direction.summary} className="research-card-summary" /> : <p className="people-overview-empty">内容待补充。</p>}
            </div>
          </article>;
        })}
      </div> : <p className="people-overview-empty">内容待补充。</p>}
    </div>
  </section>;
}
