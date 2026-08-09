import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChoiceImageGenerator, ChoiceImageRequest } from "../types.js";

const GENERATED_DIR = path.resolve(process.cwd(), "public", "generated");
const IMAGE_EXTENSIONS = ["png", "jpg", "webp"] as const;
const GENERATION_TIMEOUT_MS = 45_000;

interface GeminiImageResponse {
  candidates?: {
    finishReason?: string;
    content?: {
      parts?: {
        inlineData?: { mimeType?: string; data?: string };
      }[];
    };
  }[];
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string };
}

// Generates one visual "look into the future" for a moral choice with Gemini
// 3.1 Flash Image (Nano Banana 2) on Vertex AI. The response image is stored
// beside generated scene media and returned through the existing /generated
// static route.
export class VertexNanoBananaProvider implements ChoiceImageGenerator {
  readonly name = "nano-banana-2" as const;
  private endpoint: string;

  constructor(
    private apiKey: string,
    private model: string,
    projectId: string | undefined,
    location: string
  ) {
    if (projectId) {
      const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
      const modelPath = `projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}`;
      this.endpoint = `https://${host}/v1/${modelPath}:generateContent`;
    } else {
      // Vertex Express Mode authorization keys are already bound to their
      // project and use the projectless publishers.models endpoint.
      this.endpoint = `https://aiplatform.googleapis.com/v1/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
    }
  }

  async generate(request: ChoiceImageRequest): Promise<string | null> {
    const prompt = this.buildPrompt(request);
    const cacheKey = createHash("sha256").update(`${this.model}\0${prompt}`).digest("hex").slice(0, 24);
    const cachedUrl = this.findCachedImage(cacheKey);
    if (cachedUrl) return cachedUrl;

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
      signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
      body: JSON.stringify({
        contents: [{ role: "USER", parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: { aspectRatio: "4:3" },
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Nano Banana 2 generation failed: ${res.status} ${errText}`);
    }

    const body = (await res.json()) as GeminiImageResponse;
    const inline = body.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
    if (!inline?.data) {
      const reason = body.promptFeedback?.blockReasonMessage ?? body.promptFeedback?.blockReason ?? body.candidates?.[0]?.finishReason ?? "no image data";
      throw new Error(`Nano Banana 2 returned no choice image (${reason})`);
    }

    const extension = mimeTypeToExtension(inline.mimeType);
    const filename = `choice-${cacheKey}.${extension}`;
    await mkdir(GENERATED_DIR, { recursive: true });
    await writeFile(path.join(GENERATED_DIR, filename), Buffer.from(inline.data, "base64"));
    return `/generated/${filename}`;
  }

  private findCachedImage(cacheKey: string): string | null {
    for (const extension of IMAGE_EXTENSIONS) {
      const filename = `choice-${cacheKey}.${extension}`;
      if (existsSync(path.join(GENERATED_DIR, filename))) return `/generated/${filename}`;
    }
    return null;
  }

  private buildPrompt({ choice, consequence, characterBible, environment }: ChoiceImageRequest): string {
    const futureActions = consequence
      .slice(0, 2)
      .map((scene) => scene.action)
      .join("; then ");

    return `Create one clear, wordless 4:3 children's storybook illustration that acts as a magical look into the immediate future after a child chooses an action.

MAIN CHARACTER (keep this exact design): ${characterBible.species}. ${characterBible.appearance}. Clothing: ${characterBible.clothing}. Personality shown visually: ${characterBible.personality}.
SETTING: ${environment}.
THE CHOSEN ACTION: ${choice.description} (${choice.label}).
WHAT HAPPENS NEXT: ${futureActions}.
ART DIRECTION: ${characterBible.style}. Warm, colorful, expressive, cinematic composition for ages 5-10. Make the cause and immediate consequence understandable from the picture alone. Keep every outcome gentle, safe, and non-shaming. Use a single scene, not a split panel.

Absolutely no written words, letters, captions, speech bubbles, labels, UI, borders, logos, or visible watermark.`;
  }
}

function mimeTypeToExtension(mimeType?: string): (typeof IMAGE_EXTENSIONS)[number] {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}
