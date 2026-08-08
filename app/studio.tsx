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
type JobStatus = "waiting" | "starting" | "rendering" | "ingesting" | "ready" | "failed";
type ClipJob = { status: JobStatus; error?: string };
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
    status: "starting" | "rendering" | "ingesting" | "ready" | "failed";
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
  ingesting: "Saving securely",
  ready: "Ready ✓",
  failed: "Needs retry",
};

const emptyJobs = (): JobMap => ({
  opening: { status: "waiting" },
  positive: { status: "waiting" },
  negative: { status: "waiting" },
  ending: { status: "waiting" },
});

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function formatElapsed(seconds: number) {
  if (seconds < 60) return "less than 1 min";
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min`;
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

  const pollingRef = useRef(false);
  const pollingVersionRef = useRef(0);

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

  const currentStep = { brief: 1, blueprint: 2, generating: 3, player: 4 }[stage];
  const selectedPair = getCharacterPair(brief.characterPairId);
  const selectedSetting = getSetting(brief.settingId);
  const readyCount = CLIP_IDS.filter((id) => jobs[id].status === "ready").length;
  const failedCount = CLIP_IDS.filter((id) => jobs[id].status === "failed").length;
  const activeCount = CLIP_IDS.filter((id) => ["starting", "rendering", "ingesting"].includes(jobs[id].status)).length;
  const queuedCount = CLIP_IDS.filter((id) => jobs[id].status === "waiting").length;
  const stillWorkingCount = activeCount + queuedCount;
  const progressMessage =
    failedCount > 0
      ? `${failedCount} clip${failedCount === 1 ? " needs" : "s need"} another try; completed clips are safe.`
      : readyCount > 0 && stillWorkingCount > 0
        ? `${readyCount} clip${readyCount === 1 ? " is" : "s are"} safely stored; ${stillWorkingCount} still working.`
        : activeCount > 0 && elapsedSeconds >= 60
          ? "Video rendering is usually the longest step. Each clip finishes independently."
          : "Starting and checking all four video jobs.";
  const activeClipId: ClipId =
    playback === "positive" || playback === "negative" || playback === "ending"
      ? playback
      : playback === "opening" || playback === "choice"
        ? "opening"
        : "ending";
  const activeVideoUrl = videoUrls[activeClipId];

  const clipById = useMemo(() => {
    return new Map((plan?.clips ?? []).map((clip) => [clip.id, clip]));
  }, [plan]);
  const activeCaption = clipById.get(activeClipId)?.caption ?? clipById.get(activeClipId)?.summary ?? "Story narration";
  const activeCaptionUrl = `data:text/vtt;charset=utf-8,${encodeURIComponent(
    `WEBVTT\n\n00:00:00.000 --> 00:00:08.000\n${activeCaption.replace(/-->/g, "→")}`,
  )}`;

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
    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    persistGeneration(storyId, planValue, briefValue, startedAt);

    try {
      for (let attempt = 0; attempt < 300; attempt += 1) {
        const response = await fetch(`/api/stories/${storyId}`, { cache: "no-store" });
        if (pollingVersionRef.current !== pollingVersion) return;
        const payload = (await response.json()) as { story?: ServerStory; error?: string };
        if (!response.ok || !payload.story) throw new Error(payload.error ?? "Story status is unavailable.");

        applyServerStory(payload.story);
        const ready = payload.story.clips.filter((clip) => clip.status === "ready").length;
        const active = payload.story.clips.filter((clip) => clip.status === "starting" || clip.status === "rendering" || clip.status === "ingesting").length;
        const failed = payload.story.clips.filter((clip) => clip.status === "failed").length;

        if (ready === 4) {
          localStorage.removeItem(GENERATION_STORAGE_KEY);
          setSavedGeneration(null);
          setPlayback("opening");
          setChosenPath(null);
          setStage("player");
          return;
        }
        if (active === 0 && failed > 0) {
          setError(`${failed} clip${failed === 1 ? "" : "s"} need another try. Finished clips are safely stored.`);
          return;
        }
        await wait(6_000);
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
    const requestedAt = Date.now();
    setError("");
    setStage("generating");
    setIsGenerating(true);
    setGenerationStartedAt(requestedAt);
    setElapsedSeconds(0);
    setJobs({
      opening: { status: "starting" },
      positive: { status: "starting" },
      negative: { status: "starting" },
      ending: { status: "starting" },
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
    setChosenPath(path);
    setPlayback(path);
  }

  function handleVideoEnded() {
    if (playback === "opening") setPlayback("choice");
    else if (playback === "positive" || playback === "negative") setPlayback("ending");
    else if (playback === "ending") setPlayback("complete");
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
                    return <article key={clip.id}><span className={`clip-icon ${clip.id}`}>{meta.icon}</span><div><small>CLIP {meta.number}</small><h3>{clip.title}</h3><p>{clip.summary}</p></div><b>8 sec</b></article>;
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
                <div className="render-notice"><strong>Ready to render 4 clips</strong><span>Each clip is 8 seconds at 720p with native audio. This may take several minutes and uses video-generation quota.</span></div>
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
              <div className="progress-track" role="progressbar" aria-label="Video clips ready" aria-valuenow={readyCount} aria-valuemin={0} aria-valuemax={4}>
                {CLIP_IDS.map((id) => {
                  const job = jobs[id];
                  const meta = CLIP_META[id];
                  return (
                    <div className={`progress-segment ${job.status}`} key={id}>
                      <span>{job.status === "ready" ? "✓" : meta.number}</span>
                      <p><strong>{meta.label}</strong><small>{JOB_STATUS_LABEL[job.status]}</small></p>
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
                    <div className="clip-progress"><i /></div>
                    <strong className="job-label">{JOB_STATUS_LABEL[job.status]}</strong>
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
                <div className="now-playing"><span>Now playing</span><strong>{CLIP_META[activeClipId].number} · {clipById.get(activeClipId)?.title}</strong></div>
                {activeVideoUrl && (
                  <video
                    key={activeClipId}
                    src={activeVideoUrl}
                    autoPlay={playback !== "choice" && playback !== "complete"}
                    controls={playback !== "choice" && playback !== "complete"}
                    playsInline
                    onEnded={handleVideoEnded}
                  >
                    <track
                      default
                      kind="captions"
                      src={activeCaptionUrl}
                      srcLang={brief.language === "Armenian" ? "hy" : "en"}
                      label={brief.language === "Armenian" ? "Հայերեն" : "English"}
                    />
                  </video>
                )}
                {playback === "choice" && (
                  <div className="decision-overlay">
                    <span>YOUR CHOICE</span>
                    <h2>{plan.choiceQuestion}</h2>
                    <div>
                      <button type="button" onClick={() => chooseBranch("positive")}><i>♥</i><strong>{plan.positiveChoice.label}</strong></button>
                      <button type="button" onClick={() => chooseBranch("negative")}><i>?</i><strong>{plan.negativeChoice.label}</strong></button>
                    </div>
                  </div>
                )}
                {playback === "complete" && (
                  <div className="completion-overlay"><span>✓</span><h2>Story complete</h2><p>The choice changed the middle. The lesson still reached a warm ending.</p><button type="button" onClick={() => { setPlayback("opening"); setChosenPath(null); }}>Try the other path ↻</button></div>
                )}
              </div>

              <aside className="player-side">
                <span className="card-label">Branching logic</span>
                <div className="route-map">
                  <div className={`route-node opening ${playback === "opening" || playback === "choice" ? "active" : "done"}`}><span>01</span><p><strong>Beginning</strong><small>Ends at the choice</small></p></div>
                  <div className="route-split" />
                  <div className={`route-node positive ${chosenPath === "positive" ? "active" : ""}`}><span>02</span><p><strong>Caring path</strong><small>{plan.positiveChoice.label}</small></p></div>
                  <div className={`route-node negative ${chosenPath === "negative" ? "active" : ""}`}><span>03</span><p><strong>Learning path</strong><small>{plan.negativeChoice.label}</small></p></div>
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
