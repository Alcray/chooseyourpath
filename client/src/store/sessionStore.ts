import { create } from "zustand";
import type { CharacterOption, Lesson, SettingOption, StoryTree } from "../api/types";

interface SessionState {
  lesson: Lesson | null;
  customLesson: string | null; // mutually exclusive with `lesson` — a parent-written free-text lesson
  character: CharacterOption | null;
  setting: SettingOption | null;
  story: StoryTree | null;
  chosenChoiceId: string | null;
  reflectionOptionId: string | null;

  setLesson: (lesson: Lesson) => void;
  setCustomLesson: (text: string) => void;
  setCharacter: (character: CharacterOption) => void;
  setSetting: (setting: SettingOption) => void;
  setStory: (story: StoryTree) => void;
  setChoice: (choiceId: string | null) => void;
  setReflection: (optionId: string | null) => void;
  resetStory: () => void;
  resetAll: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  lesson: null,
  customLesson: null,
  character: null,
  setting: null,
  story: null,
  chosenChoiceId: null,
  reflectionOptionId: null,

  setLesson: (lesson) => set({ lesson, customLesson: null }),
  setCustomLesson: (text) => set({ customLesson: text, lesson: null }),
  setCharacter: (character) => set({ character }),
  setSetting: (setting) => set({ setting }),
  setStory: (story) => set({ story }),
  setChoice: (choiceId) => set({ chosenChoiceId: choiceId }),
  setReflection: (optionId) => set({ reflectionOptionId: optionId }),
  resetStory: () => set({ story: null, chosenChoiceId: null, reflectionOptionId: null }),
  resetAll: () =>
    set({
      lesson: null,
      customLesson: null,
      character: null,
      setting: null,
      story: null,
      chosenChoiceId: null,
      reflectionOptionId: null,
    }),
}));
