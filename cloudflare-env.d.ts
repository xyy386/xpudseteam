declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    SITE_LOCAL_DATA_DIR?: string;
  }
}

interface ImportMetaEnv {
  readonly VITE_SYNC_TEST_ONLINE?: string;
  readonly VITE_SYNC_TEST_PEER_ORIGIN?: string;
}
