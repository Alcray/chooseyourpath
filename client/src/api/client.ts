import type { OptionsResponse, SceneJob, StoryProgress, StoryTree } from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Request to ${path} failed with ${res.status}`, body.code);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getOptions: () => request<OptionsResponse>("/options"),
  generateStory: (payload: { lessonId?: string; customLesson?: string; characterId: string; settingId: string }) =>
    request<StoryTree>("/story", { method: "POST", body: JSON.stringify(payload) }),
  requestSceneVideo: (payload: { storyId: string; sceneId: string }) =>
    request<SceneJob>("/video/scene", { method: "POST", body: JSON.stringify(payload) }),
  getSceneStatus: (sceneKey: string) => request<SceneJob>(`/video/status/${sceneKey}`),
  getStoryProgress: (storyId: string) => request<StoryProgress>(`/story/${storyId}/progress`),
};
