import { and, asc, eq } from "drizzle-orm";
import { characterReferences, clips, stories } from "../../db/schema";
import { getDb } from "../../db";
import {
  AGE_BANDS,
  CHARACTER_PAIRS,
  CLIP_IDS,
  LANGUAGES,
  SETTINGS,
  type ClipId,
  type StoryBrief,
  type StoryPlan,
  type StoryPackage,
} from "./story";
import type { PlaybackOnlyStoryPlan } from "./story-migrations";
import { storyPackageMatchesBrief } from "./story-package-binding";
import { GoogleApiError } from "./api-error";

export type StoredClip = typeof clips.$inferSelect;
export type StoredStory = typeof stories.$inferSelect;
export type StoredCharacterReference = typeof characterReferences.$inferSelect;
export type StoryPayloadCompatibility =
  | {
      mode: "playback_only";
      sourceSchemaVersion: "1.0" | null;
      providerActionsAllowed: false;
    }
  | {
      mode: "recompile_required";
      sourceSchemaVersion: "1.0" | null;
      targetSchemaVersion: "1.1";
      providerActionsAllowed: false;
    };

const STORY_BRIEF_KEYS = ["ageBand", "characterPairId", "language", "lesson", "settingId"] as const;

function storedBriefString(value: unknown, name: string, minimum: number, maximum: number) {
  if (typeof value !== "string" || value !== value.trim() || value.length < minimum || value.length > maximum) {
    throw new GoogleApiError(`The stored story brief has an invalid ${name}.`, 422);
  }
  return value;
}

export function validateStoredStoryBrief(value: unknown): StoryBrief {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GoogleApiError("The stored story brief is invalid.", 422);
  }

  const brief = value as Record<string, unknown>;
  const keys = Object.keys(brief).sort();
  if (
    keys.length !== STORY_BRIEF_KEYS.length ||
    !STORY_BRIEF_KEYS.every((key, index) => keys[index] === key)
  ) {
    throw new GoogleApiError("The stored story brief has unexpected fields.", 422);
  }

  const result: StoryBrief = {
    lesson: storedBriefString(brief.lesson, "lesson", 8, 500),
    characterPairId: storedBriefString(brief.characterPairId, "character pair", 1, 50),
    settingId: storedBriefString(brief.settingId, "setting", 1, 50),
    ageBand: storedBriefString(brief.ageBand, "age band", 1, 20),
    language: storedBriefString(brief.language, "language", 1, 30),
  };

  if (!CHARACTER_PAIRS.some((pair) => pair.id === result.characterPairId)) {
    throw new GoogleApiError("The stored story brief has an invalid character pair.", 422);
  }
  if (!SETTINGS.some((setting) => setting.id === result.settingId)) {
    throw new GoogleApiError("The stored story brief has an invalid setting.", 422);
  }
  if (!AGE_BANDS.some((ageBand) => ageBand.id === result.ageBand)) {
    throw new GoogleApiError("The stored story brief has an invalid age band.", 422);
  }
  if (!LANGUAGES.some((language) => language.id === result.language)) {
    throw new GoogleApiError("The stored story brief has an invalid language.", 422);
  }

  return result;
}

export function parseStoredStoryBrief(briefJson: string): StoryBrief {
  let value: unknown;
  try {
    value = JSON.parse(briefJson);
  } catch {
    throw new GoogleApiError("The stored story brief could not be read.", 422);
  }
  return validateStoredStoryBrief(value);
}

export function validateStoryPackageMatchesBrief(plan: StoryPackage, brief: StoryBrief) {
  if (!storyPackageMatchesBrief(plan, brief)) {
    throw new GoogleApiError("The stored story package does not match its story brief.", 422);
  }
}

export function requestOwnerId(request: Request) {
  const ownerId = request.headers.get("oai-authenticated-user-id");
  if (ownerId) return ownerId;
  const hostname = new URL(request.url).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") return "local-preview-user";
  throw new GoogleApiError("Please sign in to use the parent story studio.", 401);
}

export async function getOwnedStory(storyId: string, ownerUserId: string) {
  const [story] = await getDb()
    .select()
    .from(stories)
    .where(and(eq(stories.id, storyId), eq(stories.ownerUserId, ownerUserId)))
    .limit(1);
  return story ?? null;
}

export async function getStoryClips(storyId: string) {
  return getDb().select().from(clips).where(eq(clips.storyId, storyId)).orderBy(asc(clips.createdAt));
}

export async function getStoryCharacterReferences(storyId: string) {
  return getDb()
    .select()
    .from(characterReferences)
    .where(eq(characterReferences.storyId, storyId))
    .orderBy(asc(characterReferences.createdAt));
}

export function storyPayload(
  story: StoredStory,
  storedClips: StoredClip[],
  options: {
    plan: StoryPlan | PlaybackOnlyStoryPlan;
    brief: StoryBrief;
    references?: StoredCharacterReference[];
    compatibility?: StoryPayloadCompatibility;
  },
) {
  const { plan, brief } = options;
  const bySlot = new Map(storedClips.map((clip) => [clip.slot, clip]));

  return {
    id: story.id,
    status: story.status,
    createdAt: story.createdAt,
    plan,
    brief,
    ...(options.compatibility ? { compatibility: options.compatibility } : {}),
    references: (options.references ?? []).map((reference) => ({
      characterId: reference.characterId,
      status: reference.status,
      error: reference.errorMessage ?? null,
      mediaUrl:
        reference.status === "ready"
          ? `/api/stories/${story.id}/references/${reference.characterId}`
          : null,
    })),
    clips: CLIP_IDS.map((slot) => {
      const clip = bySlot.get(slot);
      return {
        slot,
        status: clip?.status ?? "starting",
        extensionCount: clip?.extensionCount ?? 0,
        error: clip?.errorMessage ?? null,
        mediaUrl: clip?.status === "ready" ? `/api/stories/${story.id}/clips/${slot}` : null,
      };
    }),
  };
}

export function clipPrompt(plan: StoryPlan, slot: ClipId) {
  const clip = plan.clips.find((candidate) => candidate.id === slot);
  if (!clip) throw new Error(`Missing ${slot} prompt.`);
  return clip.prompt;
}
