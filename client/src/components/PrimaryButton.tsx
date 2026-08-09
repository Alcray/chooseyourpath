import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface PrimaryButtonProps {
  children: ReactNode;
  onClick: () => void;
  className?: string;
}

export function PrimaryButton({ children, onClick, className = "" }: PrimaryButtonProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={`rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-8 py-4 font-display text-lg font-bold text-white shadow-lg shadow-indigo-500/30 transition hover:shadow-xl ${className}`}
    >
      {children}
    </motion.button>
  );
}
