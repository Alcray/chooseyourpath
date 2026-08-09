// Reads a scene's Armenian text aloud using the browser's built-in speech
// synthesis. This is the no-cost fallback narration when the backend TTS
// provider isn't configured (or a scene's generated narration audio failed) —
// see server/src/services/narrationGenerator. No backend or API key needed.
export function SpeakButton({ text }: { text: string }) {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  if (!supported) return null;

  const speak = () => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "hy-AM";
    utterance.rate = 0.95;
    utterance.pitch = 1.15;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <button
      type="button"
      onClick={speak}
      aria-label="Կարդալ բարձրաձայն"
      className="shrink-0 rounded-full bg-indigo-100 p-3 text-xl text-indigo-600 transition-transform hover:scale-110 active:scale-95"
    >
      🔊
    </button>
  );
}
