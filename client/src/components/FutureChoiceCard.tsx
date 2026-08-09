import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface FutureChoiceCardProps {
  imageUrl?: string;
  icon: string;
  label: string;
  description: string;
  color: string;
  onClick: () => void;
  index: number;
}

// Moral decisions are intentionally image-only for pre-readers. The text is
// retained as an accessible name for assistive technology but never rendered
// visibly inside the choice.
export function FutureChoiceCard({ imageUrl, icon, label, description, color, onClick, index }: FutureChoiceCardProps) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [imageUrl]);

  const showImage = Boolean(imageUrl && !imageFailed);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={`${label}. ${description}`}
      initial={{ opacity: 0, y: 24, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.1, type: "spring", stiffness: 240, damping: 20 }}
      whileHover={{ scale: 1.035, rotate: index === 0 ? -1 : 1 }}
      whileTap={{ scale: 0.96 }}
      className="group relative aspect-[4/3] w-full overflow-hidden rounded-[2rem] bg-white shadow-xl shadow-black/15 ring-4 ring-white/60 focus:outline-none focus-visible:ring-8 focus-visible:ring-indigo-300"
    >
      {showImage ? (
        <img
          src={imageUrl}
          alt=""
          aria-hidden
          onError={() => setImageFailed(true)}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
      ) : (
        <span className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${color}`} aria-hidden>
          <span className="text-[7rem] drop-shadow-xl sm:text-[9rem]">{icon}</span>
        </span>
      )}

      <span className="pointer-events-none absolute inset-0 rounded-[2rem] ring-1 ring-inset ring-black/10" aria-hidden />
      <span className="pointer-events-none absolute bottom-4 right-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-4xl shadow-lg backdrop-blur sm:h-20 sm:w-20 sm:text-5xl" aria-hidden>
        {icon}
      </span>
    </motion.button>
  );
}
