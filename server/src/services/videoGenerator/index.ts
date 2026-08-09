import { MockVideoProvider } from "./providers/mockVideoProvider.js";
import { VeoVideoProvider } from "./providers/veoProvider.js";
import type { VideoGenerator } from "./types.js";

const veoApiKey = process.env.VEO_API_KEY;
const veoModel = process.env.VEO_MODEL || "veo-3.1-generate-001";
const veoProjectId = process.env.VEO_PROJECT_ID;
const veoLocation = process.env.VEO_LOCATION || "us-central1";

function buildVideoGenerator(): VideoGenerator {
  if (!veoApiKey) return new MockVideoProvider();
  if (!veoProjectId) {
    console.warn("[videoGenerator] VEO_API_KEY is set but VEO_PROJECT_ID is missing — falling back to the illustration mock. " + "Veo 3 runs on Vertex AI, which requires a GCP project id.");
    return new MockVideoProvider();
  }
  return new VeoVideoProvider(veoApiKey, veoModel, veoProjectId, veoLocation);
}

// The story engine and routes only ever depend on the VideoGenerator interface
// — never on Veo directly — so this is the single place that decides which
// implementation is active. Falls back to the instant illustration mock when
// no key (or no project id) is configured, so the interactive story
// experience keeps working.
export const videoGenerator: VideoGenerator = buildVideoGenerator();
