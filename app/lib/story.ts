export const CLIP_IDS = ["opening", "positive", "negative", "ending"] as const;

export type ClipId = (typeof CLIP_IDS)[number];

export type StoryBrief = {
  lesson: string;
  characterPairId: string;
  settingId: string;
  ageBand: string;
  language: string;
};

export type StoryChoice = {
  label: string;
  explanation: string;
};

export type StoryClip = {
  id: ClipId;
  title: string;
  summary: string;
  caption: string;
  prompt: string;
};

export type StoryPlan = {
  title: string;
  parentSummary: string;
  childIntro: string;
  choiceQuestion: string;
  positiveChoice: StoryChoice;
  negativeChoice: StoryChoice;
  continuitySeed: number;
  clips: StoryClip[];
};

export const CHARACTER_PAIRS = [
  {
    id: "pip-momo",
    names: "Pip & Momo",
    emoji: "🦊 🐰",
    tagline: "Curious woodland friends",
    style: "Warm watercolor storybook animation",
    bible:
      "Pip is a small orange fox with a cream muzzle, large kind brown eyes, and a knitted forest-green scarf. Momo is a small sky-blue rabbit with pink inner ears, round dark-blue eyes, and a mustard-yellow vest. Pip is thoughtful and energetic; Momo is gentle and observant. Both have rounded child-friendly proportions.",
  },
  {
    id: "beni-sisi",
    names: "Beni & Sisi",
    emoji: "🐻 🐿️",
    tagline: "Cozy forest neighbors",
    style: "Soft handcrafted clay animation",
    bible:
      "Beni is a small caramel-brown bear cub with a round muzzle, teal-blue overalls, and a tiny cream neckerchief. Sisi is a russet squirrel with a large fluffy tail, bright hazel eyes, and a plum-purple crossbody satchel. Beni is careful and sincere; Sisi is lively and encouraging. Both look like tactile handmade clay figures.",
  },
  {
    id: "olli-dori",
    names: "Olli & Dori",
    emoji: "🦦 🦆",
    tagline: "Playful riverside explorers",
    style: "Bright polished 3D family animation",
    bible:
      "Olli is a small teal-brown otter with a pale belly, expressive green eyes, and a burnt-orange beanie. Dori is a sunny-yellow duckling with an orange bill, a mint-green backpack, and wide dark eyes. Olli is inventive and bold; Dori is patient and warm. Both have clean rounded shapes and soft natural textures.",
  },
] as const;

export const SETTINGS = [
  {
    id: "woodland-picnic",
    name: "Woodland picnic",
    emoji: "🌳",
    bible:
      "A sunlit woodland clearing with a yellow gingham picnic blanket, old oak trees, tiny white flowers, warm afternoon light, and gentle birdsong.",
  },
  {
    id: "village-bakery",
    name: "Cozy village bakery",
    emoji: "🥖",
    bible:
      "A cozy animal village bakery with honey-colored wooden shelves, a round window, flour-dusted counters, warm morning light, and quiet cheerful kitchen sounds.",
  },
  {
    id: "riverside-garden",
    name: "Riverside garden",
    emoji: "🌿",
    bible:
      "A bright riverside community garden with stepping stones, vegetable beds, a tiny wooden bridge, soft moving water, and fresh early-evening light.",
  },
] as const;

export const AGE_BANDS = [
  { id: "3-5", label: "Ages 3–5", guidance: "very simple language, one concrete dilemma" },
  { id: "6-8", label: "Ages 6–8", guidance: "clear cause and effect, emotionally specific language" },
  { id: "9-11", label: "Ages 9–11", guidance: "a nuanced but still binary dilemma, no lecturing" },
] as const;

export const LANGUAGES = [
  { id: "Armenian", label: "Armenian", local: "Հայերեն" },
  { id: "English", label: "English", local: "English" },
] as const;

export function getCharacterPair(id: string) {
  return CHARACTER_PAIRS.find((pair) => pair.id === id) ?? CHARACTER_PAIRS[0];
}

export function getSetting(id: string) {
  return SETTINGS.find((setting) => setting.id === id) ?? SETTINGS[0];
}

export function getAgeBand(id: string) {
  return AGE_BANDS.find((age) => age.id === id) ?? AGE_BANDS[1];
}

export function isClipId(value: unknown): value is ClipId {
  return typeof value === "string" && CLIP_IDS.includes(value as ClipId);
}
