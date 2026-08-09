import { AnimatePresence, motion } from "framer-motion";
import type { SceneJob } from "../api/types";
import { useNarrationPlayback } from "../hooks/useNarrationPlayback";
import { LoadingScene } from "./LoadingScene";
import { useTranslation } from "../i18n";

const ANIMATION_VARIANTS = {
  float: { y: [0, -14, 0] },
  bounce: { y: [0, -22, 0] },
  pulse: { scale: [1, 1.06, 1] },
  sway: { rotate: [-4, 4, -4] },
};

interface SceneStageProps {
  sceneKey: string; // stable id for this narration beat, used to key playback effects
  narrationText: string;
  job: SceneJob | null; // null while the initial generation request is in flight
  loadingMessages: string[];
  onEnded: () => void;
}

// Renders one narration beat: while generating, a friendly Armenian loading
// state; once ready, either a real Veo video or the illustration fallback,
// with narration audio (or browser speech, or a timed fallback — see
// useNarrationPlayback) driving when the scene "ends" and the player
// auto-advances. A manual skip control covers autoplay-blocked browsers and
// impatient children.
export function SceneStage({ sceneKey, narrationText, job, loadingMessages, onEnded }: SceneStageProps) {
  const { t } = useTranslation();
  const asset = job?.status === "ready" ? job.asset : undefined;
  const ready = Boolean(asset);
  const failed = job?.status === "error";
  const video = asset?.type === "video" ? asset : undefined;
  const illustration = asset?.type === "illustration" ? asset : undefined;

  const { replay } = useNarrationPlayback(ready, sceneKey, narrationText, asset?.audioUrl ?? null, onEnded);

  return (
    <div className="relative w-full overflow-hidden rounded-[2rem] shadow-xl ring-4 ring-white/50">
      <div className="relative flex h-64 w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 sm:h-80">
        {!ready && !failed && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <LoadingScene labels={loadingMessages} />
          </div>
        )}

        {failed && (
          <div className="flex flex-col items-center gap-2 text-white">
            <span className="text-6xl" aria-hidden>
              ✨
            </span>
          </div>
        )}

        {video && <video className="h-full w-full object-cover" src={video.videoUrl} autoPlay loop muted playsInline />}

        {illustration && (
          <AnimatePresence mode="wait">
            <motion.div
              key={sceneKey}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className={`relative flex h-full w-full items-center justify-center bg-gradient-to-br ${illustration.background}`}
            >
              {illustration.sprites.map((sprite, i) => (
                <motion.span
                  key={i}
                  className="absolute select-none drop-shadow-lg"
                  style={{
                    left: `${sprite.xPct}%`,
                    top: `${sprite.yPct}%`,
                    fontSize: `${sprite.sizeRem}rem`,
                    translate: "-50% -50%",
                  }}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    ...ANIMATION_VARIANTS[illustration.animation],
                  }}
                  transition={{
                    opacity: { delay: sprite.delay, duration: 0.3 },
                    scale: { delay: sprite.delay, type: "spring", stiffness: 200 },
                    y: { delay: sprite.delay, duration: 3, repeat: Infinity, ease: "easeInOut" },
                    rotate: { delay: sprite.delay, duration: 3, repeat: Infinity, ease: "easeInOut" },
                  }}
                  aria-hidden
                >
                  {sprite.emoji}
                </motion.span>
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <div className="flex items-start gap-3 bg-white/95 p-5 sm:p-6">
        <p className="font-display flex-1 text-lg font-semibold leading-snug text-slate-700 sm:text-xl">{narrationText}</p>
        {ready && (
          <button
            type="button"
            onClick={replay}
            aria-label="Կրկնել"
            className="shrink-0 rounded-full bg-indigo-100 p-3 text-xl text-indigo-600 transition-transform hover:scale-110 active:scale-95"
          >
            🔊
          </button>
        )}
      </div>

      {(ready || failed) && (
        <button
          type="button"
          onClick={onEnded}
          className="absolute bottom-20 right-4 rounded-full bg-black/30 px-4 py-2 font-display text-sm font-bold text-white backdrop-blur transition hover:bg-black/45 sm:bottom-24"
        >
          {t("nav.skip")}
        </button>
      )}
    </div>
  );
}
