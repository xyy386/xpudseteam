import { CustomPage } from "../../section-page";
import { getSiteContent } from "../../content";

export async function generateStaticParams() {
  const content = await getSiteContent();
  return content.customSections.map((section) => ({ id: section.id }));
}

export default async function CustomSectionRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomPage id={id} />;
}
