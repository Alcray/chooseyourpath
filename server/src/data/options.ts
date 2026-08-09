import type { CharacterOption, Lesson, SettingOption } from "../types/story.js";

// Shared art direction reused in every character's Veo prompt so the whole app
// feels like one consistent cartoon, no matter which hero/lesson/setting is picked.
export const SHARED_ANIMATION_STYLE =
  "soft, colorful 3D animated children's cartoon style, rounded friendly character shapes, " +
  "warm gentle lighting, vibrant pastel color palette, smooth Pixar-like rendering, gentle and calm camera movement";

export const LESSONS: Lesson[] = [
  {
    id: "honesty",
    name: "Ազնվություն",
    icon: "🤥",
    color: "from-sky-400 to-blue-500",
    description: "Ասել ճշմարտությունը, նույնիսկ երբ դժվար է",
  },
  {
    id: "kindness",
    name: "Բարություն",
    icon: "💛",
    color: "from-amber-300 to-orange-400",
    description: "Քնքուշ ու հոգատար լինել ուրիշների հետ",
  },
  {
    id: "sharing",
    name: "Կիսվելը",
    icon: "🤝",
    color: "from-emerald-400 to-teal-500",
    description: "Կիսվել ու հերթով խաղալ ընկերների հետ",
  },
  {
    id: "courage",
    name: "Խիզախություն",
    icon: "🦁",
    color: "from-rose-400 to-red-500",
    description: "Խիզախ լինել, նույնիսկ երբ վախենում ես",
  },
  {
    id: "patience",
    name: "Համբերություն",
    icon: "⏳",
    color: "from-violet-400 to-purple-500",
    description: "Հանգիստ սպասել ու չհանձնվել",
  },
  {
    id: "teamwork",
    name: "Համագործակցություն",
    icon: "🧩",
    color: "from-cyan-400 to-sky-500",
    description: "Միասին աշխատել՝ խնդիրները լուծելու համար",
  },
];

export const CHARACTERS: CharacterOption[] = [
  {
    id: "leo",
    name: "Լեո",
    nameDef: "Լեոն",
    nameGen: "Լեոյի",
    emoji: "🦁",
    color: "from-amber-300 to-yellow-500",
    bible: {
      species: "lion cub",
      appearance: "a small, round-faced lion cub with a fluffy golden mane and big round eyes",
      clothing: "wears a red bandana tied around the neck",
      personality: "curious, friendly and kind",
      style: SHARED_ANIMATION_STYLE,
    },
  },
  {
    id: "robo",
    name: "Ռոբո",
    nameDef: "Ռոբոն",
    nameGen: "Ռոբոյի",
    emoji: "🤖",
    color: "from-slate-300 to-slate-500",
    bible: {
      species: "small robot",
      appearance: "a small friendly robot with a round teal head, big glowing blue eyes, and a rounded metallic body",
      clothing: "no clothing, has a tiny antenna with a glowing yellow tip",
      personality: "gentle, curious and a little clumsy",
      style: SHARED_ANIMATION_STYLE,
    },
  },
  {
    id: "luna",
    name: "Լունա",
    nameDef: "Լունան",
    nameGen: "Լունայի",
    emoji: "🦊",
    color: "from-orange-300 to-orange-500",
    bible: {
      species: "fox cub",
      appearance: "a small orange fox cub with a white-tipped fluffy tail and bright amber eyes",
      clothing: "wears a tiny green scarf",
      personality: "clever, playful and warm-hearted",
      style: SHARED_ANIMATION_STYLE,
    },
  },
  {
    id: "splash",
    name: "Ալիք",
    nameDef: "Ալիքը",
    nameGen: "Ալիքի",
    emoji: "🐬",
    color: "from-sky-300 to-blue-500",
    bible: {
      species: "dolphin",
      appearance: "a small friendly blue-grey dolphin with a shiny smooth body and a cheerful smile",
      clothing: "wears a colorful shell necklace",
      personality: "playful, energetic and caring",
      style: SHARED_ANIMATION_STYLE,
    },
  },
  {
    id: "ember",
    name: "Բոց",
    nameDef: "Բոցը",
    nameGen: "Բոցի",
    emoji: "🐲",
    color: "from-emerald-300 to-green-500",
    bible: {
      species: "baby dragon",
      appearance: "a small round green dragon with tiny soft wings and big curious eyes",
      clothing: "wears a little gold collar with a bell",
      personality: "brave, warm and a bit mischievous",
      style: SHARED_ANIMATION_STYLE,
    },
  },
  {
    id: "nova",
    name: "Նունուշ",
    nameDef: "Նունուշը",
    nameGen: "Նունուշի",
    emoji: "🐰",
    color: "from-pink-300 to-fuchsia-500",
    bible: {
      species: "bunny",
      appearance: "a small white bunny with long floppy ears and a fluffy round tail",
      clothing: "wears pink overalls",
      personality: "gentle, cheerful and kind",
      style: SHARED_ANIMATION_STYLE,
    },
  },
];

export const SETTINGS: SettingOption[] = [
  {
    id: "forest",
    name: "Կախարդական անտառ",
    nameLoc: "Կախարդական անտառում",
    emoji: "🌳",
    color: "from-green-400 to-emerald-600",
    decorations: ["🍄", "🦋", "🌸"],
    environment: "a sunlit enchanted forest clearing with tall trees, glowing mushrooms, and butterflies drifting in the air",
  },
  {
    id: "space",
    name: "Տիեզերք",
    nameLoc: "Տիեզերքում",
    emoji: "🚀",
    color: "from-indigo-500 to-purple-700",
    decorations: ["⭐", "🪐", "☄️"],
    environment: "a colorful cartoon outer-space scene with stars, soft floating planets, and gentle sparkling light",
  },
  {
    id: "ocean",
    name: "Կորալային ծով",
    nameLoc: "Կորալային ծովում",
    emoji: "🌊",
    color: "from-cyan-400 to-blue-600",
    decorations: ["🐠", "🐚", "🪸"],
    environment: "a bright coral reef underwater scene with colorful coral, tropical fish, and soft sunbeams filtering through the water",
  },
  {
    id: "kingdom",
    name: "Կախարդական թագավորություն",
    nameLoc: "Կախարդական թագավորությունում",
    emoji: "🏰",
    color: "from-fuchsia-400 to-pink-600",
    decorations: ["👑", "✨", "🎪"],
    environment: "a whimsical magical kingdom with a small colorful castle, fluttering flags, and sparkling confetti in the air",
  },
  {
    id: "jungle",
    name: "Ջունգլիների արահետ",
    nameLoc: "Ջունգլիների արահետում",
    emoji: "🌴",
    color: "from-lime-400 to-green-600",
    decorations: ["🦜", "🐒", "🌺"],
    environment: "a lush green jungle trail with big leafy plants, colorful birds, and dappled sunlight",
  },
  {
    id: "town",
    name: "Հարմարավետ քաղաք",
    nameLoc: "Հարմարավետ քաղաքում",
    emoji: "🏘️",
    color: "from-orange-300 to-rose-500",
    decorations: ["🎈", "🍦", "🚲"],
    environment: "a cozy pastel-colored small town street with round little houses, balloons, and a gentle sunny sky",
  },
];

export function findLesson(id: string) {
  return LESSONS.find((l) => l.id === id);
}
export function findCharacter(id: string) {
  return CHARACTERS.find((c) => c.id === id);
}
export function findSetting(id: string) {
  return SETTINGS.find((s) => s.id === id);
}
