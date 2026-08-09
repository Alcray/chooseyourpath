/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // Lesson/character/setting gradient classes (e.g. "from-amber-300 to-orange-400")
  // come from the server's /api/options response at runtime, so Tailwind's static
  // scanner never sees those literal class strings in this project's source files.
  // Safelist exactly the from-/to- utilities used by the palette in
  // server/src/data/options.ts (plus the couple hard-coded in StoryPage.tsx) so
  // those gradients get generated. Keep this list in sync when adding new
  // lessons/characters/settings with new colors.
  safelist: [
    "from-sky-400", "to-blue-500",
    "from-amber-300", "to-orange-400",
    "from-emerald-400", "to-teal-500",
    "from-rose-400", "to-red-500",
    "from-violet-400", "to-purple-500",
    "from-cyan-400", "to-sky-500",
    "from-amber-300", "to-yellow-500",
    "from-slate-300", "to-slate-500",
    "from-orange-300", "to-orange-500",
    "from-sky-300", "to-blue-500",
    "from-emerald-300", "to-green-500",
    "from-pink-300", "to-fuchsia-500",
    "from-green-400", "to-emerald-600",
    "from-indigo-500", "to-purple-700",
    "from-cyan-400", "to-blue-600",
    "from-fuchsia-400", "to-pink-600",
    "from-lime-400", "to-green-600",
    "from-orange-300", "to-rose-500",
    "from-sky-400", "to-indigo-500",
    "from-fuchsia-400", "to-pink-500",
    "from-amber-400", "to-orange-500",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Noto Sans Armenian has full, correct Armenian glyph coverage (weights
        // 400-900), which display-style Latin fonts like Baloo 2 do not — those
        // silently fall back to the OS default for Armenian text. Using one
        // family for both display/body (different weights) keeps rendering
        // correct on every platform. Latin fallbacks stay for stray punctuation.
        display: ["Noto Sans Armenian", "system-ui", "sans-serif"],
        body: ["Noto Sans Armenian", "system-ui", "sans-serif"],
      },
      animation: {
        "float-slow": "float 4s ease-in-out infinite",
        "bounce-slow": "bounce 2s ease-in-out infinite",
        "sway-slow": "sway 3s ease-in-out infinite",
        "pop-in": "popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-14px)" },
        },
        sway: {
          "0%, 100%": { transform: "rotate(-4deg)" },
          "50%": { transform: "rotate(4deg)" },
        },
        popIn: {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
