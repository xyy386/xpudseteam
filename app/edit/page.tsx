import { redirect } from "next/navigation";
import { getEditorIdentity } from "../editor-credentials";
import { getSiteContent } from "../content";
import Editor from "./editor";
import { syncEnvironment, syncPeerOrigin } from "../sync-environment";

export const dynamic = "force-dynamic";

export default async function EditPage() {
  const identity = await getEditorIdentity();
  if (!identity) redirect("/editor-login");
  const content = await getSiteContent();
  return <Editor key={`${identity.role}:${identity.id}`} initial={content} role={identity.role}
    email={identity.email} accountId={identity.id} environment={syncEnvironment()}
    peerOrigin={syncPeerOrigin()} />;
}
