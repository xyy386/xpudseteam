import { notFound } from "next/navigation";
import { getSiteContent } from "../../content";
import { appearanceStyle } from "../../appearance";
import { ArchiveDetailContent } from "../../archive-detail-content";
import { SiteFooter, SiteHeader } from "../../site-shell";
import { NewsListPage } from "../../news-articles";

export async function generateStaticParams() {
  const content = await getSiteContent();
  return content.archives.map((section) => ({ slug: section.slug }));
}

export default async function ArchivePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = await getSiteContent();
  const section = content.archives.find((item) => item.slug === slug);
  if (!section) notFound();
  if (slug === "events" || slug === "updates") return <NewsListPage content={content} section={section} />;

  return <main className="site-page" style={appearanceStyle(content.appearance, content.appearanceMobile)}>
    <SiteHeader content={content} active={section.homeAnchor} />
    <ArchiveDetailContent content={content} section={section} />
    <SiteFooter />
  </main>;
}
