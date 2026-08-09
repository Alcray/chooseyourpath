import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { SceneJob } from "../api/types";

const POLL_INTERVAL_MS = 3000;

// Requests generation for (storyId, sceneId) and polls until the scene's
// video/illustration is ready. Backed by the server's content-addressed
// cache, so re-requesting a scene that's already been generated (e.g. the
// "what if I chose differently?" replay) resolves immediately.
export function useSceneAsset(storyId: string | null, sceneId: string | null) {
  const [job, setJob] = useState<SceneJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!storyId || !sceneId) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    setJob(null);
    setError(null);

    api
      .requestSceneVideo({ storyId, sceneId })
      .then((initial) => {
        if (cancelled) return;
        setJob(initial);
        if (initial.status === "ready" || initial.status === "error") return;

        pollTimer = setInterval(async () => {
          try {
            const next = await api.getSceneStatus(initial.sceneKey);
            if (cancelled) return;
            setJob(next);
            if (next.status === "ready" || next.status === "error") {
              clearInterval(pollTimer);
            }
          } catch {
            // transient network hiccup — keep polling, don't surface to the child
          }
        }, POLL_INTERVAL_MS);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? "Failed to start scene generation");
      });

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [storyId, sceneId]);

  return { job, error };
}

/** Fire-and-forget generation kickoff, used to prefetch both branches while the child is deciding. */
export function prefetchScene(storyId: string, sceneId: string) {
  api.requestSceneVideo({ storyId, sceneId }).catch(() => {});
}
