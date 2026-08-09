import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "../i18n";

interface PageShellProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: ReactNode;
  step?: { current: number; total: number };
}

const FLOATERS = ["⭐", "🌈", "☁️", "✨"];

export function PageShell({ title, subtitle, onBack, children, step }: PageShellProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-hidden px-4 py-8 sm:px-8">
      {FLOATERS.map((emoji, i) => (
        <span
          key={i}
          aria-hidden
          className="pointer-events-none absolute select-none opacity-40 animate-float-slow"
          style={{
            left: `${10 + i * 25}%`,
            top: `${5 + (i % 2) * 70}%`,
            fontSize: "2.5rem",
            animationDelay: `${i * 0.6}s`,
          }}
        >
          {emoji}
        </span>
      ))}

      <div className="relative z-10 flex w-full max-w-3xl items-center justify-between">
        <button
          type="button"
          onClick={onBack ?? (() => navigate(-1))}
          className="rounded-full bg-white/80 px-4 py-2 font-display font-bold text-slate-500 shadow transition hover:scale-105 hover:bg-white"
        >
          ← {t("nav.back")}
        </button>
        {step && (
          <div className="flex gap-2">
            {Array.from({ length: step.total }).map((_, i) => (
              <span
                key={i}
                className={`h-2.5 w-2.5 rounded-full ${i < step.current ? "bg-indigo-500" : "bg-white/70"}`}
              />
            ))}
          </div>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 mt-4 text-center"
      >
        <h1 className="font-display text-3xl font-extrabold text-slate-700 drop-shadow-sm sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 font-body text-base font-semibold text-slate-500 sm:text-lg">{subtitle}</p>}
      </motion.div>

      <div className="relative z-10 mt-8 w-full max-w-3xl flex-1">{children}</div>
    </div>
  );
}
