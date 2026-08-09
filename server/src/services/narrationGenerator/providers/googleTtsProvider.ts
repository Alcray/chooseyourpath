import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";
import type { NarrationProvider, NarrationRequest } from "../types.js";

const TTS_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
const GENERATED_DIR = path.resolve(process.cwd(), "public", "generated");

// Google Cloud Text-to-Speech does NOT accept simple API keys (confirmed:
// it returns 401 CREDENTIALS_MISSING and explicitly asks for OAuth2/service
// account auth) — unlike Veo/Vertex AI, which does. So this provider
// authenticates via a service account, resolved the standard Google way
// (GOOGLE_APPLICATION_CREDENTIALS env var pointing at a JSON key file).
// GoogleAuth handles token exchange/caching/refresh internally.
//
// Armenian (hy-AM) is a preview-status language on Google's side — if a
// project doesn't have it enabled, synthesis fails and we fall back to
// silence (the child still sees Armenian captions and can use the existing
// browser-based "read aloud" button) rather than surfacing an error or
// blocking the story.
export class GoogleTtsProvider implements NarrationProvider {
  readonly name = "google-tts";
  // Only successful results are cached — see GeminiTtsProvider for why a
  // failure must not be cached permanently.
  private cache = new Map<string, string>();
  private auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

  async synthesize({ sceneKey, textHy }: NarrationRequest): Promise<string | null> {
    const cached = this.cache.get(sceneKey);
    if (cached) return cached;

    try {
      const client = await this.auth.getClient();
      const res = await client.request<{ audioContent: string }>({
        url: TTS_ENDPOINT,
        method: "POST",
        data: {
          input: { text: textHy },
          voice: { languageCode: "hy-AM", ssmlGender: "FEMALE" },
          audioConfig: { audioEncoding: "MP3", speakingRate: 0.95, pitch: 2.0 },
        },
      });

      await mkdir(GENERATED_DIR, { recursive: true });
      const filename = `${sceneKey}.mp3`;
      await writeFile(path.join(GENERATED_DIR, filename), Buffer.from(res.data.audioContent, "base64"));

      const audioUrl = `/generated/${filename}`;
      this.cache.set(sceneKey, audioUrl);
      return audioUrl;
    } catch (err) {
      console.warn(`[googleTtsProvider] narration synthesis failed for ${sceneKey}, will retry on next request:`, err);
      return null;
    }
  }
}
