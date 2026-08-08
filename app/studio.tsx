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
  type ClipId,
  type StoryBrief,
  type StoryPlan,
} from "./lib/story";

type StudioStage = "brief" | "blueprint" | "generating" | "player";
type PlaybackStage = "opening" | "choice" | "positive" | "negative" | "ending" | "complete";
type JobStatus = "waiting" | "starting" | "rendering" | "extension_retry" | "extending" | "ingesting" | "ready" | "failed";
type ClipJob = { status: JobStatus; extensionCount: number; error?: string };
type JobMap = Record<ClipId, ClipJob>;
type VideoMap = Partial<Record<ClipId, string>>;

type ServerStory = {
  id: string;
  status: string;
  createdAt: number;
  plan: StoryPlan;
  brief: StoryBrief;
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
};

type PendingStart = {
  blueprintId: string;
  idempotencyKey: string;
};

const GENERATION_STORAGE_KEY = "kindpath-generation";
const PENDING_START_STORAGE_KEY = "kindpath-pending-start";

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
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "The request could not be completed.");
  return payload;
}

function isSavedGeneration(value: unknown): value is SavedGeneration {
  const session = value as SavedGeneration;
  return Boolean(
    session &&
      session.storyId &&
      session.plan &&
      session.brief &&
      Array.isArray(session.plan.clips) &&
      Date.now() - session.startedAt < 7 * 24 * 60 * 60 * 1000,
  );
}

export function StoryStudio() {
  const [stage, setStage] = useState<StudioStage>("brief");
  const [brief, setBrief] = useState<StoryBrief>(DEFAULT_BRIEF);
  const [plan, setPlan] = useState<StoryPlan | null>(null);
  const [blueprintId, setBlueprintId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobMap>(emptyJobs);
  const [videoUrls, setVideoUrls] = useState<VideoMap>({});
  const [playback, setPlayback] = useState<PlaybackStage>("opening");
  const [chosenPath, setChosenPath] = useState<"positive" | "negative" | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
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

  const pollingRef = useRef(false);
  const pollingVersionRef = useRef(0);
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

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await Promise.resolve();
      try {
        const raw = localStorage.getItem(GENERATION_STORAGE_KEY);
        const localSaved = raw ? (JSON.parse(raw) as unknown) : null;
        if (isSavedGeneration(localSaved)) {
          if (!cancelled) setSavedGeneration(localSaved);
          return;
        }
        if (raw) localStorage.removeItem(GENERATION_STORAGE_KEY);
      } catch {
        localStorage.removeItem(GENERATION_STORAGE_KEY);
      }

      try {
        const response = await fetch("/api/stories", { cache: "no-store" });
        const payload = (await response.json()) as { story?: ServerStory | null };
        if (!response.ok || !payload.story || cancelled) return;
        const recovered: SavedGeneration = {
          storyId: payload.story.id,
          plan: payload.story.plan,
          brief: payload.story.brief,
          startedAt: payload.story.createdAt ?? Date.now(),
        };
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
    if (playbackNeedsGesture) recoveryActionRef.current?.focus();
    else if (playback === "choice") firstChoiceRef.current?.focus();
    else if (playback === "complete") completionActionRef.current?.focus();
  }, [playback, playbackNeedsGesture]);

  const currentStep = { brief: 1, blueprint: 2, generating: 3, player: 4 }[stage];
  const selectedPair = getCharacterPair(brief.characterPairId);
  const selectedSetting = getSetting(brief.settingId);
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
  const playbackBufferReady = bufferedClips.length === CLIP_IDS.length;
  const playbackStartAvailable = Boolean(videoUrls.opening);
  const failedMediaClip = CLIP_IDS.find((clipId) => mediaErrors[clipId]);
  const preStartTransitionPaused = !playbackStarted && pendingClipId !== null && playbackNeedsGesture;

  const clipById = useMemo(() => {
    return new Map((plan?.clips ?? []).map((clip) => [clip.id, clip]));
  }, [plan]);

  function captionUrlFor(clipId: ClipId) {
    const clip = clipById.get(clipId);
    const baseCaption = clip?.caption ?? clip?.summary ?? "Story narration";
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
    setPlayback("opening");
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

  function updateBrief<K extends keyof StoryBrief>(key: K, value: StoryBrief[K]) {
    setBrief((current) => ({ ...current, [key]: value }));
  }

  function persistGeneration(storyId: string, planValue: StoryPlan, briefValue: StoryBrief, startedAt: number) {
    const saved: SavedGeneration = {
      storyId,
      plan: planValue,
      brief: briefValue,
      startedAt,
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
    setError("");
    setIsPlanning(true);
    setVideoUrls({});
    try {
      const result = await apiRequest<{ blueprintId: string; plan: StoryPlan }>("/api/plan", brief);
      setPlan(result.plan);
      setBlueprintId(result.blueprintId);
      localStorage.removeItem(PENDING_START_STORAGE_KEY);
      setJobs(emptyJobs());
      setPlayback("opening");
      setChosenPath(null);
      setStage("blueprint");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The blueprint could not be created.");
    } finally {
      setIsPlanning(false);
    }
  }

  async function pollStory(storyId: string, planValue: StoryPlan, briefValue: StoryBrief, startedAt: number) {
    if (pollingRef.current) return;
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
        let payload: { story?: ServerStory; error?: string };
        try {
          const response = await fetch(`/api/stories/${storyId}`, { cache: "no-store" });
          if (pollingVersionRef.current !== pollingVersion) return;
          payload = (await response.json()) as { story?: ServerStory; error?: string };
          if (!response.ok || !payload.story) throw new Error(payload.error ?? "Story status is unavailable.");
          consecutiveRefreshErrors = 0;
          setError("");
        } catch (refreshError) {
          consecutiveRefreshErrors += 1;
          if (consecutiveRefreshErrors >= 5) throw refreshError;
          setError("The status connection paused briefly. Retrying automatically…");
          await wait(Math.min(5_000, 1_500 * consecutiveRefreshErrors));
          continue;
        }

        applyServerStory(payload.story);
        const ready = payload.story.clips.filter((clip) => clip.status === "ready").length;
        const active = payload.story.clips.filter((clip) =>
          clip.status === "starting" || clip.status === "rendering" || clip.status === "extension_retry" || clip.status === "extending" || clip.status === "ingesting"
        ).length;
        const failed = payload.story.clips.filter((clip) => clip.status === "failed").length;

        if (ready === 4) {
          localStorage.removeItem(GENERATION_STORAGE_KEY);
          setSavedGeneration(null);
          resetPlaybackState();
          setStage("player");
          return;
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
      });
      applyServerStory(result.story);
      const startedAt = result.story.createdAt ?? requestedAt;
      await pollStory(result.story.id, planValue, briefValue, startedAt);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "The video jobs could not be started.");
      setIsGenerating(false);
      setStage("blueprint");
    }
  }

  function resumePreviousGeneration() {
    if (!savedGeneration) return;
    setBrief(savedGeneration.brief);
    setPlan(savedGeneration.plan);
    setJobs(emptyJobs());
    setError("");
    void pollStory(savedGeneration.storyId, savedGeneration.plan, savedGeneration.brief, savedGeneration.startedAt);
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
      setError(retryError instanceof Error ? retryError.message : "The unfinished clips could not be restarted.");
      setIsGenerating(false);
    }
  }

  function refreshGenerationStatus() {
    if (!savedGeneration || !plan) return;
    void pollStory(savedGeneration.storyId, plan, brief, savedGeneration.startedAt);
  }

  function resetStudio() {
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
          <aside className="resume-banner">
            <div><span aria-hidden="true">↻</span><p><strong>A story is waiting for you</strong><small>{savedGeneration.plan.title}</small></p></div>
            <button type="button" onClick={resumePreviousGeneration}>Resume generation</button>
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
              <button className="main-action" disabled={isPlanning} type="submit">
                {isPlanning ? <><span className="spinner" /> Directing the story…</> : <>Create story blueprint <span>→</span></>}
              </button>
              <p className="action-note">Blueprinting uses text generation only. You approve the story before four video renders begin.</p>
            </form>
          </section>
        )}

        {stage === "blueprint" && plan && (
          <section className="blueprint-view">
            <div className="view-heading">
              <div><span className="section-kicker">Continuity-locked blueprint</span><h1>{plan.title}</h1><p>{plan.parentSummary}</p></div>
              <button className="quiet-button" type="button" onClick={() => setStage("brief")}>← Edit brief</button>
            </div>

            <div className="blueprint-grid">
              <div className="blueprint-main">
                <article className="choice-preview">
                  <span className="card-label">The child will decide</span>
                  <p className="child-intro">{plan.childIntro}</p>
                  <h2>{plan.choiceQuestion}</h2>
                  <div className="preview-choices">
                    <div className="good"><span>♥</span><p><strong>{plan.positiveChoice.label}</strong><small>{plan.positiveChoice.explanation}</small></p></div>
                    <div className="other"><span>?</span><p><strong>{plan.negativeChoice.label}</strong><small>{plan.negativeChoice.explanation}</small></p></div>
                  </div>
                </article>

                <div className="clip-blueprints">
                  {plan.clips.map((clip) => {
                    const meta = CLIP_META[clip.id];
                    return <article key={clip.id}><span className={`clip-icon ${clip.id}`}>{meta.icon}</span><div><small>CLIP {meta.number}</small><h3>{clip.title}</h3><p>{clip.summary}</p></div><b>{clipDurationLabel(plan, clip.id)}</b></article>;
                  })}
                </div>
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
                <div className="render-notice"><strong>Ready to render 4 final clips</strong><span>Opening and ending are 8 seconds. Each choice path is extended to 20 seconds at 720p with native audio. This may take several minutes and uses video-generation quota.</span></div>
                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="main-action" disabled={!blueprintId} type="button" onClick={() => blueprintId && void startGeneration(plan, brief, blueprintId)}>
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
              <h1>Building “{plan.title}”</h1>
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
                <i style={{ width: `${generationProgressPercent}%` }} />
              </div>
              <p className="generation-units"><strong>{finishedGenerationUnits} of {totalGenerationUnits}</strong> generation stages complete</p>
              <div className="progress-track" role="progressbar" aria-label="Video clips ready" aria-valuenow={readyCount} aria-valuemin={0} aria-valuemax={4}>
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
                    <h2>{clip?.title ?? meta.label}</h2>
                    <p>{clip?.summary ?? meta.detail}</p>
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
            {!isGenerating && failedCount === 0 && readyCount < 4 && (
              <button className="main-action centered" type="button" onClick={refreshGenerationStatus}>Check status again <span>↻</span></button>
            )}
          </section>
        )}

        {stage === "player" && plan && (
          <section className="player-view">
            <div className="player-heading">
              <div><span className="section-kicker">Interactive preview</span><h1>{plan.title}</h1></div>
              <div className="playback-route"><span className={playback === "opening" || playback === "choice" ? "active" : "done"}>01</span><i /><span className={playback === "positive" || playback === "negative" ? "active" : chosenPath ? "done" : ""}>{chosenPath === "negative" ? "03" : "02"}</span><i /><span className={playback === "ending" ? "active" : playback === "complete" ? "done" : ""}>04</span></div>
            </div>

            <div className="player-layout">
              <div className="video-player-shell">
                {playbackStarted && pendingClipId === null && playback !== "choice" && playback !== "complete" && (
                  <div className="now-playing"><span>Now playing</span><strong>{CLIP_META[visibleClipId].number} · {clipById.get(visibleClipId)?.title}</strong></div>
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
                    <span>{preStartTransitionPaused ? "OPENING PAUSED WHILE PREPARING" : failedMediaClip ? "ONE SCENE NEEDS TO RECONNECT" : playbackBufferReady ? "ALL PATHS PRIMED" : "STREAMING ALL FOUR PATHS"}</span>
                    <h2>{preStartTransitionPaused ? "Tap to reconnect and begin the story." : failedMediaClip ? "Let’s reconnect the missing scene." : playbackBufferReady ? "Your story is ready to begin." : `The story can begin while paths ${bufferedClips.length} of ${CLIP_IDS.length} prepare…`}</h2>
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
                    <p>We’re preparing every path now so your child’s choice can continue smoothly.</p>
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
                {playback === "choice" && (
                  <div className="decision-overlay" role="dialog" aria-labelledby="story-choice-title">
                    <span>YOUR CHOICE</span>
                    <h2 id="story-choice-title">{plan.choiceQuestion}</h2>
                    <div>
                      <button ref={firstChoiceRef} type="button" disabled={pendingClipId !== null} onClick={() => chooseBranch("positive")}><i>♥</i><strong>{plan.positiveChoice.label}</strong></button>
                      <button type="button" disabled={pendingClipId !== null} onClick={() => chooseBranch("negative")}><i>?</i><strong>{plan.negativeChoice.label}</strong></button>
                    </div>
                  </div>
                )}
                {playback === "complete" && (
                  <div className="completion-overlay" role="dialog" aria-labelledby="story-complete-title"><span>✓</span><h2 id="story-complete-title">Story complete</h2><p>The choice changed the middle. The lesson still reached a warm ending.</p><button ref={completionActionRef} type="button" onClick={restartPlayback}>Try the other path ↻</button></div>
                )}
              </div>

              <aside className="player-side">
                <span className="card-label">Branching logic</span>
                <div className="route-map">
                  <div className={`route-node opening ${playback === "opening" || playback === "choice" ? "active" : "done"}`}><span>01</span><p><strong>Beginning</strong><small>Ends at the choice</small></p></div>
                  <div className="route-split" />
                  <div className={`route-node positive ${chosenPath === "positive" ? playback === "ending" || playback === "complete" ? "done" : playback === "positive" || pendingClipId === "positive" ? "active" : "" : ""}`}><span>02</span><p><strong>Caring path · {clipDurationLabel(plan, "positive")}</strong><small>{plan.positiveChoice.label}</small></p></div>
                  <div className={`route-node negative ${chosenPath === "negative" ? playback === "ending" || playback === "complete" ? "done" : playback === "negative" || pendingClipId === "negative" ? "active" : "" : ""}`}><span>03</span><p><strong>Learning path · {clipDurationLabel(plan, "negative")}</strong><small>{plan.negativeChoice.label}</small></p></div>
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
