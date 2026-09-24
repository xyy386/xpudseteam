import { CustomPage } from "../../section-page";

export default async function CustomSectionRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomPage id={id} />;
}
