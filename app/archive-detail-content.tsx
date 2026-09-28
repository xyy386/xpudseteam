import type { ArchiveItem, SiteContent } from "./content";
import { MarkdownText } from "./markdown";
import { DetailGallery, DetailLayout, DetailRelated, DetailSection, DetailSubsections, DetailTable, hasDetailRows } from "./detail-layout";

export function ArchiveDetailContent({ content, section, onBack, onOpen, activeSubsectionId, onEditSubsection }: {
  content: SiteContent; section: ArchiveItem; onBack?: () => void; onOpen?: (slug: string) => void;
  activeSubsectionId?: string; onEditSubsection?: (id: string) => void;
}) {
  const parentTitle = content.sectionTitles[section.homeAnchor as keyof SiteContent["sectionTitles"]] || section.group;
  const backHref = `/${section.homeAnchor}#archive-${encodeURIComponent(section.slug)}`;
  // Labels alone are the editor's empty image slots, not published materials.
  const gallery = section.gallery.filter((item) => item.image.trim() || item.caption.trim());
  const hasRows = hasDetailRows(section);
  const intro = section.description.trim() ? section.description : section.summary;
  const hasGallery = gallery.length > 0 || content.pageText.galleryIntro.trim();
  const hasTable = hasRows || content.pageText.tableIntro.trim();
  const hasContent = intro.trim() || hasGallery || hasTable || section.subsections.length;
  return <DetailLayout title={section.title} breadcrumbs={[
    { title: parentTitle, href: backHref, onClick: onBack }, { title: section.title },
  ]} back={{ title: parentTitle, href: backHref, onClick: onBack }}>
    {intro.trim() && <MarkdownText source={intro} className="detail-introduction" />}
    {hasGallery && <DetailSection title={content.pageText.galleryTitle} intro={content.pageText.galleryIntro}>
      <DetailGallery items={gallery.map((item) => ({ title: item.label, description: item.caption, image: item.image, url: "", layout: item.layout, layoutMobile: item.layoutMobile }))} />
    </DetailSection>}
    {hasTable && <DetailSection title={content.pageText.tableTitle} intro={content.pageText.tableIntro}><DetailTable section={section} /></DetailSection>}
    <DetailSubsections sections={section.subsections} activeId={activeSubsectionId} onEdit={onEditSubsection} />
    {!hasContent && <p className="education-empty">内容待补充。</p>}
    <DetailRelated title={content.pageText.moreTitle} links={content.archives.filter((item) => item.slug !== section.slug).map((item) => ({
      title: item.title, href: `/archive/${encodeURIComponent(item.slug)}`, onClick: onOpen ? () => onOpen(item.slug) : undefined,
    }))} />
  </DetailLayout>;
}
