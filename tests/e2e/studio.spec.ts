import { expect, test } from "@playwright/test";
import compiledFixture from "../fixtures/compiled-story-input.json" with { type: "json" };

const sourceStoryId = process.env.TEST_MEDIA_STORY_ID ?? "";

test("creates, tracks, and plays both branches without replacing video elements", async ({ page }) => {
  expect(sourceStoryId).toMatch(/^[0-9a-f-]{36}$/i);
  const narratorSetup = "Երկու կենդանիները միասին խաղում են։ Հետո նրանց մոտ է գալիս մի նապաստակ․ նա մոլորված ու անհանգիստ տեսք ունի։";
  const clips = (["opening", "positive", "negative", "ending"] as const).map((id) => {
    const clipShots = compiledFixture.shots.filter((shot) => shot.clipId === id).sort((a, b) => a.segmentIndex - b.segmentIndex);
    return {
      id,
      title: id === "opening" ? "Adventure setup" : id === "positive" ? "Share the scoop" : id === "negative" ? "Keep it and hurry" : "Shared ending",
      summary: clipShots.map((shot) => shot.timedBeats.join(" ")).join(" "),
      prompt: "Canon-locked test render prompt. ".repeat(20),
      caption: clipShots[0].spokenText,
      extensions: clipShots.slice(1).map((shot) => ({
        prompt: "Canon-locked extension prompt. ".repeat(20),
        caption: shot.spokenText,
      })),
    };
  });
  const plan = {
    title: compiledFixture.title,
    parentSummary: compiledFixture.parentSummary,
    childIntro: narratorSetup,
    choiceQuestion: compiledFixture.graph.choice.question,
    positiveChoice: {
      label: compiledFixture.graph.choice.options[0].childText,
      explanation: compiledFixture.graph.choice.options[0].explanation,
    },
    negativeChoice: {
      label: compiledFixture.graph.choice.options[1].childText,
      explanation: compiledFixture.graph.choice.options[1].explanation,
    },
    continuitySeed: compiledFixture.continuitySeed,
    clips,
    compiler: {
      schemaVersion: "1.0" as const,
      promptVersion: "branching-compiler-v1" as const,
      model: "gemini-3.5-flash-lite",
      compiledAt: Date.now(),
      stages: ["policy", "premises", "story_graph", "independent_review", "shot_manifest"].map((id) => ({ id, status: "passed" as const })),
    },
    moralSpec: compiledFixture.moralSpec,
    premiseCandidates: compiledFixture.premiseCandidates,
    selectedPremiseId: compiledFixture.selectedPremiseId,
    canon: compiledFixture.canon,
    graph: compiledFixture.graph,
    shots: compiledFixture.shots,
    validation: {
      valid: true,
      checks: Array.from({ length: 15 }, (_, index) => ({ id: `check_${index}`, label: `Check ${index}`, passed: true, detail: "Golden fixture passed." })),
      semanticReview: compiledFixture.semanticReview,
    },
  };
  const brief = {
    lesson: compiledFixture.moralSpec.sourceLesson,
    characterPairId: "pip-momo",
    settingId: "riverside-garden",
    ageBand: "6-8",
    language: "Armenian",
  };
  const uiStoryId = "11111111-1111-4111-8111-111111111111";
  let statusRequests = 0;

  await page.addInitScript(() => {
    window.addEventListener("error", (event) => {
      if (event.target instanceof HTMLMediaElement) event.stopImmediatePropagation();
    }, true);
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function play() {
        this.setAttribute("data-e2e-playing", "true");
        queueMicrotask(() => this.dispatchEvent(new Event("playing")));
        return Promise.resolve();
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: function pause() {
        this.setAttribute("data-e2e-playing", "false");
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "load", {
      configurable: true,
      value: function load() {
        queueMicrotask(() => {
          this.dispatchEvent(new Event("loadedmetadata"));
          this.dispatchEvent(new Event("loadeddata"));
          this.dispatchEvent(new Event("canplay"));
        });
      },
    });
  });

  await page.route("**/api/plan", async (route) => {
    expect(route.request().method()).toBe("POST");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ blueprintId: "22222222-2222-4222-8222-222222222222", plan }),
    });
  });

  await page.route(/\/api\/stories$/, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ story: null }) });
      return;
    }
    const requestBody = route.request().postDataJSON() as { blueprintId: string; idempotencyKey: string };
    expect(requestBody.blueprintId).toBe("22222222-2222-4222-8222-222222222222");
    expect(requestBody.idempotencyKey.length).toBeGreaterThanOrEqual(8);
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        story: {
          id: uiStoryId,
          status: "rendering",
          createdAt: Date.now(),
          plan,
          brief,
          clips: plan.clips.map((clip) => ({
            slot: clip.id,
            status: "rendering",
            extensionCount: 0,
            error: null,
            mediaUrl: null,
          })),
        },
      }),
    });
  });

  await page.route(`**/api/stories/${uiStoryId}`, async (route) => {
    statusRequests += 1;
    if (statusRequests > 1) await new Promise((resolve) => setTimeout(resolve, 1_500));
    const ready = statusRequests > 1;
    const states = ready
      ? {
          opening: ["ready", 0],
          positive: ["ready", 2],
          negative: ["ready", 2],
          ending: ["ready", 0],
        }
      : {
          opening: ["ready", 0],
          positive: ["rendering", 1],
          negative: ["extending", 1],
          ending: ["ready", 0],
        };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        story: {
          id: uiStoryId,
          status: ready ? "ready" : "rendering",
          createdAt: Date.now(),
          plan,
          brief,
          clips: plan.clips.map((clip) => {
            const [status, extensionCount] = states[clip.id as keyof typeof states];
            return {
              slot: clip.id,
              status,
              extensionCount,
              error: null,
              mediaUrl: ready ? `/api/stories/${sourceStoryId}/clips/${clip.id}` : null,
            };
          }),
        },
      }),
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Build the story brief" })).toBeVisible();
  await page.waitForFunction(() => {
    const button = document.querySelector("button.main-action");
    return Boolean(button && Object.keys(button).some((key) => key.startsWith("__reactProps")));
  });
  await page.getByLabel("What should your child learn?").fill("Sharing helps friends solve problems together.");
  await expect(page.getByLabel("What should your child learn?")).toHaveValue("Sharing helps friends solve problems together.");
  await page.getByLabel("World").selectOption("riverside-garden");
  await page.getByRole("button", { name: /Create story blueprint/ }).click();

  await expect(page.getByRole("heading", { name: plan.title, level: 1 })).toBeVisible();
  await expect(page.getByText("Selected adventure premise")).toBeVisible();
  await expect(page.getByRole("heading", { name: "The Garden Waterwheel", level: 2 })).toBeVisible();
  await expect(page.getByText("ALLOW", { exact: true })).toBeVisible();
  await expect(page.getByText("15/15", { exact: false })).toBeVisible();
  await expect(page.getByText("Both paths rejoin safely")).toBeVisible();
  await expect(page.getByText("compiled into 8 canon-locked segments", { exact: false })).toBeVisible();
  await page.screenshot({ path: "/tmp/kindpath-compiler-approval-e2e.png", fullPage: true });
  await page.getByRole("button", { name: /Generate all four clips/ }).click();

  const stageProgress = page.getByRole("progressbar", { name: "Generation stages completed" });
  await expect(stageProgress).toHaveAttribute("aria-valuemax", "8");
  await expect(page.getByText("2 of 4 clips ready")).toBeVisible();
  await expect(page.getByText("Extending the consequence · step 2 of 3").first()).toBeVisible();

  await expect(page.getByRole("button", { name: /Start story/ })).toBeVisible();
  const videos = page.locator("video.story-clip-video");
  await expect(videos).toHaveCount(4);
  await videos.evaluateAll((elements) => elements.forEach((element, index) => {
    element.setAttribute("data-e2e-node", `persistent-${index}`);
  }));
  await expect(page.locator(".narrator-intro")).toHaveText(narratorSetup);
  await expect(page.locator(".playback-route span.active")).toHaveText("00");
  await page.screenshot({ path: "/tmp/kindpath-narrator-e2e.png", fullPage: true });

  async function pauseAndResumeVisibleClip() {
    const visibleVideo = page.locator("video.visible");
    await expect(visibleVideo).toHaveAttribute("data-e2e-playing", "true");
    await visibleVideo.evaluate((element) => (element as HTMLVideoElement).pause());
    await expect(visibleVideo).toHaveAttribute("data-e2e-playing", "false");
    await visibleVideo.evaluate((element) => (element as HTMLVideoElement).play());
    await page.waitForTimeout(50);
    await expect(visibleVideo).toHaveAttribute("data-e2e-playing", "true");
  }

  await page.getByRole("button", { name: /Start story/ }).click();
  await expect(page.getByText("Now playing")).toBeVisible();
  await expect(page.locator(".playback-route span.active")).toHaveText("01");
  await pauseAndResumeVisibleClip();
  await page.locator("video.visible").dispatchEvent("ended");
  await expect(page.locator(".decision-overlay")).toBeVisible();

  await page.getByRole("button", { name: plan.positiveChoice.label }).click();
  await expect(page.locator("video.visible")).toHaveAttribute("src", new RegExp("/positive$"));
  await pauseAndResumeVisibleClip();
  await page.locator("video.visible").dispatchEvent("ended");
  await expect(page.locator("video.visible")).toHaveAttribute("src", new RegExp("/ending$"));
  await pauseAndResumeVisibleClip();
  await page.locator("video.visible").dispatchEvent("ended");
  await expect(page.getByRole("dialog", { name: "Story complete" })).toBeVisible();

  await page.getByRole("button", { name: /Try the other path/ }).click();
  await expect(page.locator("video.visible")).toHaveAttribute("src", new RegExp("/opening$"));
  await page.locator("video.visible").dispatchEvent("ended");
  await page.getByRole("button", { name: plan.negativeChoice.label }).click();
  await expect(page.locator("video.visible")).toHaveAttribute("src", new RegExp("/negative$"));
  await pauseAndResumeVisibleClip();
  await page.locator("video.visible").dispatchEvent("ended");
  await expect(page.locator("video.visible")).toHaveAttribute("src", new RegExp("/ending$"));
  await page.locator("video.visible").dispatchEvent("ended");
  await expect(page.getByRole("dialog", { name: "Story complete" })).toBeVisible();

  await expect(videos).toHaveCount(4);
  await expect(page.locator('video[data-e2e-node^="persistent-"]')).toHaveCount(4);
  await page.screenshot({ path: "/tmp/kindpath-ui-e2e.png", fullPage: true });
});
