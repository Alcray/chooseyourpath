import { expect, test } from "@playwright/test";

const sourceBaseUrl = process.env.TEST_MEDIA_BASE_URL ?? "http://127.0.0.1:8787";
const sourceStoryId = process.env.TEST_MEDIA_STORY_ID ?? "";

test("creates, tracks, and plays both branches without replacing video elements", async ({ page }) => {
  expect(sourceStoryId).toMatch(/^[0-9a-f-]{36}$/i);
  const sourceResponse = await fetch(`${sourceBaseUrl}/api/stories/${sourceStoryId}`);
  expect(sourceResponse.status).toBe(200);
  const sourcePayload = await sourceResponse.json() as { story: Record<string, unknown> & { plan: Record<string, unknown>; brief: Record<string, unknown> } };
  const plan = sourcePayload.story.plan as {
    title: string;
    positiveChoice: { label: string };
    negativeChoice: { label: string };
    clips: Array<{ id: string }>;
  };
  const brief = sourcePayload.story.brief;
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

  await expect(page.getByRole("heading", { name: plan.title })).toBeVisible();
  await expect(page.getByText("Each choice path is extended to 20 seconds", { exact: false })).toBeVisible();
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
