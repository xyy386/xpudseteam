import { EducationDetailPage } from "../../../section-page";

export default async function CustomSubsectionRoute({ params }: {
  params: Promise<{ id: string; subsectionId: string }>;
}) {
  return <EducationDetailPage {...await params} />;
}
