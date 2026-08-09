import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { VeoPromptBuilder } from "../promptBuilder.js";
import type { SceneAsset, SceneGenerationRequest, SceneJob, VideoGenerator } from "../types.js";

const GENERATED_DIR = path.resolve(process.cwd(), "public", "generated");

interface InternalJob {
  sceneKey: string;
  status: "processing" | "ready" | "error";
  operationName?: string;
  asset?: SceneAsset;
  error?: string;
}

// Real video generation via Veo 3 on Vertex AI (aiplatform.googleapis.com).
//
// Note: this is Vertex AI, not the Gemini Developer API (generativelanguage.
// googleapis.com) — despite both accepting a Google API key, they are
// different products with different request/response shapes. Vertex AI
// requires a GCP project + region in the URL, polls long-running operations
// via `:fetchPredictOperation` (not a plain GET on the operation resource),
// and returns the finished video as inline base64 bytes rather than a
// separate downloadable URI.
//
// Generation is asynchronous: `generateScene` kicks off a long-running
// operation and returns immediately with status "processing"; the caller
// polls `getGenerationStatus` until it flips to "ready". The decoded video
// bytes are written once to server/public/generated/ and served back as a
// stable local URL.
export class VeoVideoProvider implements VideoGenerator {
  readonly name = "veo";
  private jobs = new Map<string, InternalJob>();
  private promptBuilder = new VeoPromptBuilder();
  private apiBase: string;
  private modelPath: string;

  constructor(
    private apiKey: string,
    model: string,
    projectId: string,
    location: string
  ) {
    this.apiBase = `https://${location}-aiplatform.googleapis.com/v1`;
    this.modelPath = `projects/${projectId}/locations/${location}/publishers/google/models/${model}`;
    this.rehydrateFromDisk();
  }

  // The in-memory `jobs` map doesn't survive a server restart, but the
  // generated .mp4 files on disk do — without this, restarting the dev
  // server (or a crash/redeploy in production) would silently re-trigger a
  // full (paid) Veo generation for every scene the child had already
  // watched. Scan once at startup and treat any existing file as an
  // already-"ready" job, keyed by its filename (== sceneKey).
  private rehydrateFromDisk() {
    if (!existsSync(GENERATED_DIR)) return;
    const files = readdirSync(GENERATED_DIR).filter((f) => f.endsWith(".mp4"));
    for (const file of files) {
      const sceneKey = file.replace(/\.mp4$/, "");
      this.jobs.set(sceneKey, {
        sceneKey,
        status: "ready",
        asset: { type: "video", videoUrl: `/generated/${file}`, audioUrl: null },
      });
    }
    if (files.length > 0) console.log(`[veoProvider] rehydrated ${files.length} previously generated video(s) from disk`);
  }

  async generateScene(req: SceneGenerationRequest): Promise<SceneJob> {
    const existing = this.jobs.get(req.sceneKey);
    if (existing) return toSceneJob(existing);

    const prompt = this.promptBuilder.build({
      characterBible: req.characterBible,
      environment: req.environment,
      actionEn: req.actionEn,
      mood: req.mood,
    });

    const job: InternalJob = { sceneKey: req.sceneKey, status: "processing" };
    this.jobs.set(req.sceneKey, job);

    try {
      const res = await fetch(`${this.apiBase}/${this.modelPath}:predictLongRunning`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { aspectRatio: "16:9", durationSeconds: "6" },
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Veo predictLongRunning failed: ${res.status} ${errText}`);
      }

      const data = (await res.json()) as { name: string };
      job.operationName = data.name;
    } catch (err) {
      job.status = "error";
      job.error = err instanceof Error ? err.message : String(err);
      console.error(`[veoProvider] generateScene(${req.sceneKey}) failed:`, err);
    }

    return toSceneJob(job);
  }

  async getGenerationStatus(sceneKey: string): Promise<SceneJob> {
    const job = this.jobs.get(sceneKey);
    // Not "error": this scene simply hasn't been registered yet — e.g. its
    // spot in the pregeneration stagger hasn't come up. A real generation
    // failure is reported via job.status === "error" once a job exists.
    if (!job) return { sceneKey, status: "pending" };
    if (job.status !== "processing" || !job.operationName) return toSceneJob(job);

    try {
      const res = await fetch(`${this.apiBase}/${this.modelPath}:fetchPredictOperation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({ operationName: job.operationName }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Veo operation poll failed: ${res.status} ${errText}`);
      }
      const op = (await res.json()) as {
        done?: boolean;
        error?: { message: string };
        response?: { videos?: { bytesBase64Encoded: string; mimeType: string }[] };
      };

      if (op.error) {
        job.status = "error";
        job.error = op.error.message;
      } else if (op.done) {
        const video = op.response?.videos?.[0];
        if (!video) {
          job.status = "error";
          job.error = "Veo operation completed but returned no video";
        } else {
          const videoUrl = await this.saveVideo(sceneKey, video.bytesBase64Encoded);
          job.status = "ready";
          job.asset = { type: "video", videoUrl, audioUrl: null };
        }
      }
      // else: still processing, leave job as-is
    } catch (err) {
      job.status = "error";
      job.error = err instanceof Error ? err.message : String(err);
      console.error(`[veoProvider] getGenerationStatus(${sceneKey}) failed:`, err);
    }

    return toSceneJob(job);
  }

  async getVideo(sceneKey: string): Promise<SceneAsset | null> {
    return this.jobs.get(sceneKey)?.asset ?? null;
  }

  private async saveVideo(sceneKey: string, base64: string): Promise<string> {
    await mkdir(GENERATED_DIR, { recursive: true });
    const filename = `${sceneKey}.mp4`;
    await writeFile(path.join(GENERATED_DIR, filename), Buffer.from(base64, "base64"));
    return `/generated/${filename}`;
  }
}

function toSceneJob(job: InternalJob): SceneJob {
  return { sceneKey: job.sceneKey, status: job.status, asset: job.asset, error: job.error };
}
