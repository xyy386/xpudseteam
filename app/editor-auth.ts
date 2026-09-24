import { getEditorIdentity } from "./editor-credentials";

export async function isSiteEditor(): Promise<boolean> {
  return (await getEditorIdentity()) !== null;
}
