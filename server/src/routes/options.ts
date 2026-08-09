import { Router } from "express";
import { CHARACTERS, LESSONS, SETTINGS } from "../data/options.js";

export const optionsRouter = Router();

optionsRouter.get("/", (_req, res) => {
  res.json({ lessons: LESSONS, characters: CHARACTERS, settings: SETTINGS });
});
