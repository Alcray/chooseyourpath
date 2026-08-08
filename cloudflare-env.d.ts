declare namespace Cloudflare {
  interface Env {
    ASSETS: Fetcher;
    DB: D1Database;
    MEDIA: R2Bucket;
    GOOGLE_API_KEY?: string;
    GOOGLE_CLOUD_PROJECT_NUMBER?: string;
  }
}
