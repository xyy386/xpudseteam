export type SyncEnvironment = "local" | "online";

export const LIVE_SITE_ORIGIN = "https://xpudse.ftt66.chatgpt.site";
export const LOCAL_SITE_ORIGIN = "http://localhost:5173";

export function syncEnvironment(): SyncEnvironment {
  return !import.meta.env.DEV || import.meta.env.VITE_SYNC_TEST_ONLINE === "1" ? "online" : "local";
}

export function syncPeerOrigin(): string {
  if (import.meta.env.DEV && typeof import.meta.env.VITE_SYNC_TEST_PEER_ORIGIN === "string") {
    try {
      const url = new URL(import.meta.env.VITE_SYNC_TEST_PEER_ORIGIN);
      if (url.protocol === "http:" && url.hostname === "localhost" && !url.username && !url.password
        && Number(url.port) >= 5173 && Number(url.port) <= 5199 && url.pathname === "/" && !url.search && !url.hash) {
        return url.origin;
      }
    } catch { /* Invalid test override is ignored. */ }
  }
  return syncEnvironment() === "online" ? LOCAL_SITE_ORIGIN : LIVE_SITE_ORIGIN;
}
