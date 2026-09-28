import { notFound } from "next/navigation";
import { getSiteContent } from "../../content";
import { appearanceStyle } from "../../appearance";
import { ResearchDetailContent } from "../../research-detail-content";
import { SiteFooter, SiteHeader } from "../../site-shell";

export default async function ResearchDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = await getSiteContent();
  const direction = content.directions.find((item) => item.slug === slug);
  if (!direction) notFound();

  return (
    <main className="research-detail-page site-page" style={appearanceStyle(content.appearance, content.appearanceMobile)}>
      <SiteHeader content={content} active="research" />
      <ResearchDetailContent content={content} direction={direction} />
      <SiteFooter />
    </main>
  );
}
