import { motion } from "framer-motion";

export function StarRating({ stars }: { stars: 1 | 2 | 3 }) {
  return (
    <div className="flex justify-center gap-2">
      {[1, 2, 3].map((n) => (
        <motion.span
          key={n}
          className="text-5xl sm:text-6xl"
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: n * 0.2, type: "spring", stiffness: 300, damping: 12 }}
          aria-hidden
        >
          {n <= stars ? "⭐" : "☆"}
        </motion.span>
      ))}
    </div>
  );
}
