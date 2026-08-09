import path from "node:path";
import { existsSync } from "node:fs";
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

// --- Production: serve the built client from this same service ---
// In development the client runs on its own Vite dev server, which proxies
// /api and /generated here (see client/vite.config.ts). In a deployed
// single-service setup (e.g. Render) there is no Vite, so Express serves the
// built SPA itself. Registered AFTER the API routes so it can never shadow them.
const clientDist = process.env.CLIENT_DIST_PATH
  ? path.resolve(process.env.CLIENT_DIST_PATH)
  : path.resolve(process.cwd(), "..", "client", "dist");

if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback: React Router owns /lesson, /character, /story, … so a deep
  // link or refresh on those paths must return index.html rather than 404.
  // Unmatched /api and /generated paths are excluded so a genuine backend 404
  // stays a 404 instead of silently returning the HTML shell.
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/generated/")) return next();
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

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
