import { notFound } from "next/navigation";
import { getSiteContent } from "./content";
import { appearanceStyle } from "./appearance";
import { MarkdownInline, MarkdownText } from "./markdown";
import { PhotoMosaic } from "./photo-mosaic";
import { SubsectionCards } from "./subsections";
import { EducationContent, EducationDetail } from "./education-content";
import { SectionTitle, SiteFooter, SiteHeader } from "./site-shell";
import { ArchiveOverview } from "./archive-overview";
import { TeamContent, ResearchOverview } from "./people-overviews";

export type SectionKind = "team" | "research" | "outcomes" | "news" | "other";

export async function SectionPage({ kind }: { kind: SectionKind }) {
  const content = await getSiteContent();
  return <main className="site-page section-page" style={appearanceStyle(content.appearance, content.appearanceMobile)}>
    <SiteHeader content={content} active={kind} />
    {kind === "team" && <TeamContent content={content} />}
    {kind === "research" && <ResearchOverview content={content} />}
      {(kind === "outcomes" || kind === "news" || kind === "other") && <ArchiveOverview content={content} kind={kind} />}
    <SiteFooter />
  </main>;
}

export async function CustomPage({ id }: { id: string }) {
  const content = await getSiteContent();
  const index = content.customSections.findIndex((item) => item.id === id);
  if (index < 0) notFound();
  const section = content.customSections[index];
  return <main className="site-page section-page" style={appearanceStyle(content.appearance, content.appearanceMobile)}>
    <SiteHeader content={content} active={`custom-${id}`} />
      {section.id === "education" ? <EducationContent section={section} /> : <section className="site-section custom-section" id={`custom-${section.id}`}>
        <div className="container">
          <SectionTitle number={String(index + 6).padStart(2, "0")} title={section.title} english={section.english} intro={section.intro} level={1} />
          {(section.body || section.image) && <div className={`custom-section-feature${section.image ? " has-image" : ""}`}>
            {section.body && <MarkdownText source={section.body} className="custom-section-body" />}
            {section.image && <div className="custom-section-image"><img src={section.image} alt={section.title} loading="lazy" /></div>}
          </div>}
          <PhotoMosaic kind="gallery" items={section.items} />
          <SubsectionCards sections={section.subsections} />
        </div>
      </section>}
    <SiteFooter />
  </main>;
}

export async function EducationDetailPage({ id, subsectionId }: { id: string; subsectionId: string }) {
  if (id !== "education") notFound();
  const content = await getSiteContent();
  const section = content.customSections.find((item) => item.id === id);
  const item = section?.subsections.find((item) => item.id === subsectionId);
  if (!section || !item) notFound();
  return <main className="site-page section-page" style={appearanceStyle(content.appearance, content.appearanceMobile)}>
    <SiteHeader content={content} active="custom-education" />
    <EducationDetail section={section} item={item} />
    <SiteFooter />
  </main>;
}
