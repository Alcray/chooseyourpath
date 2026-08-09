"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AGE_BANDS,
  CHARACTER_PAIRS,
  CLIP_IDS,
  LANGUAGES,
  SETTINGS,
  getCharacterPair,
  getSetting,
  isStoryPackage,
  type AdventurePremise,
  type ClipId,
  type SemanticReview,
  type StoryBrief,
  type StoryPlan,
} from "./lib/story";

type StudioStage = "brief" | "blueprint" | "generating" | "player";
type PlaybackStage = "intro" | "opening" | "choice" | "positive" | "negative" | "ending" | "complete";
type JobStatus = "waiting" | "starting" | "rendering" | "extension_retry" | "extending" | "ingesting" | "ready" | "failed";
type ClipJob = { status: JobStatus; extensionCount: number; error?: string };
type JobMap = Record<ClipId, ClipJob>;
type VideoMap = Partial<Record<ClipId, string>>;
type StoryCompatibility =
  | { mode: "playback_only"; sourceSchemaVersion: "1.0" | null; providerActionsAllowed: false }
  | { mode: "recompile_required"; sourceSchemaVersion: "1.0" | null; targetSchemaVersion: "1.1"; providerActionsAllowed: false };

type ServerStory = {
  id: string;
  status: string;
  createdAt: number;
  plan: StoryPlan;
  brief: StoryBrief;
  compatibility?: StoryCompatibility;
  clips: Array<{
    slot: ClipId;
    status: "starting" | "rendering" | "extension_retry" | "extending" | "ingesting" | "ready" | "failed";
    extensionCount: number;
    error: string | null;
    mediaUrl: string | null;
  }>;
};

type SavedGeneration = {
  storyId: string;
  plan: StoryPlan;
  brief: StoryBrief;
  startedAt: number;
  status?: string;
  compatibility?: StoryCompatibility;
};

type PendingStart = {
  blueprintId: string;
  idempotencyKey: string;
};

type ApiErrorPayload = { error?: string; code?: string };

class StudioApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "StudioApiError";
    this.status = status;
    this.code = code;
  }
}

const GENERATION_STORAGE_KEY = "kindpath-generation";
const PENDING_START_STORAGE_KEY = "kindpath-pending-start";

const COMPILER_STAGES = [
  { label: "Moral policy", detail: "Interpreting the behavior and child-safety boundaries" },
  { label: "Adventure premises", detail: "Comparing three story-first ideas" },
  { label: "Story graph", detail: "Tracking characters, props, knowledge, and promises" },
  { label: "Independent review", detail: "Checking causality, pedagogy, safety, and convergence" },
  { label: "Shot manifest", detail: "Compiling eight bounded animation segments" },
] as const;

const PREMISE_FIELDS: ReadonlyArray<{ label: string; key: keyof AdventurePremise }> = [
  { label: "External goal", key: "externalGoal" },
  { label: "Meaningful relationship", key: "relationship" },
  { label: "Escalating obstacle", key: "escalatingObstacle" },
  { label: "Setup and payoff", key: "setupPayoff" },
  { label: "Constructive effort", key: "constructiveEffort" },
  { label: "Understandable temptation", key: "temptingAlternative" },
  { label: "Natural consequence", key: "naturalConsequence" },
] as const;

const SEMANTIC_SCORE_FIELDS: ReadonlyArray<{ label: string; key: keyof SemanticReview }> = [
  { label: "Story interest", key: "storyInterest" },
  { label: "Causal continuity", key: "causalContinuity" },
  { label: "Choice meaning", key: "choiceMeaning" },
  { label: "Consequence proportion", key: "consequenceProportion" },
  { label: "Repair quality", key: "repairQuality" },
  { label: "Age fit", key: "ageFit" },
  { label: "Moral clarity", key: "moralClarity" },
  { label: "Child safety", key: "childSafety" },
  { label: "Branch convergence", key: "convergence" },
] as const;

const DEFAULT_BRIEF: StoryBrief = {
  lesson: "Sharing toys when a friend comes to play",
  characterPairId: "pip-momo",
  settingId: "woodland-picnic",
  ageBand: "6-8",
  language: "Armenian",
};

const CLIP_META: Record<ClipId, { number: string; label: string; detail: string; icon: string }> = {
  opening: { number: "01", label: "Opening", detail: "Context + moral choice", icon: "▶" },
  positive: { number: "02", label: "Caring path", detail: "Positive consequence", icon: "♥" },
  negative: { number: "03", label: "Other path", detail: "Gentle correction", icon: "↯" },
  ending: { number: "04", label: "Shared ending", detail: "The lesson lands", icon: "◆" },
};

const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  waiting: "Queued",
  starting: "Starting",
  rendering: "Generating",
  extension_retry: "Retrying extension",
  extending: "Extending",
  ingesting: "Saving securely",
  ready: "Ready ✓",
  failed: "Needs retry",
};

const emptyJobs = (): JobMap => ({
  opening: { status: "waiting", extensionCount: 0 },
  positive: { status: "waiting", extensionCount: 0 },
  negative: { status: "waiting", extensionCount: 0 },
  ending: { status: "waiting", extensionCount: 0 },
});

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const currentTimestamp = () => Date.now();

function formatElapsed(seconds: number) {
  if (seconds < 60) return "less than 1 min";
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min`;
}

function clipExtensionTotal(plan: StoryPlan | null, clipId: ClipId) {
  const extensions = plan?.clips.find((clip) => clip.id === clipId)?.extensions;
  return Array.isArray(extensions) ? extensions.length : 0;
}

function clipDurationLabel(plan: StoryPlan | null, clipId: ClipId) {
  return clipExtensionTotal(plan, clipId) === 2 ? "20 sec" : "8 sec";
}

function completedGenerationUnits(plan: StoryPlan | null, clipId: ClipId, job: ClipJob) {
  const total = clipExtensionTotal(plan, clipId) + 1;
  if (job.status === "ready" || job.status === "ingesting") return total;
  if (job.status === "extending" || job.status === "extension_retry") {
    return Math.min(total, job.extensionCount + 1);
  }
  if (job.status === "rendering") return Math.min(total, job.extensionCount);
  if (job.status === "failed") return Math.min(total, job.extensionCount);
  return 0;
}

function clipProgressPercent(plan: StoryPlan | null, clipId: ClipId, job: ClipJob) {
  const total = clipExtensionTotal(plan, clipId) + 1;
  if (job.status === "ready") return 100;
  if (job.status === "ingesting") return 94;
  const completed = completedGenerationUnits(plan, clipId, job);
  if (job.status === "starting") return 6;
  if (job.status === "rendering") return Math.min(88, ((completed + 0.35) / total) * 88);
  if (job.status === "extending" || job.status === "extension_retry") {
    return Math.min(88, (completed / total) * 88);
  }
  return (completed / total) * 88;
}

function clipJobLabel(plan: StoryPlan | null, clipId: ClipId, job: ClipJob) {
  const extensionTotal = clipExtensionTotal(plan, clipId);
  if (extensionTotal !== 2) {
    if (job.status === "rendering") return "Generating 8-second scene";
    if (job.status === "ingesting") return "8 seconds generated · saving";
    if (job.status === "ready") return "8 seconds ready ✓";
    return JOB_STATUS_LABEL[job.status];
  }

  if (job.status === "starting") return "Starting 6-second base · step 1 of 3";
  if (job.status === "extending" && job.extensionCount === 0) return "6 seconds ready · starting extension 1";
  if (job.status === "extension_retry" && job.extensionCount === 0) return "6 seconds ready · retrying extension 1";
  if (job.status === "rendering" && job.extensionCount === 0) return "Generating first 6 seconds · step 1 of 3";
  if (job.status === "extending" && job.extensionCount === 1) return "13 seconds ready · starting extension 2";
  if (job.status === "extension_retry" && job.extensionCount === 1) return "13 seconds ready · retrying extension 2";
  if (job.status === "rendering" && job.extensionCount === 1) return "Extending the consequence · step 2 of 3";
  if (job.status === "rendering" && job.extensionCount === 2) return "Extending the impact · step 3 of 3";
  if (job.status === "ingesting") return "All 20 seconds generated · saving";
  if (job.status === "ready") return "20 seconds ready ✓";
  return JOB_STATUS_LABEL[job.status];
}

async function apiRequest<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & ApiErrorPayload;
  if (!response.ok || payload.error) {
    throw new StudioApiError(
      payload.error ?? "The request could not be completed.",
      response.status,
      payload.code,
    );
  }
  return payload;
}

function isStoryRecompileError(error: unknown): error is StudioApiError {
  return error instanceof StudioApiError && error.code === "STORY_RECOMPILE_REQUIRED";
}

function isBlueprintRecompileError(error: unknown): error is StudioApiError {
  return error instanceof StudioApiError && error.code === "BLUEPRINT_RECOMPILE_REQUIRED";
}

function recoverableSourceSchemaVersion(plan: StoryPlan): "1.0" | null {
  const compiler = (plan as unknown as { compiler?: { schemaVersion?: unknown } }).compiler;
  return compiler?.schemaVersion === "1.0" ? "1.0" : null;
}

function isSavedGeneration(value: unknown): value is SavedGeneration {
  const session = value as SavedGeneration;
  const now = Date.now();
  const clipIds = Array.isArray(session?.plan?.clips)
    ? session.plan.clips.map((clip) => clip?.id)
    : [];
  return Boolean(
    session &&
      typeof session.storyId === "string" &&
      /^[0-9a-f-]{36}$/i.test(session.storyId) &&
      typeof session.plan?.title === "string" &&
      typeof session.plan?.childIntro === "string" &&
      typeof session.plan?.choiceQuestion === "string" &&
      clipIds.length === CLIP_IDS.length &&
      new Set(clipIds).size === CLIP_IDS.length &&
      CLIP_IDS.every((id) => clipIds.includes(id)) &&
      typeof session.brief?.lesson === "string" &&
      typeof session.brief?.characterPairId === "string" &&
      typeof session.brief?.settingId === "string" &&
      typeof session.brief?.ageBand === "string" &&
      typeof session.brief?.language === "string" &&
      Number.isFinite(session.startedAt) &&
      session.startedAt > 0 &&
      session.startedAt <= now + 5 * 60 * 1000 &&
      now - session.startedAt < 7 * 24 * 60 * 60 * 1000,
  );
}

export function StoryStudio() {
  const [stage, setStage] = useState<StudioStage>("brief");
  const [brief, setBrief] = useState<StoryBrief>(DEFAULT_BRIEF);
  const [plan, setPlan] = useState<StoryPlan | null>(null);
  const [blueprintId, setBlueprintId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobMap>(emptyJobs);
  const [videoUrls, setVideoUrls] = useState<VideoMap>({});
  const [playback, setPlayback] = useState<PlaybackStage>("intro");
  const [chosenPath, setChosenPath] = useState<"positive" | "negative" | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [planningStageIndex, setPlanningStageIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [savedGeneration, setSavedGeneration] = useState<SavedGeneration | null>(null);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [visibleClipId, setVisibleClipId] = useState<ClipId>("opening");
  const [bufferedClips, setBufferedClips] = useState<ClipId[]>([]);
  const [pendingClipId, setPendingClipId] = useState<ClipId | null>(null);
  const [playbackStarted, setPlaybackStarted] = useState(false);
  const [playbackNeedsGesture, setPlaybackNeedsGesture] = useState(false);
  const [seamlessTransition, setSeamlessTransition] = useState(false);
  const [mediaErrors, setMediaErrors] = useState<Partial<Record<ClipId, string>>>({});
  const [sensitiveTopicAcknowledged, setSensitiveTopicAcknowledged] = useState(false);
  const [recoveryAnnouncement, setRecoveryAnnouncement] = useState("");

  const pollingRef = useRef(false);
  const pollingVersionRef = useRef(0);
  const recoveryVersionRef = useRef(0);
  const videoRefs = useRef<Partial<Record<ClipId, HTMLVideoElement | null>>>({});
  const visibleClipRef = useRef<ClipId>("opening");
  const pendingTransitionRef = useRef<ClipId | null>(null);
  const transitionAttemptRef = useRef(0);
  const transitionWatchdogRef = useRef<number | null>(null);
  const warmingClipsRef = useRef(new Set<ClipId>());
  const warmedClipsRef = useRef(new Set<ClipId>());
  const firstChoiceRef = useRef<HTMLButtonElement | null>(null);
  const completionActionRef = useRef<HTMLButtonElement | null>(null);
  const recoveryActionRef = useRef<HTMLButtonElement | null>(null);
  const recompileActionRef = useRef<HTMLButtonElement | null>(null);
  const lessonInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const recoveryVersion = ++recoveryVersionRef.current;
    const recoveryIsCurrent = () => !cancelled && recoveryVersionRef.current === recoveryVersion;

    void (async () => {
      await Promise.resolve();
      let localSaved: SavedGeneration | null = null;
      try {
        const raw = localStorage.getItem(GENERATION_STORAGE_KEY);
        const storedValue = raw ? (JSON.parse(raw) as unknown) : null;
        if (isSavedGeneration(storedValue)) {
          localSaved = storedValue;
          if (recoveryIsCurrent()) setSavedGeneration(storedValue);
        }
        if (raw && !localSaved) localStorage.removeItem(GENERATION_STORAGE_KEY);
      } catch {
        localStorage.removeItem(GENERATION_STORAGE_KEY);
      }

      try {
        const response = await fetch("/api/stories", { cache: "no-store" });
        const payload = (await response.json()) as { story?: ServerStory | null };
        if (!response.ok || !recoveryIsCurrent()) return;
        if (!payload.story) {
          if (localSaved) {
            localStorage.removeItem(GENERATION_STORAGE_KEY);
            setSavedGeneration(null);
          }
          return;
        }
        const recovered: SavedGeneration = {
          storyId: payload.story.id,
          plan: payload.story.plan,
          brief: payload.story.brief,
          startedAt: payload.story.createdAt ?? Date.now(),
          status: payload.story.status,
          compatibility: payload.story.compatibility,
        };
        if (!recoveryIsCurrent()) return;
        localStorage.setItem(GENERATION_STORAGE_KEY, JSON.stringify(recovered));
        setSavedGeneration(recovered);
      } catch {
        // Local state remains usable if the server-side history check is unavailable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (stage !== "generating" || generationStartedAt === null) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - generationStartedAt) / 1000)));
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [generationStartedAt, stage]);

  useEffect(() => {
    if (!isPlanning) return;
    const timer = window.setInterval(() => {
      setPlanningStageIndex((current) => Math.min(COMPILER_STAGES.length - 1, current + 1));
    }, 4_500);
    return () => window.clearInterval(timer);
  }, [isPlanning]);

  useEffect(() => {
    if (playbackNeedsGesture) recoveryActionRef.current?.focus();
    else if (playback === "choice") firstChoiceRef.current?.focus();
    else if (playback === "complete") completionActionRef.current?.focus();
  }, [playback, playbackNeedsGesture]);

  useEffect(() => {
    if (stage === "brief" && savedGeneration?.compatibility?.mode === "recompile_required") {
      recompileActionRef.current?.focus();
    }
  }, [savedGeneration?.compatibility?.mode, stage]);

  const currentStep = { brief: 1, blueprint: 2, generating: 3, player: 4 }[stage];
  const selectedPair = getCharacterPair(brief.characterPairId);
  const selectedSetting = getSetting(brief.settingId);
  const compiledPackage = plan && isStoryPackage(plan) ? plan : null;
  const selectedPremise = compiledPackage?.premiseCandidates.find(
    (premise) => premise.id === compiledPackage.selectedPremiseId,
  );
  const validationPassed = compiledPackage?.validation.checks.filter((entry) => entry.passed).length ?? 0;
  const semanticAverage = compiledPackage
    ? Math.round(([
        compiledPackage.validation.semanticReview.storyInterest,
        compiledPackage.validation.semanticReview.causalContinuity,
        compiledPackage.validation.semanticReview.choiceMeaning,
        compiledPackage.validation.semanticReview.consequenceProportion,
        compiledPackage.validation.semanticReview.repairQuality,
        compiledPackage.validation.semanticReview.ageFit,
        compiledPackage.validation.semanticReview.moralClarity,
        compiledPackage.validation.semanticReview.childSafety,
        compiledPackage.validation.semanticReview.convergence,
      ].reduce((sum, score) => sum + score, 0) / 45) * 100)
    : 0;
  const readyCount = CLIP_IDS.filter((id) => jobs[id].status === "ready").length;
  const failedCount = CLIP_IDS.filter((id) => jobs[id].status === "failed").length;
  const activeCount = CLIP_IDS.filter((id) => ["starting", "rendering", "extension_retry", "extending", "ingesting"].includes(jobs[id].status)).length;
  const queuedCount = CLIP_IDS.filter((id) => jobs[id].status === "waiting").length;
  const stillWorkingCount = activeCount + queuedCount;
  const progressMessage =
    failedCount > 0
      ? `${failedCount} clip${failedCount === 1 ? " needs" : "s need"} another try; completed clips are safe.`
      : readyCount > 0 && stillWorkingCount > 0
        ? `${readyCount} clip${readyCount === 1 ? " is" : "s are"} safely stored; ${stillWorkingCount} still working.`
        : activeCount > 0 && elapsedSeconds >= 60
          ? "Video rendering is usually the longest step. Each clip finishes independently."
          : "Starting and checking every generation stage.";
  const totalGenerationUnits = CLIP_IDS.reduce((total, id) => total + clipExtensionTotal(plan, id) + 1, 0);
  const finishedGenerationUnits = CLIP_IDS.reduce(
    (total, id) => total + completedGenerationUnits(plan, id, jobs[id]),
    0,
  );
  const generationProgressPercent = totalGenerationUnits > 0
    ? Math.round((finishedGenerationUnits / totalGenerationUnits) * 100)
    : 0;
  const generationPlaybackMediaReady = CLIP_IDS.every((clipId) => Boolean(videoUrls[clipId]));
  const generationPlaybackMediaIncomplete = readyCount === CLIP_IDS.length && !generationPlaybackMediaReady;
  const playbackBufferReady = bufferedClips.length === CLIP_IDS.length;
  const playbackStartAvailable = Boolean(videoUrls.opening);
  const storyLanguage = brief.language === "Armenian" ? "hy" : "en";
  const failedMediaClip = CLIP_IDS.find((clipId) => mediaErrors[clipId]);
  const preStartTransitionPaused = !playbackStarted && pendingClipId !== null && playbackNeedsGesture;

  const clipById = useMemo(() => {
    return new Map((plan?.clips ?? []).map((clip) => [clip.id, clip]));
  }, [plan]);

  function captionUrlFor(clipId: ClipId) {
    const clip = clipById.get(clipId);
    const branchCaption = clipId === "ending" && chosenPath
      ? clip?.branchNarration?.[chosenPath]
      : undefined;
    const baseCaption = branchCaption ?? clip?.caption ?? clip?.summary ?? "Story narration";
    const extensions = Array.isArray(clip?.extensions) ? clip.extensions : [];
    const cleanCaption = (caption: string) => caption
      .replace(/\r/g, "")
      .replace(/\n[ \t]*\n+/g, "\n")
      .replace(/-->/g, "→")
      .trim();
    const cues = extensions.length === 2
      ? [
          `00:00:00.000 --> 00:00:06.000\n${cleanCaption(baseCaption)}`,
          `00:00:06.000 --> 00:00:13.000\n${cleanCaption(extensions[0].caption)}`,
          `00:00:13.000 --> 00:00:20.000\n${cleanCaption(extensions[1].caption)}`,
        ]
      : [`00:00:00.000 --> 00:00:08.000\n${cleanCaption(baseCaption)}`];
    return `data:text/vtt;charset=utf-8,${encodeURIComponent(
      `WEBVTT\n\n${cues.join("\n\n")}`,
    )}`;
  }

  function markClipBuffered(clipId: ClipId) {
    setBufferedClips((current) => current.includes(clipId) ? current : [...current, clipId]);
  }

  function updateClipBuffer(clipId: ClipId) {
    const video = videoRefs.current[clipId];
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0 || video.buffered.length === 0) return;
    const bufferedEnd = video.buffered.end(video.buffered.length - 1);
    if (bufferedEnd >= video.duration - 0.25) markClipBuffered(clipId);
  }

  function clearTransitionWatchdog() {
    if (transitionWatchdogRef.current === null) return;
    window.clearTimeout(transitionWatchdogRef.current);
    transitionWatchdogRef.current = null;
  }

  function handleMediaError(clipId: ClipId) {
    videoRefs.current[clipId]?.pause();
    warmingClipsRef.current.delete(clipId);
    warmedClipsRef.current.delete(clipId);
    setBufferedClips((current) => current.filter((id) => id !== clipId));
    setMediaErrors((current) => ({ ...current, [clipId]: "This scene could not be preloaded." }));
    if (pendingTransitionRef.current === clipId || (playbackStarted && visibleClipRef.current === clipId)) {
      pendingTransitionRef.current = clipId;
      setPendingClipId(clipId);
      clearTransitionWatchdog();
      setPlaybackNeedsGesture(true);
    }
  }

  function retryMediaClip(clipId: ClipId) {
    const video = videoRefs.current[clipId];
    if (!video) return;
    setMediaErrors((current) => {
      const next = { ...current };
      delete next[clipId];
      return next;
    });
    video.load();
  }

  function retryFailedMedia(clipId: ClipId) {
    retryMediaClip(clipId);
    if (pendingTransitionRef.current === clipId) playClip(clipId, true);
  }

  function warmClip(clipId: ClipId) {
    const video = videoRefs.current[clipId];
    if (!video || warmedClipsRef.current.has(clipId) || warmingClipsRef.current.has(clipId)) return;
    warmingClipsRef.current.add(clipId);
    video.muted = true;
    try {
      video.currentTime = 0;
      void video.play().catch(() => {
        if (!warmingClipsRef.current.delete(clipId)) return;
        video.muted = false;
        video.load();
      });
    } catch {
      if (!warmingClipsRef.current.delete(clipId)) return;
      video.muted = false;
      video.load();
    }
  }

  function resetPlaybackState() {
    for (const video of Object.values(videoRefs.current)) {
      if (!video) continue;
      video.pause();
      video.muted = false;
      try {
        video.currentTime = 0;
      } catch {
        // A video without metadata will already begin at zero once it loads.
      }
    }
    pendingTransitionRef.current = null;
    warmingClipsRef.current.clear();
    warmedClipsRef.current.clear();
    transitionAttemptRef.current += 1;
    clearTransitionWatchdog();
    visibleClipRef.current = "opening";
    setVisibleClipId("opening");
    setBufferedClips([]);
    setPendingClipId(null);
    setPlaybackStarted(false);
    setPlaybackNeedsGesture(false);
    setSeamlessTransition(false);
    setMediaErrors({});
    setPlayback("intro");
    setChosenPath(null);
  }

  function playClip(clipId: ClipId, retry = false) {
    const video = videoRefs.current[clipId];
    if (!video) return;

    const previousPendingClip = pendingTransitionRef.current;
    if (previousPendingClip && !retry) return;
    if (previousPendingClip && previousPendingClip !== clipId) {
      videoRefs.current[previousPendingClip]?.pause();
    }
    clearTransitionWatchdog();
    const transitionAttempt = ++transitionAttemptRef.current;
    const wasWarming = warmingClipsRef.current.delete(clipId);
    const isWarmed = warmedClipsRef.current.delete(clipId);
    pendingTransitionRef.current = clipId;
    setPendingClipId(clipId);
    setPlaybackNeedsGesture(false);
    setSeamlessTransition(isWarmed);
    if (!wasWarming) video.pause();
    video.muted = false;
    try {
      video.currentTime = 0;
    } catch {
      // play() will wait for metadata if this clip is still finishing its preload.
    }

    if (isWarmed) {
      const previousClipId = visibleClipRef.current;
      visibleClipRef.current = clipId;
      setVisibleClipId(clipId);
      setPlayback(clipId);
      if (previousClipId !== clipId) videoRefs.current[previousClipId]?.pause();
    }

    try {
      void video.play().catch(() => {
        if (transitionAttemptRef.current === transitionAttempt && pendingTransitionRef.current === clipId) {
          setPlaybackNeedsGesture(true);
        }
      });
    } catch {
      setPlaybackNeedsGesture(true);
    }

    transitionWatchdogRef.current = window.setTimeout(() => {
      if (transitionAttemptRef.current === transitionAttempt && pendingTransitionRef.current === clipId) {
        setPlaybackNeedsGesture(true);
      }
    }, 8_000);
  }

  function handleClipPlaying(clipId: ClipId) {
    if (warmingClipsRef.current.has(clipId)) {
      const video = videoRefs.current[clipId];
      warmingClipsRef.current.delete(clipId);
      warmedClipsRef.current.add(clipId);
      video?.pause();
      if (video) {
        try {
          video.currentTime = 0;
        } catch {
          // The first decoded frame is already retained for the later handoff.
        }
        video.muted = false;
      }
      markClipBuffered(clipId);
      return;
    }

    const isActiveVisibleResume =
      pendingTransitionRef.current === null &&
      visibleClipRef.current === clipId &&
      playbackStarted &&
      playback === clipId;

    if (isActiveVisibleResume) return;

    if (pendingTransitionRef.current !== clipId) {
      videoRefs.current[clipId]?.pause();
      return;
    }

    const previousClipId = visibleClipRef.current;
    transitionAttemptRef.current += 1;
    clearTransitionWatchdog();
    pendingTransitionRef.current = null;
    visibleClipRef.current = clipId;
    setVisibleClipId(clipId);
    setPendingClipId(null);
    setPlaybackNeedsGesture(false);
    setSeamlessTransition(false);
    setPlaybackStarted(true);
    setPlayback(clipId);

    if (previousClipId !== clipId) videoRefs.current[previousClipId]?.pause();
    if (clipId === "opening") {
      warmClip("positive");
      warmClip("negative");
    }
  }

  function handleClipEnded(clipId: ClipId) {
    if (visibleClipRef.current !== clipId) return;
    if (clipId === "opening") setPlayback("choice");
    else if (clipId === "positive" || clipId === "negative") playClip("ending");
    else setPlayback("complete");
  }

  function startPlayback() {
    if (!playbackStartAvailable) return;
    for (const video of Object.values(videoRefs.current)) {
      if (video && video.readyState === HTMLMediaElement.HAVE_NOTHING) video.load();
    }
    playClip("opening");
  }

  function continuePlayback() {
    const target = pendingTransitionRef.current ?? pendingClipId;
    if (!target) return;
    if (mediaErrors[target]) retryMediaClip(target);
    playClip(target, true);
  }

  function restartPlayback() {
    for (const video of Object.values(videoRefs.current)) {
      if (!video) continue;
      video.pause();
      video.muted = false;
      try {
        video.currentTime = 0;
      } catch {
        // The already-buffered video will restart as soon as it can play.
      }
    }
    pendingTransitionRef.current = null;
    warmingClipsRef.current.clear();
    warmedClipsRef.current.clear();
    clearTransitionWatchdog();
    visibleClipRef.current = "opening";
    setVisibleClipId("opening");
    setPendingClipId(null);
    setPlaybackNeedsGesture(false);
    setSeamlessTransition(false);
    setPlayback("opening");
    setChosenPath(null);
    playClip("opening");
  }

  function invalidateInitialRecovery() {
    recoveryVersionRef.current += 1;
  }

  function transitionToRecompileRequired(
    storyId: string,
    planValue: StoryPlan,
    briefValue: StoryBrief,
    startedAt: number,
    message: string,
  ) {
    invalidateInitialRecovery();
    const saved: SavedGeneration = {
      storyId,
      plan: planValue,
      brief: briefValue,
      startedAt,
      status: "recompile_required",
      compatibility: {
        mode: "recompile_required",
        sourceSchemaVersion: recoverableSourceSchemaVersion(planValue),
        targetSchemaVersion: "1.1",
        providerActionsAllowed: false,
      },
    };
    localStorage.setItem(GENERATION_STORAGE_KEY, JSON.stringify(saved));
    setSavedGeneration(saved);
    setBrief(briefValue);
    setPlan(null);
    setBlueprintId(null);
    setVideoUrls({});
    setJobs(emptyJobs());
    setError("");
    setIsGenerating(false);
    setRecoveryAnnouncement(message);
    setStage("brief");
  }

  function updateBrief<K extends keyof StoryBrief>(key: K, value: StoryBrief[K]) {
    setBrief((current) => ({ ...current, [key]: value }));
  }

  function persistGeneration(
    storyId: string,
    planValue: StoryPlan,
    briefValue: StoryBrief,
    startedAt: number,
    status?: string,
    compatibility?: StoryCompatibility,
  ) {
    const saved: SavedGeneration = {
      storyId,
      plan: planValue,
      brief: briefValue,
      startedAt,
      ...(status ? { status } : {}),
      ...(compatibility ? { compatibility } : {}),
    };
    localStorage.setItem(GENERATION_STORAGE_KEY, JSON.stringify(saved));
    setSavedGeneration(saved);
  }

  function pendingStartKey(blueprint: string) {
    try {
      const raw = localStorage.getItem(PENDING_START_STORAGE_KEY);
      const pending = raw ? (JSON.parse(raw) as PendingStart) : null;
      if (pending?.blueprintId === blueprint && pending.idempotencyKey) return pending.idempotencyKey;
    } catch {
      localStorage.removeItem(PENDING_START_STORAGE_KEY);
    }
    const idempotencyKey = crypto.randomUUID();
    localStorage.setItem(PENDING_START_STORAGE_KEY, JSON.stringify({ blueprintId: blueprint, idempotencyKey } satisfies PendingStart));
    return idempotencyKey;
  }

  function applyServerStory(serverStory: ServerStory) {
    const nextJobs = emptyJobs();
    const nextUrls: VideoMap = {};
    for (const clip of serverStory.clips) {
      nextJobs[clip.slot] = {
        status: clip.status,
        extensionCount: clip.extensionCount ?? 0,
        error: clip.error ?? undefined,
      };
      if (clip.mediaUrl) nextUrls[clip.slot] = clip.mediaUrl;
    }
    setJobs(nextJobs);
    setVideoUrls(nextUrls);
  }

  async function createBlueprint(event: FormEvent) {
    event.preventDefault();
    invalidateInitialRecovery();
    setError("");
    setRecoveryAnnouncement("");
    setIsPlanning(true);
    setPlanningStageIndex(0);
    setVideoUrls({});
    try {
      const result = await apiRequest<{ blueprintId: string; plan: StoryPlan }>("/api/plan", brief);
      setPlan(result.plan);
      setBlueprintId(result.blueprintId);
      localStorage.removeItem(PENDING_START_STORAGE_KEY);
      setJobs(emptyJobs());
      setPlayback("intro");
      setChosenPath(null);
      setSensitiveTopicAcknowledged(false);
      setStage("blueprint");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The blueprint could not be created.");
    } finally {
      setIsPlanning(false);
    }
  }

  async function pollStory(storyId: string, planValue: StoryPlan, briefValue: StoryBrief, startedAt: number) {
    if (pollingRef.current) return;
    invalidateInitialRecovery();
    pollingRef.current = true;
    const pollingVersion = ++pollingVersionRef.current;
    setError("");
    setStage("generating");
    setIsGenerating(true);
    setGenerationStartedAt(startedAt);
    setElapsedSeconds(Math.max(0, Math.floor((currentTimestamp() - startedAt) / 1000)));
    persistGeneration(storyId, planValue, briefValue, startedAt);

    let previousReady = 0;
    let consecutiveRefreshErrors = 0;

    try {
      for (let attempt = 0; attempt < 300; attempt += 1) {
        let payload: { story?: ServerStory; error?: string; code?: string };
        try {
          const response = await fetch(`/api/stories/${storyId}`, { cache: "no-store" });
          if (pollingVersionRef.current !== pollingVersion) return;
          payload = (await response.json()) as { story?: ServerStory; error?: string; code?: string };
          if (!response.ok || !payload.story) {
            throw new StudioApiError(
              payload.error ?? "Story status is unavailable.",
              response.status,
              payload.code,
            );
          }
          consecutiveRefreshErrors = 0;
          setError("");
        } catch (refreshError) {
          if (isStoryRecompileError(refreshError)) {
            transitionToRecompileRequired(
              storyId,
              planValue,
              briefValue,
              startedAt,
              refreshError.message,
            );
            return;
          }
          consecutiveRefreshErrors += 1;
          if (consecutiveRefreshErrors >= 5) throw refreshError;
          setError("The status connection paused briefly. Retrying automatically…");
          await wait(Math.min(5_000, 1_500 * consecutiveRefreshErrors));
          continue;
        }

        applyServerStory(payload.story);
        setPlan(payload.story.plan);
        setBrief(payload.story.brief);
        persistGeneration(
          storyId,
          payload.story.plan,
          payload.story.brief,
          startedAt,
          payload.story.status,
          payload.story.compatibility,
        );
        const ready = payload.story.clips.filter((clip) => clip.status === "ready").length;
        const playableSlots = new Set(
          payload.story.clips
            .filter((clip) => clip.status === "ready" && typeof clip.mediaUrl === "string" && clip.mediaUrl.length > 0)
            .map((clip) => clip.slot),
        );
        const allPlaybackMediaReady = CLIP_IDS.every((clipId) => playableSlots.has(clipId));
        const active = payload.story.clips.filter((clip) =>
          clip.status === "starting" || clip.status === "rendering" || clip.status === "extension_retry" || clip.status === "extending" || clip.status === "ingesting"
        ).length;
        const failed = payload.story.clips.filter((clip) => clip.status === "failed").length;

        if (ready === 4 && allPlaybackMediaReady) {
          localStorage.removeItem(GENERATION_STORAGE_KEY);
          setSavedGeneration(null);
          resetPlaybackState();
          setStage("player");
          return;
        }
        if (ready === 4) {
          setError("All four clips finished, but one or more media files are not available for playback yet.");
          await wait(3_000);
          continue;
        }
        if (active === 0 && failed > 0) {
          setError(`${failed} clip${failed === 1 ? "" : "s"} need another try. Finished clips are safely stored.`);
          return;
        }
        const nextDelay = ready > previousReady ? 750 : 3_000;
        previousReady = ready;
        await wait(nextDelay);
        if (pollingVersionRef.current !== pollingVersion) return;
      }
      setError("Generation is still running. You can leave and resume this story later.");
    } catch (pollError) {
      setError(pollError instanceof Error ? pollError.message : "Story status could not be refreshed.");
    } finally {
      if (pollingVersionRef.current === pollingVersion) {
        pollingRef.current = false;
        setIsGenerating(false);
      }
    }
  }

  async function startGeneration(planValue: StoryPlan, briefValue: StoryBrief, approvedBlueprintId: string) {
    invalidateInitialRecovery();
    const requestedAt = currentTimestamp();
    setError("");
    setStage("generating");
    setIsGenerating(true);
    setGenerationStartedAt(requestedAt);
    setElapsedSeconds(0);
    setJobs({
      opening: { status: "starting", extensionCount: 0 },
      positive: { status: "starting", extensionCount: 0 },
      negative: { status: "starting", extensionCount: 0 },
      ending: { status: "starting", extensionCount: 0 },
    });

    try {
      const result = await apiRequest<{ story: ServerStory }>("/api/stories", {
        blueprintId: approvedBlueprintId,
        idempotencyKey: pendingStartKey(approvedBlueprintId),
        sensitiveTopicAcknowledged:
          planValue.moralSpec?.policyDecision === "REQUIRE_PARENT_REVIEW"
            ? sensitiveTopicAcknowledged
            : false,
      });
      applyServerStory(result.story);
      setPlan(result.story.plan);
      const startedAt = result.story.createdAt ?? requestedAt;
      await pollStory(result.story.id, result.story.plan, briefValue, startedAt);
    } catch (startError) {
      if (isBlueprintRecompileError(startError)) {
        setBrief(briefValue);
        setPlan(null);
        setBlueprintId(null);
        setVideoUrls({});
        setJobs(emptyJobs());
        setError("");
        setIsGenerating(false);
        setRecoveryAnnouncement(`${startError.message} The story brief is preserved so you can compile it again.`);
        setStage("brief");
        window.requestAnimationFrame(() => lessonInputRef.current?.focus());
        return;
      }
      setError(startError instanceof Error ? startError.message : "The video jobs could not be started.");
      setIsGenerating(false);
      setStage("blueprint");
    }
  }

  function resumePreviousGeneration() {
    if (!savedGeneration) return;
    invalidateInitialRecovery();
    setBrief(savedGeneration.brief);
    setPlan(savedGeneration.plan);
    setJobs(emptyJobs());
    setError("");
    void pollStory(savedGeneration.storyId, savedGeneration.plan, savedGeneration.brief, savedGeneration.startedAt);
  }

  function prepareLegacyRecompile() {
    if (!savedGeneration) return;
    invalidateInitialRecovery();
    pollingVersionRef.current += 1;
    pollingRef.current = false;
    setBrief(savedGeneration.brief);
    localStorage.removeItem(GENERATION_STORAGE_KEY);
    setSavedGeneration(null);
    setPlan(null);
    setBlueprintId(null);
    setError("");
    setVideoUrls({});
    setJobs(emptyJobs());
    setIsGenerating(false);
    setRecoveryAnnouncement("The older story brief is restored and ready to edit before you create a new blueprint.");
    setStage("brief");
    window.requestAnimationFrame(() => lessonInputRef.current?.focus());
  }

  async function retryGeneration() {
    if (!savedGeneration || !plan) return;
    setError("");
    setIsGenerating(true);
    try {
      await apiRequest(`/api/stories/${savedGeneration.storyId}/retry`, {});
      setIsGenerating(false);
      await pollStory(savedGeneration.storyId, plan, brief, savedGeneration.startedAt);
    } catch (retryError) {
      if (isStoryRecompileError(retryError)) {
        transitionToRecompileRequired(
          savedGeneration.storyId,
          savedGeneration.plan,
          savedGeneration.brief,
          savedGeneration.startedAt,
          retryError.message,
        );
        return;
      }
      setError(retryError instanceof Error ? retryError.message : "The unfinished clips could not be restarted.");
      setIsGenerating(false);
    }
  }

  function refreshGenerationStatus() {
    if (!savedGeneration || !plan) return;
    void pollStory(savedGeneration.storyId, plan, brief, savedGeneration.startedAt);
  }

  function resetStudio() {
    invalidateInitialRecovery();
    pollingVersionRef.current += 1;
    pollingRef.current = false;
    resetPlaybackState();
    setVideoUrls({});
    localStorage.removeItem(GENERATION_STORAGE_KEY);
    localStorage.removeItem(PENDING_START_STORAGE_KEY);
    setSavedGeneration(null);
    setPlan(null);
    setBlueprintId(null);
    setJobs(emptyJobs());
    setError("");
    setIsGenerating(false);
    setGenerationStartedAt(null);
    setElapsedSeconds(0);
    setSensitiveTopicAcknowledged(false);
    setRecoveryAnnouncement("");
    setStage("brief");
  }

  function chooseBranch(path: "positive" | "negative") {
    if (pendingTransitionRef.current) return;
    setChosenPath(path);
    playClip(path);
    warmClip("ending");
  }

  return (
    <main className="studio-shell">
      <header className="topbar">
        <a className="studio-brand" href="#top" aria-label="KindPath Studio home">
          <span className="studio-logo" aria-hidden="true">K</span>
          <span><strong>KindPath</strong><small>Story Studio</small></span>
        </a>
        <div className="privacy-pill"><span aria-hidden="true">●</span> Private parent workspace</div>
      </header>

      <div className="studio-main" id="top">
        <nav className="studio-steps" aria-label="Story creation progress">
          {["Brief", "Blueprint", "Generate", "Preview"].map((label, index) => {
            const step = index + 1;
            const state = step < currentStep ? "complete" : step === currentStep ? "current" : "upcoming";
            return (
              <div className={`studio-step ${state}`} key={label} aria-current={state === "current" ? "step" : undefined}>
                <span>{state === "complete" ? "✓" : step}</span>
                <div><strong>{label}</strong><small>{["Set the lesson", "Lock continuity", "Render 4 clips", "Try both paths"][index]}</small></div>
              </div>
            );
          })}
        </nav>

        {savedGeneration && stage === "brief" && (
          <aside
            className="resume-banner"
            role="status"
            aria-live="polite"
            aria-labelledby="saved-story-status-title"
          >
            <div>
              <span aria-hidden="true">↻</span>
              <p>
                <strong id="saved-story-status-title">
                  {savedGeneration.compatibility?.mode === "playback_only"
                    ? "A completed story is ready"
                    : savedGeneration.compatibility?.mode === "recompile_required"
                      ? "An older story needs rebuilding"
                      : "A story is waiting for you"}
                </strong>
                <small lang={savedGeneration.brief.language === "Armenian" ? "hy" : "en"}>{savedGeneration.plan.title}</small>
              </p>
            </div>
            {savedGeneration.compatibility?.mode === "recompile_required" ? (
              <button ref={recompileActionRef} type="button" onClick={prepareLegacyRecompile}>Use this brief again</button>
            ) : (
              <button type="button" onClick={resumePreviousGeneration}>
                {savedGeneration.compatibility?.mode === "playback_only" || savedGeneration.status === "ready"
                  ? "Play story"
                  : "Resume generation"}
              </button>
            )}
          </aside>
        )}

        {stage === "brief" && (
          <section className="brief-view">
            <div className="brief-intro">
              <span className="section-kicker">Parent story builder</span>
              <h1>Turn one lesson into a story your child can choose.</h1>
              <p>
                Pick a consistent cast, describe the idea, and KindPath builds four connected clips with one meaningful decision.
              </p>
              <div className="branch-explainer" aria-label="Four clip story flow">
                <div className="flow-card opening"><span>01</span><strong>Beginning</strong><small>Context + choice</small></div>
                <div className="flow-fork" aria-hidden="true"><i /><i /></div>
                <div className="flow-branches">
                  <div className="flow-card caring"><span>02</span><strong>Caring choice</strong></div>
                  <div className="flow-card learning"><span>03</span><strong>Learning choice</strong></div>
                </div>
                <div className="flow-join" aria-hidden="true"><i /><i /></div>
                <div className="flow-card ending"><span>04</span><strong>Shared ending</strong><small>The moral lands</small></div>
              </div>
              <div className="system-note">
                <strong>Continuity is locked before rendering.</strong>
                <span>Characters, clothing, location, art style, narrator, and one shared seed repeat in every prompt.</span>
              </div>
            </div>

            <form className="brief-form" onSubmit={createBlueprint}>
              <div className="form-heading"><span>01</span><div><h2>Build the story brief</h2><p>About one minute. You can review before video credits are used.</p></div></div>

              <fieldset>
                <legend>Choose the main characters</legend>
                <div className="character-grid">
                  {CHARACTER_PAIRS.map((pair) => (
                    <button
                      className={`character-option ${brief.characterPairId === pair.id ? "selected" : ""}`}
                      type="button"
                      key={pair.id}
                      aria-pressed={brief.characterPairId === pair.id}
                      onClick={() => updateBrief("characterPairId", pair.id)}
                    >
                      <span className="character-emoji" aria-hidden="true">{pair.emoji}</span>
                      <span><strong>{pair.names}</strong><small>{pair.tagline}</small></span>
                      <i aria-hidden="true">✓</i>
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="field-label" htmlFor="lesson">What should your child learn?</label>
              <textarea
                ref={lessonInputRef}
                id="lesson"
                value={brief.lesson}
                minLength={8}
                maxLength={500}
                required
                onChange={(event) => updateBrief("lesson", event.target.value)}
                placeholder="Example: Sharing toys can make playtime better for everyone"
              />
              <div className="example-row" aria-label="Lesson examples">
                <span>Try:</span>
                {["telling the truth after a mistake", "welcoming someone new", "taking turns patiently"].map((example) => (
                  <button type="button" key={example} onClick={() => updateBrief("lesson", example)}>{example}</button>
                ))}
              </div>

              <div className="form-row">
                <label><span>Age</span><select value={brief.ageBand} onChange={(event) => updateBrief("ageBand", event.target.value)}>{AGE_BANDS.map((age) => <option value={age.id} key={age.id}>{age.label}</option>)}</select></label>
                <label><span>Story language</span><select value={brief.language} onChange={(event) => updateBrief("language", event.target.value)}>{LANGUAGES.map((language) => <option value={language.id} key={language.id}>{language.local}</option>)}</select></label>
              </div>

              <label className="field-label" htmlFor="setting">World</label>
              <select id="setting" value={brief.settingId} onChange={(event) => updateBrief("settingId", event.target.value)}>
                {SETTINGS.map((setting) => <option value={setting.id} key={setting.id}>{setting.emoji} {setting.name}</option>)}
              </select>

              {error && <p className="form-error" role="alert">{error}</p>}
              {recoveryAnnouncement && (
                <p className="action-note" role="status" aria-live="polite">{recoveryAnnouncement}</p>
              )}
              <button className="main-action" disabled={isPlanning} type="submit">
                {isPlanning ? <><span className="spinner" /> Compiling the story…</> : <>Create story blueprint <span>→</span></>}
              </button>
              {isPlanning && (
                <div className="compiler-progress" aria-live="polite">
                  <div className="compiler-progress-copy">
                    <strong>{COMPILER_STAGES[planningStageIndex].label}</strong>
                    <span>{COMPILER_STAGES[planningStageIndex].detail}</span>
                  </div>
                  <div
                    className="compiler-progress-line"
                    role="progressbar"
                    aria-label="Story compiler progress"
                    aria-valuemin={1}
                    aria-valuemax={COMPILER_STAGES.length}
                    aria-valuenow={planningStageIndex + 1}
                  >
                    <i style={{ width: `${((planningStageIndex + 1) / COMPILER_STAGES.length) * 100}%` }} />
                  </div>
                  <ol>
                    {COMPILER_STAGES.map((compilerStage, index) => (
                      <li className={index < planningStageIndex ? "done" : index === planningStageIndex ? "active" : ""} key={compilerStage.label}>
                        <span>{index < planningStageIndex ? "✓" : index + 1}</span>{compilerStage.label}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <p className="action-note">Blueprinting uses text generation only. You approve the story before four video renders begin.</p>
            </form>
          </section>
        )}

        {stage === "blueprint" && plan && (
          <section className="blueprint-view">
            <div className="view-heading">
              <div><span className="section-kicker">Continuity-locked blueprint</span><h1 lang={storyLanguage}>{plan.title}</h1><p lang={storyLanguage}>{plan.parentSummary}</p></div>
              <button className="quiet-button" type="button" onClick={() => setStage("brief")}>← Edit brief</button>
            </div>

            <div className="blueprint-grid">
              <div className="blueprint-main">
                {compiledPackage && selectedPremise && (
                  <article className="compiler-summary">
                    <div className="compiler-summary-heading">
                      <span className={`policy-badge ${compiledPackage.moralSpec.policyDecision.toLowerCase()}`}>{compiledPackage.moralSpec.policyDecision.replaceAll("_", " ")}</span>
                      <span>Compiler v{compiledPackage.compiler.schemaVersion} · {compiledPackage.compiler.model}</span>
                    </div>
                    <span className="card-label">Selected adventure premise</span>
                    <h2 lang={storyLanguage}>{selectedPremise.title}</h2>
                    <p lang={storyLanguage}>{selectedPremise.logline}</p>
                    <dl>
                      <div><dt>External goal</dt><dd lang={storyLanguage}>{selectedPremise.externalGoal}</dd></div>
                      <div><dt>Why this framing</dt><dd lang={storyLanguage}>{compiledPackage.moralSpec.policyReason}</dd></div>
                      {compiledPackage.moralSpec.policyDecision === "TRANSFORM" && <div><dt>Compiled lesson</dt><dd lang={storyLanguage}>{compiledPackage.moralSpec.compiledLesson}</dd></div>}
                    </dl>
                    <div className="compiler-metrics">
                      <span><strong>{selectedPremise.storynessScore}</strong> storyness</span>
                      <span><strong>{validationPassed}/{compiledPackage.validation.checks.length}</strong> checks passed</span>
                      <span><strong>{semanticAverage}%</strong> editor score</span>
                    </div>
                    <details className="compiler-evidence" open>
                      <summary>Review all compiler evidence</summary>
                      <div className="premise-evidence">
                        {compiledPackage.premiseCandidates.map((premise) => {
                          const evaluation = compiledPackage.premiseSelection.evaluations.find((entry) => entry.premiseId === premise.id);
                          return (
                            <article className="premise-review-card" key={premise.id}>
                              <div><strong lang={storyLanguage}>{premise.title}</strong><span>{premise.storynessScore}/100 · {evaluation?.passed ? "Passed" : "Needs revision"}</span></div>
                              <p lang={storyLanguage}>{premise.logline}</p>
                              <dl>
                                {PREMISE_FIELDS.map((field) => (
                                  <div key={field.key}><dt>{field.label}</dt><dd lang={storyLanguage}>{premise[field.key]}</dd></div>
                                ))}
                              </dl>
                              <small lang={storyLanguage}>{evaluation?.reason}</small>
                            </article>
                          );
                        })}
                      </div>
                      <section className="semantic-review" aria-labelledby="semantic-review-heading">
                        <div><strong id="semantic-review-heading">Independent semantic review</strong><span>Each release score must be at least 3 of 5.</span></div>
                        <dl>
                          {SEMANTIC_SCORE_FIELDS.map((field) => (
                            <div key={field.key}><dt>{field.label}</dt><dd>{String(compiledPackage.validation.semanticReview[field.key])} / 5</dd></div>
                          ))}
                        </dl>
                      </section>
                      <div className="check-evidence">
                        {compiledPackage.validation.checks.map((entry) => <span key={entry.id}>✓ {entry.label}</span>)}
                      </div>
                    </details>
                  </article>
                )}
                <article className="choice-preview">
                  <span className="card-label">The child will decide</span>
                  <p className="child-intro" lang={storyLanguage}>{plan.childIntro}</p>
                  <h2 lang={storyLanguage}>{plan.choiceQuestion}</h2>
                  <div className="preview-choices">
                    <div className="good"><span>♥</span><p lang={storyLanguage}><strong>{plan.positiveChoice.label}</strong><small>{plan.positiveChoice.explanation}</small></p></div>
                    <div className="other"><span>?</span><p lang={storyLanguage}><strong>{plan.negativeChoice.label}</strong><small>{plan.negativeChoice.explanation}</small></p></div>
                  </div>
                </article>

                <div className="clip-blueprints">
                  {plan.clips.map((clip) => {
                    const meta = CLIP_META[clip.id];
                    return <article key={clip.id}><span className={`clip-icon ${clip.id}`}>{meta.icon}</span><div><small>CLIP {meta.number}</small><h3 lang={storyLanguage}>{clip.title}</h3><p lang={storyLanguage}>{clip.summary}</p></div><b>{clipDurationLabel(plan, clip.id)}</b></article>;
                  })}
                </div>
                {compiledPackage && (
                  <article className="shot-storyboard" aria-labelledby="shot-storyboard-heading">
                    <div><span className="card-label">Shot manifest</span><h2 id="shot-storyboard-heading">Eight-shot storyboard</h2></div>
                    <p>Review every bounded animation segment before video credits are used.</p>
                    <ol>
                      {compiledPackage.shots.map((shot, index) => (
                        <li data-testid="storyboard-shot" key={shot.id}>
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <div>
                            <small>{CLIP_META[shot.clipId].label} · segment {shot.segmentIndex + 1} · {shot.durationSeconds}s</small>
                            <strong lang={storyLanguage}>{shot.spokenText}</strong>
                            <p lang={storyLanguage}>{shot.timedBeats.join(" ")}</p>
                            <dl>
                              <div><dt>Emotion</dt><dd>{shot.emotion}</dd></div>
                              <div><dt>Camera</dt><dd>{shot.camera}</dd></div>
                              <div><dt>Canon</dt><dd>{[...shot.characterIds, shot.locationId, ...shot.propIds].join(" · ")}</dd></div>
                            </dl>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </article>
                )}
                {compiledPackage && (
                  <article className="branch-graph-preview">
                    <div><span className="card-label">Validated branch graph</span><strong>Both paths rejoin safely</strong></div>
                    <div className="branch-graph-columns">
                      <section><small>CARING PATH</small>{compiledPackage.graph.branches.constructive.beats.map((beat) => <p lang={storyLanguage} key={beat.id}>{beat.summary}</p>)}</section>
                      <section><small>LEARNING + REPAIR PATH</small>{compiledPackage.graph.branches.harmful.beats.map((beat) => <p lang={storyLanguage} key={beat.id}>{beat.summary}</p>)}</section>
                    </div>
                    <p className="convergence-note">✓ Shared finale preconditions validated · <span lang={storyLanguage}>{compiledPackage.graph.reflectionPrompt}</span></p>
                  </article>
                )}
              </div>

              <aside className="continuity-panel">
                <span className="card-label">Story bible</span>
                <div className="bible-pair"><span aria-hidden="true">{selectedPair.emoji}</span><div><strong>{selectedPair.names}</strong><small>{selectedPair.style}</small></div></div>
                <dl>
                  <div><dt>World</dt><dd>{selectedSetting.emoji} {selectedSetting.name}</dd></div>
                  <div><dt>Language</dt><dd>{brief.language}</dd></div>
                  <div><dt>Audience</dt><dd>Ages {brief.ageBand}</dd></div>
                  <div><dt>Shared seed</dt><dd>#{plan.continuitySeed}</dd></div>
                </dl>
                <div className="lock-list"><span>✓ Same character design</span><span>✓ Same wardrobe + props</span><span>✓ Same world + lighting</span><span>✓ Same narrator voice</span></div>
                <div className="render-notice"><strong>{compiledPackage ? "Compiler-approved for rendering" : "Ready to render 4 final clips"}</strong><span>{compiledPackage ? "The parent lesson never goes directly to video. This approved graph was compiled into 8 canon-locked segments, assembled as 4 final clips: 8s, 20s, 20s, and 8s." : "Opening and ending are 8 seconds. Each choice path is extended to 20 seconds at 720p with native audio. This may take several minutes and uses video-generation quota."}</span></div>
                {compiledPackage?.moralSpec.policyDecision === "REQUIRE_PARENT_REVIEW" && (
                  <div className="sensitive-review-confirmation">
                    <input
                      id="sensitive-topic-review"
                      type="checkbox"
                      checked={sensitiveTopicAcknowledged}
                      onChange={(event) => setSensitiveTopicAcknowledged(event.target.checked)}
                    />
                    <label htmlFor="sensitive-topic-review"><strong>I reviewed this sensitive topic</strong><small>I approve the premise, both consequences, repair, and the child-facing wording before video credits are used.</small></label>
                  </div>
                )}
                {error && <p className="form-error" role="alert">{error}</p>}
                <button
                  className="main-action"
                  disabled={!blueprintId || (compiledPackage?.moralSpec.policyDecision === "REQUIRE_PARENT_REVIEW" && !sensitiveTopicAcknowledged)}
                  type="button"
                  onClick={() => blueprintId && void startGeneration(plan, brief, blueprintId)}
                >
                  Generate all four clips <span>→</span>
                </button>
              </aside>
            </div>
          </section>
        )}

        {stage === "generating" && plan && (
          <section className="generation-view">
            <div className="generation-heading">
              <span className="section-kicker">Four-clip render</span>
              <h1>Building “<span lang={storyLanguage}>{plan.title}</span>”</h1>
              <p>You can leave this page and resume later. Each finished clip is kept while the others continue.</p>
            </div>
            <div className="progress-panel">
              <div className="progress-summary" aria-live="polite">
                <div><strong>{readyCount} of 4 clips ready</strong><span>{activeCount > 0 ? `${activeCount} actively working` : failedCount > 0 ? "Waiting for your retry" : "Checking status"}</span></div>
                <span>Elapsed · {formatElapsed(elapsedSeconds)}</span>
              </div>
              <div
                className="generation-line"
                role="progressbar"
                aria-label="Generation stages completed"
                aria-valuenow={finishedGenerationUnits}
                aria-valuemin={0}
                aria-valuemax={totalGenerationUnits}
                aria-valuetext={`${finishedGenerationUnits} of ${totalGenerationUnits} generation stages complete`}
              >
                <i data-testid="generation-progress-fill" style={{ width: `${generationProgressPercent}%` }} />
              </div>
              <p className="generation-units"><strong>{finishedGenerationUnits} of {totalGenerationUnits}</strong> generation stages complete</p>
              <div className="progress-track" role="progressbar" aria-label="Video clips ready" aria-valuenow={readyCount} aria-valuemin={0} aria-valuemax={4} aria-valuetext={`${readyCount} of 4 clips ready`}>
                {CLIP_IDS.map((id) => {
                  const job = jobs[id];
                  const meta = CLIP_META[id];
                  return (
                    <div className={`progress-segment ${job.status}`} key={id}>
                      <span>{job.status === "ready" ? "✓" : meta.number}</span>
                      <p><strong>{meta.label}</strong><small>{clipJobLabel(plan, id, job)}</small></p>
                    </div>
                  );
                })}
              </div>
              <p className="generation-timing">{progressMessage}</p>
            </div>

            <div className="render-grid">
              {CLIP_IDS.map((id) => {
                const meta = CLIP_META[id];
                const job = jobs[id];
                const clip = clipById.get(id);
                return (
                  <article className={`render-card ${job.status}`} key={id}>
                    <div className="render-top"><span className={`clip-icon ${id}`}>{meta.icon}</span><span className="status-dot" /></div>
                    <small>CLIP {meta.number}</small>
                    <h2 lang={clip ? storyLanguage : "en"}>{clip?.title ?? meta.label}</h2>
                    <p lang={clip ? storyLanguage : "en"}>{clip?.summary ?? meta.detail}</p>
                    <div
                      className="clip-progress"
                      role="progressbar"
                      aria-label={`${meta.label} generation progress`}
                      aria-valuenow={Math.round(clipProgressPercent(plan, id, job))}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuetext={clipJobLabel(plan, id, job)}
                    ><i style={{ width: `${clipProgressPercent(plan, id, job)}%` }} /></div>
                    <strong className="job-label">{clipJobLabel(plan, id, job)}</strong>
                    {job.error && <span className="job-error">{job.error}</span>}
                  </article>
                );
              })}
            </div>

            {error && <div className="generation-error" role="alert"><span>!</span><p><strong>{failedCount > 0 ? "Some clips need attention" : "Status refresh paused"}</strong>{error}</p></div>}
            {!isGenerating && failedCount > 0 && (
              <button className="main-action centered" type="button" onClick={() => void retryGeneration()}>Retry unfinished clips <span>↻</span></button>
            )}
            {!isGenerating && failedCount === 0 && (readyCount < 4 || generationPlaybackMediaIncomplete) && (
              <button className="main-action centered" type="button" onClick={refreshGenerationStatus}>{generationPlaybackMediaIncomplete ? "Recheck missing media" : "Check status again"} <span>↻</span></button>
            )}
          </section>
        )}

        {stage === "player" && plan && (
          <section className="player-view">
            <div className="player-heading">
              <div><span className="section-kicker">Interactive preview</span><h1 lang={storyLanguage}>{plan.title}</h1></div>
              <div className="playback-route"><span className={playback === "intro" ? "active" : "done"}>00</span><i /><span className={playback === "opening" || playback === "choice" ? "active" : playback === "intro" ? "" : "done"}>01</span><i /><span className={playback === "positive" || playback === "negative" ? "active" : chosenPath ? "done" : ""}>{chosenPath === "negative" ? "03" : "02"}</span><i /><span className={playback === "ending" ? "active" : playback === "complete" ? "done" : ""}>04</span></div>
            </div>

            <div className="player-layout">
              <div className="video-player-shell">
                {playbackStarted && pendingClipId === null && playback !== "choice" && playback !== "complete" && (
                  <div className="now-playing"><span>Now playing</span><strong>{CLIP_META[visibleClipId].number} · <span lang={storyLanguage}>{clipById.get(visibleClipId)?.title}</span></strong></div>
                )}
                {CLIP_IDS.map((clipId) => {
                  const controlsActive =
                    visibleClipId === clipId &&
                    playbackStarted &&
                    pendingClipId === null &&
                    playback !== "choice" &&
                    playback !== "complete";
                  return videoUrls[clipId] ? (
                    <video
                      className={`story-clip-video ${visibleClipId === clipId ? "visible" : ""}`}
                      key={clipId}
                      ref={(element) => { videoRefs.current[clipId] = element; }}
                      src={videoUrls[clipId]}
                      preload="auto"
                      controls={controlsActive}
                      playsInline
                      aria-label={controlsActive ? `Now playing ${CLIP_META[clipId].label}: ${clipById.get(clipId)?.title ?? CLIP_META[clipId].label}` : undefined}
                      aria-hidden={!controlsActive}
                      tabIndex={controlsActive ? 0 : -1}
                      onLoadedMetadata={() => updateClipBuffer(clipId)}
                      onLoadedData={() => markClipBuffered(clipId)}
                      onProgress={() => updateClipBuffer(clipId)}
                      onCanPlay={() => markClipBuffered(clipId)}
                      onCanPlayThrough={() => markClipBuffered(clipId)}
                      onError={() => handleMediaError(clipId)}
                      onPlaying={() => handleClipPlaying(clipId)}
                      onEnded={() => handleClipEnded(clipId)}
                    >
                      <track
                        key={`${clipId}-${clipId === "ending" ? chosenPath ?? "none" : "fixed"}`}
                        default
                        kind="captions"
                        src={captionUrlFor(clipId)}
                        srcLang={brief.language === "Armenian" ? "hy" : "en"}
                        label={brief.language === "Armenian" ? "Հայերեն" : "English"}
                      />
                    </video>
                  ) : null;
                })}
                {!playbackStarted && (
                  <div className="playback-preparing" aria-live="polite">
                    <span>{preStartTransitionPaused ? "OPENING PAUSED WHILE PREPARING" : failedMediaClip ? "ONE SCENE NEEDS TO RECONNECT" : "NARRATOR SETUP · ՊԱՏՄՈՂԻ ՆԵՐԱԾՈՒԹՅՈՒՆ"}</span>
                    <h2 lang={!preStartTransitionPaused && !failedMediaClip ? storyLanguage : "en"} className={!preStartTransitionPaused && !failedMediaClip ? "narrator-intro" : undefined}>{preStartTransitionPaused ? "Tap to reconnect and begin the story." : failedMediaClip ? "Let’s reconnect the missing scene." : plan.childIntro}</h2>
                    <div
                      className="prebuffer-progress"
                      role="progressbar"
                      aria-label="Video preload progress"
                      aria-valuemin={0}
                      aria-valuemax={CLIP_IDS.length}
                      aria-valuenow={bufferedClips.length}
                    >
                      <i style={{ width: `${(bufferedClips.length / CLIP_IDS.length) * 100}%` }} />
                    </div>
                    <p>{!preStartTransitionPaused && !failedMediaClip ? playbackBufferReady ? "All four scenes can start. Begin when your child understands the setup." : `The opening can start while scenes ${bufferedClips.length} of ${CLIP_IDS.length} prepare in the background.` : "We’re preparing every path now so your child’s choice can continue smoothly."}</p>
                    {!preStartTransitionPaused && !failedMediaClip && <small>This AI-generated story was reviewed and started by your parent.</small>}
                    {preStartTransitionPaused && <button ref={recoveryActionRef} type="button" onClick={continuePlayback}>Reconnect and start ↻</button>}
                    {!preStartTransitionPaused && failedMediaClip && <button type="button" onClick={() => retryFailedMedia(failedMediaClip)}>Retry scene ↻</button>}
                    {!preStartTransitionPaused && !failedMediaClip && playbackStartAvailable && <button type="button" onClick={startPlayback}>Start story ▶</button>}
                    {!preStartTransitionPaused && !failedMediaClip && !playbackBufferReady && <small>The opening can start now; every other path keeps streaming inside its persistent player.</small>}
                  </div>
                )}
                {playbackStarted && playbackNeedsGesture && (
                  <div className="playback-preparing compact" aria-live="polite">
                    <span>SCENE PAUSED WHILE PREPARING</span>
                    <h2>Tap to reconnect and continue the story.</h2>
                    <button ref={recoveryActionRef} type="button" onClick={continuePlayback}>{pendingClipId && mediaErrors[pendingClipId] ? "Retry and continue ↻" : "Continue story ▶"}</button>
                  </div>
                )}
                {playbackStarted && pendingClipId && !playbackNeedsGesture && !seamlessTransition && (
                  <div className="scene-transition-status" role="status">Joining the next scene…</div>
                )}
                {playback === "ending" && chosenPath && compiledPackage?.graph.convergence.narrationByBranch && (
                  <div className="finale-narration" lang={storyLanguage} aria-live="polite">
                    {chosenPath === "positive"
                      ? compiledPackage.graph.convergence.narrationByBranch.constructive
                      : compiledPackage.graph.convergence.narrationByBranch.harmful}
                  </div>
                )}
                {playback === "choice" && (
                  <div className="decision-overlay" role="dialog" aria-labelledby="story-choice-title">
                    <span>YOUR CHOICE</span>
                    <h2 id="story-choice-title" lang={storyLanguage}>{plan.choiceQuestion}</h2>
                    <div>
                      <button ref={firstChoiceRef} type="button" disabled={pendingClipId !== null} onClick={() => chooseBranch("positive")}><i>♥</i><strong lang={storyLanguage}>{plan.positiveChoice.label}</strong></button>
                      <button type="button" disabled={pendingClipId !== null} onClick={() => chooseBranch("negative")}><i>?</i><strong lang={storyLanguage}>{plan.negativeChoice.label}</strong></button>
                    </div>
                  </div>
                )}
                {playback === "complete" && (
                  <div className="completion-overlay" role="dialog" aria-labelledby="story-complete-title" aria-describedby="story-reflection-prompt"><span>✓</span><h2 id="story-complete-title">Story complete</h2><p id="story-reflection-prompt" lang={compiledPackage?.graph.reflectionPrompt ? storyLanguage : "en"}>{compiledPackage?.graph.reflectionPrompt ?? "The choice changed the middle. What did the characters feel, and why?"}</p><button ref={completionActionRef} type="button" onClick={restartPlayback}>Try the other path ↻</button></div>
                )}
              </div>

              <aside className="player-side">
                <span className="card-label">Branching logic</span>
                <div className="route-map">
                  <div className={`route-node narrator ${playback === "intro" ? "active" : "done"}`}><span>00</span><p><strong>Narrator setup</strong><small>Explains what is happening first</small></p></div>
                  <div className="route-lead" />
                  <div className={`route-node opening ${playback === "opening" || playback === "choice" ? "active" : playback === "intro" ? "" : "done"}`}><span>01</span><p><strong>Beginning</strong><small>Ends at the choice</small></p></div>
                  <div className="route-split" />
                  <div className={`route-node positive ${chosenPath === "positive" ? playback === "ending" || playback === "complete" ? "done" : playback === "positive" || pendingClipId === "positive" ? "active" : "" : ""}`}><span>02</span><p><strong>Caring path · {clipDurationLabel(plan, "positive")}</strong><small lang={storyLanguage}>{plan.positiveChoice.label}</small></p></div>
                  <div className={`route-node negative ${chosenPath === "negative" ? playback === "ending" || playback === "complete" ? "done" : playback === "negative" || pendingClipId === "negative" ? "active" : "" : ""}`}><span>03</span><p><strong>Learning path · {clipDurationLabel(plan, "negative")}</strong><small lang={storyLanguage}>{plan.negativeChoice.label}</small></p></div>
                  <div className="route-join" />
                  <div className={`route-node ending ${playback === "ending" ? "active" : playback === "complete" ? "done" : ""}`}><span>04</span><p><strong>Shared ending</strong><small>Always plays last</small></p></div>
                </div>
                <div className="parent-check"><strong>Parent check</strong><p>The less caring branch explains the consequence without shame, then clip 4 closes with the same constructive lesson.</p></div>
                <button className="quiet-button full" type="button" onClick={resetStudio}>Create another story</button>
              </aside>
            </div>
          </section>
        )}
      </div>

      <footer className="studio-footer"><span>KindPath Studio</span><p>Stories that let children practice a choice—not just hear a rule.</p></footer>
    </main>
  );
}
