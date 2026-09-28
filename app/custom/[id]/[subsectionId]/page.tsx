import { EducationDetailPage } from "../../../section-page";
import { getSiteContent } from "../../../content";

export async function generateStaticParams() {
  const content = await getSiteContent();
  const education = content.customSections.find((section) => section.id === "education");
  return (education?.subsections ?? []).map((subsection) => ({ id: "education", subsectionId: subsection.id }));
}

export default async function CustomSubsectionRoute({ params }: {
  params: Promise<{ id: string; subsectionId: string }>;
}) {
  return <EducationDetailPage {...await params} />;
}
