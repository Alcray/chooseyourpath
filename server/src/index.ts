import path from "node:path";
import express from "express";
import cors from "cors";
import { optionsRouter } from "./routes/options.js";
import { storyRouter } from "./routes/story.js";
import { videoRouter } from "./routes/video.js";
import { videoGenerator } from "./services/videoGenerator/index.js";
import { narrationGenerator } from "./services/narrationGenerator/index.js";
import { storyAiEnabled } from "./services/storyGenerator/index.js";
import { choiceImageGenerator } from "./services/choiceImageGenerator/index.js";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.use(cors());
app.use(express.json());

// Generated video/audio files (from the Veo + TTS providers) are downloaded
// once and served locally from here — see videoGenerator/providers/veoProvider.ts
// and narrationGenerator/providers/googleTtsProvider.ts.
app.use("/generated", express.static(path.resolve(process.cwd(), "public", "generated")));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    storyAiEnabled,
    videoProvider: videoGenerator.name,
    narrationProvider: narrationGenerator.name,
    choiceImageProvider: choiceImageGenerator.name,
  });
});

app.use("/api/options", optionsRouter);
app.use("/api/story", storyRouter);
app.use("/api/video", videoRouter);

app.listen(PORT, () => {
  console.log(`Moral cartoon server listening on http://localhost:${PORT}`);
  console.log(
    storyAiEnabled
      ? "Story generation: AI-powered, Armenian, with template fallback (custom lessons available)"
      : "Story generation: Armenian template mode (set GEMINI_API_KEY or ANTHROPIC_API_KEY to enable live AI stories + custom lessons)"
  );
  console.log(`Video generation: ${videoGenerator.name}` + (videoGenerator.name === "mock" ? " (set VEO_API_KEY + VEO_PROJECT_ID to enable real video)" : ""));
  console.log(`Narration: ${narrationGenerator.name}` + (narrationGenerator.name === "silent" ? " (set GOOGLE_APPLICATION_CREDENTIALS to enable Armenian narration audio)" : ""));
  console.log(
    `Choice previews: ${choiceImageGenerator.name}` +
      (choiceImageGenerator.name === "disabled" ? " (set VERTEX_API_KEY, or reuse VEO_API_KEY, to enable Nano Banana 2)" : "")
  );
});
