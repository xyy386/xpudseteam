import { env } from "cloudflare:workers";
import { getChatGPTUser } from "./chatgpt-auth";

export async function isSiteEditor(): Promise<boolean> {
  const user = await getChatGPTUser();
  if (!user) return false;
  const configuredEmail = env.SITE_EDITOR_EMAIL?.trim().toLowerCase();
  if (configuredEmail) return user.email.toLowerCase() === configuredEmail;
  return import.meta.env.DEV && user.email === "seedy@sites.test";
}
