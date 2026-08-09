import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

interface LoadingSceneProps {
  label?: string;
  /** When given, rotates through these messages every ~2.8s instead of showing a static label. */
  labels?: string[];
}

export function LoadingScene({ label, labels }: LoadingSceneProps) {
  const messages = labels && labels.length > 0 ? labels : [label ?? ""];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (messages.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % messages.length), 2800);
    return () => clearInterval(id);
  }, [messages.length]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <motion.span
        className="text-7xl"
        animate={{ rotate: [0, -10, 10, -10, 0], y: [0, -10, 0] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      >
        🪄
      </motion.span>
      <AnimatePresence mode="wait">
        <motion.p
          key={index}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3 }}
          className="text-center font-display text-xl font-bold text-slate-600"
        >
          {messages[index]}
        </motion.p>
      </AnimatePresence>
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-3 w-3 rounded-full bg-indigo-400"
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}
