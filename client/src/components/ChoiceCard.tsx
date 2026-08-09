import { motion } from "framer-motion";

interface ChoiceCardProps {
  icon: string;
  label: string;
  description?: string;
  color?: string; // tailwind gradient classes, e.g. "from-sky-400 to-blue-500"
  onClick: () => void;
  index?: number;
}

// The central "large visual button" used everywhere a child makes a choice:
// picking a lesson/character/setting, deciding what the hero does, and
// answering reflection questions. Big tap target, big icon, minimal text.
export function ChoiceCard({ icon, label, description, color = "from-sky-400 to-indigo-500", onClick, index = 0 }: ChoiceCardProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 24, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.08, type: "spring", stiffness: 260, damping: 20 }}
      whileHover={{ scale: 1.05, rotate: -1 }}
      whileTap={{ scale: 0.95 }}
      className={`group relative flex w-full flex-col items-center gap-3 rounded-[2rem] bg-gradient-to-br ${color} p-6 text-white shadow-lg shadow-black/10 ring-4 ring-white/40 transition-shadow hover:shadow-2xl sm:p-8`}
    >
      <span className="text-6xl drop-shadow-sm sm:text-7xl" aria-hidden>
        {icon}
      </span>
      <span className="font-display text-xl font-bold leading-tight sm:text-2xl">{label}</span>
      {description && <span className="font-body text-sm font-semibold text-white/90 sm:text-base">{description}</span>}
    </motion.button>
  );
}
