export interface NarrationRequest {
  sceneKey: string;
  textHy: string;
}

// Deliberately independent from VideoGenerator: a provider here only ever
// turns Armenian text into an audio file URL (or null if narration isn't
// available). This is what lets the video and audio layers be swapped out
// independently — e.g. Veo could later add native Armenian speech without
// this interface changing at all.
export interface NarrationProvider {
  readonly name: string;
  /** Returns a stable local audio URL, or null if narration could not be produced. */
  synthesize(req: NarrationRequest): Promise<string | null>;
}
