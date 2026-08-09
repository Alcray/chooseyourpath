import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { api, ApiError } from "../api/client";
import type { Branch } from "../api/types";
import { useSessionStore } from "../store/sessionStore";
import { useSceneAsset } from "../hooks/useSceneAsset";
import { useStoryProgress } from "../hooks/useStoryProgress";
import { PageShell } from "../components/PageShell";
import { SceneStage } from "../components/SceneStage";
import { ChoiceCard } from "../components/ChoiceCard";
import { PrimaryButton } from "../components/PrimaryButton";
import { LoadingScene } from "../components/LoadingScene";
import { PreparingStory } from "../components/PreparingStory";
import { StarRating } from "../components/StarRating";
import { useTranslation } from "../i18n";

type Step = "opening" | "decision" | "consequence" | "reflection" | "summary";

export function StoryPage() {
  const navigate = useNavigate();
  const { t, tList } = useTranslation();
  const { lesson, customLesson, character, setting, story, chosenChoiceId, reflectionOptionId } = useSessionStore();
  const setStory = useSessionStore((s) => s.setStory);
  const setChoice = useSessionStore((s) => s.setChoice);
  const setReflection = useSessionStore((s) => s.setReflection);
  const resetAll = useSessionStore((s) => s.resetAll);

  const [step, setStep] = useState<Step>("opening");
  const [sceneIndex, setSceneIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const endedGuard = useRef<string | null>(null);

  useEffect(() => {
    if ((!lesson && !customLesson) || !character || !setting) {
      navigate("/lesson", { replace: true });
      return;
    }
    if (story) return;

    api
      .generateStory({ lessonId: lesson?.id, customLesson: customLesson ?? undefined, characterId: character.id, settingId: setting.id })
      .then((s) => setStory(s))
      .catch((err) => {
        if (err instanceof ApiError && err.code === "CUSTOM_LESSON_REQUIRES_AI") {
          setError(t("errors.customLessonRequiresAi"));
        } else {
          setError(t("errors.subtitle"));
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const branch: Branch | undefined = story?.branches.find((b) => b.choiceId === chosenChoiceId);

  const currentScene =
    step === "opening" ? story?.opening[sceneIndex] : step === "consequence" ? branch?.consequence[sceneIndex] : undefined;

  const { job, error: sceneError } = useSceneAsset(story?.id ?? null, currentScene?.id ?? null);

  // Every scene (both branches) starts generating the moment the story is
  // created (see pregenerateAllScenes on the server) — waiting here for all
  // of them to settle means playback, once started, never stalls again, not
  // even right after the child makes a decision.
  const { progress, done: allScenesReady } = useStoryProgress(story?.id ?? null);

  function handleSceneEnded() {
    if (!currentScene || endedGuard.current === currentScene.id) return;
    endedGuard.current = currentScene.id;

    if (step === "opening" && story) {
      const isLast = sceneIndex === story.opening.length - 1;
      if (isLast) setStep("decision");
      else setSceneIndex((i) => i + 1);
    } else if (step === "consequence" && branch) {
      const isLast = sceneIndex === branch.consequence.length - 1;
      if (isLast) setStep("reflection");
      else setSceneIndex((i) => i + 1);
    }
  }

  useEffect(() => {
    endedGuard.current = null;
  }, [currentScene?.id]);

  if (error) {
    return (
      <PageShell title={t("errors.title")} subtitle={error}>
        <div className="flex justify-center">
          <PrimaryButton onClick={() => navigate("/lesson")}>{t("nav.tryAgain")}</PrimaryButton>
        </div>
      </PageShell>
    );
  }

  if ((!lesson && !customLesson) || !character || !setting) return null;
  if (!story) {
    return (
      <PageShell title={t("loading.creatingTitle")} subtitle="">
        <LoadingScene labels={tList("loading.story")} />
      </PageShell>
    );
  }

  if (!allScenesReady) {
    return (
      <PageShell title={t("loading.creatingTitle")} subtitle={t("story.startingLine", { character: character.name, setting: setting.name })}>
        <PreparingStory progress={progress} loadingMessages={tList("loading.story")} />
      </PageShell>
    );
  }

  if ((step === "opening" || step === "consequence") && currentScene) {
    const heading = step === "opening" ? story.title : t("story.consequenceTitle");
    const subtitle = step === "opening" ? t("story.startingLine", { character: character.name, setting: setting.name }) : story.title;
    return (
      <PageShell title={heading} subtitle={subtitle}>
        <SceneStage
          sceneKey={currentScene.id}
          narrationText={currentScene.narration}
          job={sceneError ? { sceneKey: currentScene.id, status: "error", error: sceneError } : job}
          loadingMessages={tList("loading.scene").map((m) => m.replace("{name}", character.name))}
          onEnded={handleSceneEnded}
        />
      </PageShell>
    );
  }

  if (step === "decision") {
    return (
      <PageShell title={story.decision.prompt} subtitle={t("story.decisionSubtitle")}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {story.decision.choices.map((choice, i) => (
            <ChoiceCard
              key={choice.id}
              icon={choice.icon}
              label={choice.label}
              description={choice.description}
              color={i === 0 ? "from-emerald-400 to-teal-500" : "from-sky-400 to-indigo-500"}
              index={i}
              onClick={() => {
                setChoice(choice.id);
                setSceneIndex(0);
                setStep("consequence");
              }}
            />
          ))}
        </div>
      </PageShell>
    );
  }

  if (step === "reflection" && branch) {
    if (!reflectionOptionId) {
      return (
        <PageShell title={branch.reflection.question} subtitle={t("story.reflectionSubtitle")}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {branch.reflection.options.map((opt, i) => (
              <ChoiceCard
                key={opt.id}
                icon={opt.icon}
                label={opt.label}
                color={i === 0 ? "from-fuchsia-400 to-pink-500" : "from-amber-400 to-orange-500"}
                index={i}
                onClick={() => setReflection(opt.id)}
              />
            ))}
          </div>
        </PageShell>
      );
    }

    return (
      <PageShell title={t("story.insightTitle")} subtitle="">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mx-auto max-w-lg rounded-[2rem] bg-white/95 p-8 text-center shadow-xl ring-4 ring-white/50"
        >
          <span className="text-6xl" aria-hidden>
            💡
          </span>
          <p className="mt-4 font-display text-xl font-bold text-slate-700">{branch.reflection.insight}</p>
        </motion.div>
        <div className="mt-6 flex justify-center">
          <PrimaryButton onClick={() => setStep("summary")}>{t("story.seeSummary")}</PrimaryButton>
        </div>
      </PageShell>
    );
  }

  if (step === "summary" && branch) {
    return (
      <SummaryView
        branch={branch}
        storyTitle={story.title}
        onReplayBranch={() => {
          setChoice(null);
          setReflection(null);
          setSceneIndex(0);
          setStep("decision");
        }}
        onNewAdventure={() => {
          resetAll();
          navigate("/");
        }}
      />
    );
  }

  return null;
}

function SummaryView({
  branch,
  storyTitle,
  onReplayBranch,
  onNewAdventure,
}: {
  branch: Branch;
  storyTitle: string;
  onReplayBranch: () => void;
  onNewAdventure: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 } });
  }, []);

  return (
    <PageShell title={branch.summary.title} subtitle={storyTitle}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-lg rounded-[2rem] bg-white/95 p-8 text-center shadow-xl ring-4 ring-white/50"
      >
        <StarRating stars={branch.summary.stars} />
        <p className="mt-6 font-display text-lg font-bold text-slate-700">{branch.summary.message}</p>
        <div className="mt-5 rounded-2xl bg-indigo-50 p-4">
          <p className="font-body font-bold text-indigo-600">
            {t("story.lessonLearned")} {branch.summary.moralRecap}
          </p>
        </div>
      </motion.div>

      <div className="mt-8 flex flex-wrap justify-center gap-4">
        <button
          type="button"
          onClick={onReplayBranch}
          className="rounded-full bg-white px-6 py-3 font-display font-bold text-indigo-600 shadow transition hover:scale-105"
        >
          {t("story.replayBranch")}
        </button>
        <PrimaryButton onClick={onNewAdventure}>{t("story.newAdventure")}</PrimaryButton>
      </div>
    </PageShell>
  );
}
