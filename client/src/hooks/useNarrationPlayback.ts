import { useEffect, useRef } from "react";

// Drives "when does this scene end" for the story player. Tries, in order:
// generated Armenian narration audio (mp3 from the backend TTS layer) →
// the browser's built-in speech synthesis (hy-AM) → a fixed reading-time
// timer if neither is available. Whichever source is used, `onEnded` fires
// exactly once when it finishes, which is what lets the player auto-advance
// without the child needing to tap anything (see StoryPage).
//
// A safety-net timeout (based on reading time) always runs alongside the
// primary source and is the ONLY thing wired to error events — some
// browsers/OSes expose speechSynthesis but immediately error (no installed
// voice, autoplay policy, etc.) or hang without ever firing `onend`. Firing
// onEnded straight from an error event would flash the scene past the child
// before they can read it; falling back to the reading-time timer instead
// keeps pacing sane while still guaranteeing forward progress.
export function useNarrationPlayback(active: boolean, playKey: string, text: string, audioUrl: string | null | undefined, onEnded: () => void) {
  const replayRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const cleanupFns: (() => void)[] = [];

    const fireOnce = (() => {
      let fired = false;
      return () => {
        if (fired || cancelled) return;
        fired = true;
        onEnded();
      };
    })();

    const safetyMs = Math.max(6000, text.length * 140);
    const safetyTimer = setTimeout(fireOnce, safetyMs);
    cleanupFns.push(() => clearTimeout(safetyTimer));

    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.addEventListener("ended", fireOnce);
      // No error listener here on purpose — a broken audio file falls back to
      // the safety timer above rather than ending the scene instantly.
      audio.play().catch(() => {
        // autoplay can be blocked before any user gesture; the safety timer / skip button cover this
      });
      replayRef.current = () => {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      };
      cleanupFns.push(() => {
        audio.removeEventListener("ended", fireOnce);
        audio.pause();
      });
    } else if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const speak = () => {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = "hy-AM";
        utter.rate = 0.95;
        utter.pitch = 1.15;
        utter.onend = fireOnce;
        // No onerror handler here either, for the same reason — fall back to
        // the safety timer's reading-time duration instead of an instant skip.
        window.speechSynthesis.speak(utter);
      };
      speak();
      replayRef.current = speak;
      cleanupFns.push(() => window.speechSynthesis.cancel());
    } else {
      const ms = Math.max(3000, text.length * 90);
      const id = setTimeout(fireOnce, ms);
      replayRef.current = () => {};
      cleanupFns.push(() => clearTimeout(id));
    }

    return () => {
      cancelled = true;
      cleanupFns.forEach((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, playKey]);

  return { replay: () => replayRef.current() };
}
