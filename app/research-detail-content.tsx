/* eslint-disable @next/next/no-html-link-for-pages -- Public links load the target page together with its styles. */
import type { SiteContent } from "./content";
import { DetailGallery, DetailLayout, DetailRelated, DetailSection, DetailSubsections } from "./detail-layout";
import { MarkdownInline, MarkdownText } from "./markdown";

export function ResearchDetailContent({ content, direction, onBack, onOpen, onPublications, activeSubsectionId, onEditSubsection }: {
  content: SiteContent;
  direction: SiteContent["directions"][number];
  onBack?: () => void;
  onOpen?: (slug: string) => void;
  onPublications?: () => void;
  activeSubsectionId?: string;
  onEditSubsection?: (id: string) => void;
}) {
  const topics = direction.topics.filter((topic) => topic.title.trim() || topic.detail.trim() || topic.image.trim());
  const presetLabels = new Set(["代表论文", "关键方法图", "研究结果", "新图片"]);
  const papers = direction.papers.filter((paper) => paper.description.trim() || paper.image.trim() || paper.url.trim()
    || (paper.title.trim() && !presetLabels.has(paper.title.trim())));
  const hasIntroduction = direction.summary.trim() || content.pageText.researchNote.trim() || direction.equation.trim() || direction.image.trim();
  const hasTopics = topics.length > 0 || content.pageText.focusIntro.trim();
  const hasPapers = papers.length > 0 || content.pageText.papersIntro.trim();
  const backHref = `/research#research-${encodeURIComponent(direction.slug)}`;

  return <DetailLayout
    title={direction.title}
    breadcrumbs={[
      { title: content.sectionTitles.research, href: backHref, onClick: onBack },
      { title: direction.title },
    ]}
    back={{ title: content.sectionTitles.research, href: backHref, onClick: onBack }}
  >
    {hasIntroduction && <div className="detail-introduction">
      {direction.summary.trim() && <MarkdownText source={direction.summary} />}
      {content.pageText.researchNote.trim() && <MarkdownText source={content.pageText.researchNote} className="detail-note" />}
      {direction.image.trim() && <img className="detail-image" src={direction.image} alt={`${direction.title}概念插图`} />}
      {direction.equation.trim() && <MarkdownText source={direction.equation} className="detail-equation" />}
    </div>}

    {hasTopics && <DetailSection title={content.pageText.focusTitle} intro={content.pageText.focusIntro}>
      <div className="detail-topics">
        {topics.map((topic, index) => <article className="detail-topic" key={index}>
          {topic.title.trim() && <h3><MarkdownInline source={topic.title} /></h3>}
          {topic.detail.trim() && <MarkdownText source={topic.detail} />}
          {topic.image.trim() && <img className="detail-image" src={topic.image} alt={topic.title} loading="lazy" />}
        </article>)}
      </div>
    </DetailSection>}

    {hasPapers && <DetailSection title={content.pageText.papersTitle} intro={content.pageText.papersIntro}>
      <DetailGallery items={papers} kind="paper" />
    </DetailSection>}

    <DetailSubsections sections={direction.subsections} activeId={activeSubsectionId} onEdit={onEditSubsection} />

    {!hasIntroduction && !hasTopics && !hasPapers && !direction.subsections.length && <p className="education-empty">内容待补充。</p>}

    <div className="detail-links">
      {onPublications
        ? <button type="button" onClick={onPublications}>查看团队论文与著作目录 <span aria-hidden="true">›</span></button>
        : <a href="/archive/publications">查看团队论文与著作目录 <span aria-hidden="true">›</span></a>}
    </div>

    <DetailRelated title={content.pageText.relatedTitle} links={content.directions.filter((item) => item.slug !== direction.slug).map((item) => ({
      title: item.title,
      href: `/research/${encodeURIComponent(item.slug)}`,
      onClick: onOpen ? () => onOpen(item.slug) : undefined,
    }))} />
  </DetailLayout>;
}
