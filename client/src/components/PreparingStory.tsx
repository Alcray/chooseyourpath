import { motion } from "framer-motion";
import { LoadingScene } from "./LoadingScene";
import type { StoryProgress } from "../api/types";

interface PreparingStoryProps {
  progress: StoryProgress | null;
  loadingMessages: string[];
}

// Shown once, right after a story is created, while every scene (both
// branches) generates in the background — see pregenerateAllScenes on the
// server. Waiting here means the child never hits a per-scene stall later,
// including right after making a decision. No raw numbers/technical detail
// shown to the child — just a friendly filling progress bar.
export function PreparingStory({ progress, loadingMessages }: PreparingStoryProps) {
  const total = progress?.total ?? 0;
  const settled = progress ? progress.ready + progress.errored : 0;
  const pct = total > 0 ? Math.round((settled / total) * 100) : 5;

  return (
    <div className="flex flex-col items-center gap-6">
      <LoadingScene labels={loadingMessages} />
      <div className="h-4 w-full max-w-xs overflow-hidden rounded-full bg-white/70 shadow-inner">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-orange-400 to-pink-500"
          initial={{ width: "5%" }}
          animate={{ width: `${Math.max(pct, 8)}%` }}
          transition={{ type: "spring", stiffness: 80, damping: 20 }}
        />
      </div>
    </div>
  );
}
