import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { StoryProgress } from "../api/types";

const POLL_INTERVAL_MS = 3000;

// Polls whole-story generation progress (every scene, both branches — see
// server/src/routes/story.ts's pregenerateAllScenes) so the player can wait
// for everything to be ready before starting playback, instead of hitting a
// per-scene wait later (e.g. right after the child makes a decision).
// "Done" means every scene has settled — ready OR errored — so a single
// failed clip can't strand the child on this screen forever.
export function useStoryProgress(storyId: string | null) {
  const [progress, setProgress] = useState<StoryProgress | null>(null);

  useEffect(() => {
    if (!storyId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const poll = async () => {
      try {
        const p = await api.getStoryProgress(storyId);
        if (cancelled) return;
        setProgress(p);
        if (p.ready + p.errored >= p.total && timer) clearInterval(timer);
      } catch {
        // transient network hiccup — keep polling, don't surface to the child
      }
    };

    poll();
    timer = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [storyId]);

  const done = progress ? progress.ready + progress.errored >= progress.total : false;
  return { progress, done };
}
