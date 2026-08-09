import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useSessionStore } from "../store/sessionStore";
import { useTranslation } from "../i18n";

const FLOATERS = [
  { emoji: "🦁", top: "12%", left: "8%", delay: 0 },
  { emoji: "🚀", top: "18%", left: "82%", delay: 0.4 },
  { emoji: "🌈", top: "68%", left: "10%", delay: 0.8 },
  { emoji: "🐬", top: "72%", left: "80%", delay: 1.2 },
  { emoji: "✨", top: "40%", left: "4%", delay: 0.2 },
  { emoji: "🌟", top: "45%", left: "92%", delay: 0.6 },
];

export function HomePage() {
  const navigate = useNavigate();
  const resetAll = useSessionStore((s) => s.resetAll);
  const { t } = useTranslation();

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
      {FLOATERS.map((f, i) => (
        <span
          key={i}
          aria-hidden
          className="pointer-events-none absolute select-none text-5xl opacity-50 animate-float-slow sm:text-6xl"
          style={{ top: f.top, left: f.left, animationDelay: `${f.delay}s` }}
        >
          {f.emoji}
        </span>
      ))}

      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 16 }}
        className="relative z-10"
      >
        <span className="text-7xl sm:text-8xl" aria-hidden>
          📖✨
        </span>
        <h1 className="mt-4 font-display text-5xl font-extrabold text-slate-700 drop-shadow-sm sm:text-6xl">
          {t("app.title")}
        </h1>
        <p className="mx-auto mt-3 max-w-md font-body text-lg font-semibold text-slate-500 sm:text-xl">
          {t("app.tagline")}
        </p>

        <motion.button
          type="button"
          onClick={() => {
            resetAll();
            navigate("/lesson");
          }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.94 }}
          animate={{ y: [0, -8, 0] }}
          transition={{ y: { duration: 1.8, repeat: Infinity, ease: "easeInOut" } }}
          className="mt-10 rounded-full bg-gradient-to-r from-orange-400 to-pink-500 px-12 py-6 font-display text-2xl font-extrabold text-white shadow-xl shadow-pink-500/30"
        >
          {t("home.cta")}
        </motion.button>
      </motion.div>
    </div>
  );
}
