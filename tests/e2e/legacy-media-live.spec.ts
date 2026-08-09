import { expect, test } from "@playwright/test";

const legacyStoryId = process.env.TEST_LEGACY_READY_STORY_ID?.trim();

test("plays a completed schema 1.0 story with native media on both paths", async ({ page }) => {
  test.skip(!legacyStoryId, "Set TEST_LEGACY_READY_STORY_ID to exercise stored provider media.");
  const storyId = legacyStoryId!;
  expect(storyId).toMatch(/^[0-9a-f-]{36}$/i);

  const selectedStoryResponse = await page.request.get(`/api/stories/${storyId}`);
  expect(selectedStoryResponse.status()).toBe(200);
  const selectedStoryPayload = await selectedStoryResponse.json();
  expect(selectedStoryPayload.story?.id).toBe(storyId);

  await page.addInitScript(() => localStorage.clear());
  await page.route(/\/api\/stories$/, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(selectedStoryPayload),
    });
  });
  await page.goto("/");

  await expect(page.getByText("A completed story is ready")).toBeVisible();
  await page.getByRole("button", { name: "Play story" }).click();
  await expect(page.getByRole("button", { name: /Start story/ })).toBeVisible();

  const videos = page.locator("video.story-clip-video");
  await expect(videos).toHaveCount(4);
  await expect.poll(async () => videos.evaluateAll((entries) =>
    entries.every((entry) => {
      const video = entry as HTMLVideoElement;
      return video.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(video.duration) && video.duration > 0;
    }),
  ), { timeout: 30_000 }).toBe(true);

  async function expectNativePauseResume() {
    const visible = page.locator("video.visible");
    await expect(visible).toHaveAttribute("aria-label", /Now playing/);
    await expect.poll(() => visible.evaluate((entry) => (entry as HTMLVideoElement).currentTime), { timeout: 10_000 })
      .toBeGreaterThan(0.1);
    const beforePause = await visible.evaluate((entry) => {
      const video = entry as HTMLVideoElement;
      video.pause();
      return video.currentTime;
    });
    await page.waitForTimeout(500);
    const whilePaused = await visible.evaluate((entry) => (entry as HTMLVideoElement).currentTime);
    expect(Math.abs(whilePaused - beforePause)).toBeLessThan(0.15);
    await visible.evaluate((entry) => (entry as HTMLVideoElement).play());
    await expect.poll(() => visible.evaluate((entry) => (entry as HTMLVideoElement).currentTime), { timeout: 10_000 })
      .toBeGreaterThan(whilePaused + 0.1);
  }

  await page.getByRole("button", { name: /Start story/ }).click();
  await expect(page.getByText("Now playing")).toBeVisible();
  await expectNativePauseResume();
  await page.locator("video.visible").dispatchEvent("ended");

  const decisionButtons = page.locator(".decision-overlay button");
  await expect(decisionButtons).toHaveCount(2);
  await decisionButtons.first().click();
  await expect(page.locator("video.visible")).toHaveAttribute("src", new RegExp(`/api/stories/${storyId}/clips/positive$`));
  await expectNativePauseResume();
  await page.locator("video.visible").dispatchEvent("ended");
  await expect(page.locator("video.visible")).toHaveAttribute("src", new RegExp(`/api/stories/${storyId}/clips/ending$`));
  await expectNativePauseResume();
  await page.locator("video.visible").dispatchEvent("ended");
  await expect(page.getByRole("dialog", { name: "Story complete" })).toBeVisible();

  await page.getByRole("button", { name: /Try the other path/ }).click();
  await expect(page.locator("video.visible")).toHaveAttribute("src", new RegExp(`/api/stories/${storyId}/clips/opening$`));
  await page.locator("video.visible").dispatchEvent("ended");
  await decisionButtons.nth(1).click();
  await expect(page.locator("video.visible")).toHaveAttribute("src", new RegExp(`/api/stories/${storyId}/clips/negative$`));
  await expectNativePauseResume();
  await page.locator("video.visible").dispatchEvent("ended");
  await expect(page.locator("video.visible")).toHaveAttribute("src", new RegExp(`/api/stories/${storyId}/clips/ending$`));
  await expectNativePauseResume();
  await page.locator("video.visible").dispatchEvent("ended");
  await expect(page.getByRole("dialog", { name: "Story complete" })).toBeVisible();
});

test("offers a fresh compile for an unfinished legacy story without polling it", async ({ page }) => {
  const brief = {
    lesson: "Sharing tools helps friends solve a problem together.",
    characterPairId: "pip-momo",
    settingId: "riverside-garden",
    ageBand: "6-8",
    language: "Armenian",
  };
  const plan = {
    title: "The older garden story",
    parentSummary: "An older story that needs the current compiler.",
    childIntro: "Two friends are preparing their garden together.",
    choiceQuestion: "Should they share the garden scoop?",
    positiveChoice: { label: "Share it", explanation: "Both friends can help." },
    negativeChoice: { label: "Keep it", explanation: "One friend tries alone." },
    continuitySeed: 42,
    clips: ["opening", "positive", "negative", "ending"].map((id) => ({
      id,
      title: `${id} clip`,
      summary: `${id} summary`,
      caption: `${id} caption`,
      prompt: "Legacy provider prompt. ".repeat(30),
      extensions: id === "positive" || id === "negative"
        ? [
            { prompt: "Legacy extension prompt. ".repeat(30), caption: "First extension" },
            { prompt: "Legacy extension prompt. ".repeat(30), caption: "Second extension" },
          ]
        : [],
    })),
  };
  let pollRequests = 0;

  await page.addInitScript(() => localStorage.clear());
  await page.route(/\/api\/stories\/[^/]+$/, async (route) => {
    pollRequests += 1;
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Legacy polling must not start." }) });
  });
  await page.route(/\/api\/stories$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        story: {
          id: "44444444-4444-4444-8444-444444444444",
          status: "partial",
          createdAt: Date.now(),
          plan,
          brief,
          compatibility: {
            mode: "recompile_required",
            sourceSchemaVersion: "1.0",
            targetSchemaVersion: "1.1",
            providerActionsAllowed: false,
          },
          clips: ["opening", "positive", "negative", "ending"].map((slot) => ({
            slot,
            status: "failed",
            extensionCount: 0,
            error: "Old compiler",
            mediaUrl: null,
          })),
        },
      }),
    });
  });

  await page.goto("/");
  await expect(page.getByText("An older story needs rebuilding")).toBeVisible();
  await page.getByRole("button", { name: "Use this brief again" }).click();
  await expect(page.getByRole("heading", { name: "Build the story brief" })).toBeVisible();
  await expect(page.getByLabel("What should your child learn?")).toHaveValue(brief.lesson);
  expect(pollRequests).toBe(0);
});
