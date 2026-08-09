import {
  getCharacterPair,
  getSetting,
  type StoryBrief,
  type StoryPackage,
} from "./story";

export function storyPackageMatchesBrief(plan: StoryPackage, brief: StoryBrief) {
  const pair = getCharacterPair(brief.characterPairId);
  const setting = getSetting(brief.settingId);
  const expectedNarratorVoiceId = `narrator-${brief.language === "Armenian" ? "hy" : "en"}-warm-v1`;

  return (
    plan.moralSpec.sourceLesson === brief.lesson &&
    plan.moralSpec.ageBand === brief.ageBand &&
    plan.canon.locationId === setting.id &&
    plan.canon.characterBible === pair.bible &&
    plan.canon.locationBible === setting.bible &&
    plan.canon.visualStyle === pair.style &&
    plan.canon.narratorVoiceId === expectedNarratorVoiceId &&
    JSON.stringify(plan.canon.characterIds) === JSON.stringify([...pair.characterIds])
  );
}
