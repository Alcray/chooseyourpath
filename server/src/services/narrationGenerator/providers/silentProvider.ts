import type { NarrationProvider } from "../types.js";

// Used when no GOOGLE_APPLICATION_CREDENTIALS is configured. The child still gets Armenian
// captions on every scene, and the existing browser Web Speech API button
// (SpeakButton, client-side) can read them aloud as a no-cost fallback.
export class SilentNarrationProvider implements NarrationProvider {
  readonly name = "silent";

  async synthesize(): Promise<string | null> {
    return null;
  }
}
