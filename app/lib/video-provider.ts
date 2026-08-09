import {
  decodeBase64Video,
  pollVeoClip,
  startVeoClip,
  startVeoExtension,
  type VeoVideo,
} from "./veo";
import type { VideoReferenceImage } from "./character-references";

export type ProviderVideo = VeoVideo;
export type ProviderPollResult =
  | { done: false; error?: never; video?: never }
  | { done: true; error: string; video?: never }
  | { done: true; error?: never; video: ProviderVideo };

export interface VideoProvider {
  readonly id: "google-veo-3.1";
  start(
    prompt: string,
    seed: number,
    durationSeconds?: 6 | 8,
    references?: ReadonlyArray<VideoReferenceImage>,
  ): Promise<string>;
  extend(video: ProviderVideo, prompt: string): Promise<string>;
  poll(operationName: string): Promise<ProviderPollResult>;
  decode(video: ProviderVideo): Uint8Array;
}

const veoProvider: VideoProvider = {
  id: "google-veo-3.1",
  start: startVeoClip,
  extend: startVeoExtension,
  poll: pollVeoClip,
  decode: (video) => decodeBase64Video(video.base64),
};

export function getVideoProvider(): VideoProvider {
  return veoProvider;
}
