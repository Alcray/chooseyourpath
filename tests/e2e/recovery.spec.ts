import { expect, test } from "@playwright/test";

const CLIP_IDS = ["opening", "positive", "negative", "ending"] as const;
const STALE_STORY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LATEST_STORY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACTIVE_STORY_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function legacyPlan(title: string) {
  return {
    title,
    parentSummary: `${title} parent summary`,
    childIntro: `${title} narrator setup`,
    choiceQuestion: "What should the friends do?",
    positiveChoice: { label: "Help together", explanation: "Helping makes room for everyone." },
    negativeChoice: { label: "Keep going alone", explanation: "The shortcut leaves a friend out." },
    continuitySeed: 12345,
    clips: CLIP_IDS.map((id) => ({
      id,
      title: `${title} ${id}`,
      summary: `${id} summary`,
      caption: `${id} caption`,
      prompt: "Compatibility playback prompt. ".repeat(20),
      extensions: id === "positive" || id === "negative"
        ? [
            { prompt: "First continuation prompt. ".repeat(20), caption: "First continuation" },
            { prompt: "Second continuation prompt. ".repeat(20), caption: "Second continuation" },
          ]
        : [],
    })),
  };
}

function storyBrief(lesson: string) {
  return {
    lesson,
    characterPairId: "pip-momo",
    settingId: "riverside-garden",
    ageBand: "6-8",
    language: "Armenian",
  };
}

function clipsFor(storyId: string, status: "ready" | "rendering" | "failed", missingMedia?: typeof CLIP_IDS[number]) {
  return CLIP_IDS.map((slot) => ({
    slot,
    status,
    extensionCount: slot === "positive" || slot === "negative" ? 2 : 0,
    error: status === "failed" ? "Test render failed." : null,
    mediaUrl: status === "ready" && slot !== missingMedia
      ? `/api/stories/${storyId}/clips/${slot}`
      : null,
  }));
}

test("newest server recovery replaces a different stale local story and restores its brief accessibly", async ({ page }) => {
  const stalePlan = legacyPlan("Stale cached story");
  const latestPlan = legacyPlan("Latest legacy story");
  const latestBrief = storyBrief("Welcome a lost friend into the game.");

  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: "kindpath-generation",
    value: {
      storyId: STALE_STORY_ID,
      plan: stalePlan,
      brief: storyBrief("Old cached lesson."),
      startedAt: Date.now(),
    },
  });
  await page.route(/\/api\/stories$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        story: {
          id: LATEST_STORY_ID,
          status: "partial",
          createdAt: Date.now(),
          plan: latestPlan,
          brief: latestBrief,
          compatibility: {
            mode: "recompile_required",
            sourceSchemaVersion: null,
            targetSchemaVersion: "1.1",
            providerActionsAllowed: false,
          },
          clips: clipsFor(LATEST_STORY_ID, "failed"),
        },
      }),
    });
  });

  await page.goto("/");
  await expect(page.getByText("An older story needs rebuilding")).toBeVisible();
  await expect(page.getByText(latestPlan.title)).toBeVisible();
  await expect(page.getByText(stalePlan.title)).toHaveCount(0);

  const recompileButton = page.getByRole("button", { name: "Use this brief again" });
  await recompileButton.click();
  const lessonInput = page.getByLabel("What should your child learn?");
  await expect(lessonInput).toHaveValue(latestBrief.lesson);
  await expect(lessonInput).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: "restored and ready to edit" })).toBeVisible();
});

test("structured recompile conflict exits polling and preserves the brief", async ({ page }) => {
  const plan = legacyPlan("Playback record with missing evidence");
  const brief = storyBrief("Share the path when someone is lost.");

  await page.addInitScript(() => localStorage.clear());
  await page.route(/\/api\/stories$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        story: {
          id: LATEST_STORY_ID,
          status: "ready",
          createdAt: Date.now(),
          plan,
          brief,
          compatibility: {
            mode: "playback_only",
            sourceSchemaVersion: null,
            providerActionsAllowed: false,
          },
          clips: clipsFor(LATEST_STORY_ID, "ready"),
        },
      }),
    });
  });
  await page.route(`**/api/stories/${LATEST_STORY_ID}`, async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: "This older unfinished story must be rebuilt with the current compiler.",
        code: "STORY_RECOMPILE_REQUIRED",
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Play story" }).click();

  await expect(page.getByText("An older story needs rebuilding")).toBeVisible();
  const recompileButton = page.getByRole("button", { name: "Use this brief again" });
  await expect(recompileButton).toBeFocused();
  await expect.poll(() => page.evaluate(() => {
    const value = localStorage.getItem("kindpath-generation");
    return value ? JSON.parse(value).compatibility?.mode : null;
  })).toBe("recompile_required");

  await recompileButton.click();
  await expect(page.getByLabel("What should your child learn?")).toHaveValue(brief.lesson);
  await expect(page.getByLabel("What should your child learn?")).toBeFocused();
});

test("four ready rows keep polling until all four media URLs exist", async ({ page }) => {
  const plan = legacyPlan("Incomplete ready media");
  const brief = storyBrief("Make space so everyone can take part.");
  let pollCount = 0;

  await page.addInitScript(() => localStorage.clear());
  await page.route(/\/api\/stories$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        story: {
          id: LATEST_STORY_ID,
          status: "ready",
          createdAt: Date.now(),
          plan,
          brief,
          clips: clipsFor(LATEST_STORY_ID, "ready"),
        },
      }),
    });
  });
  await page.route(`**/api/stories/${LATEST_STORY_ID}`, async (route) => {
    pollCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        story: {
          id: LATEST_STORY_ID,
          status: "ready",
          createdAt: Date.now(),
          plan,
          brief,
          clips: clipsFor(LATEST_STORY_ID, "ready", pollCount === 1 ? "ending" : undefined),
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Play story" }).click();

  await expect(page.getByRole("alert")).toContainText("one or more media files are not available");
  await expect.poll(() => pollCount, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
  await expect(page.locator(".player-heading h1")).toHaveText(plan.title);
});

test("a missing ready-media object remains manually recoverable after automatic polling stops", async ({ page }) => {
  const plan = legacyPlan("Ready rows with unavailable media");
  const brief = storyBrief("Keep helping until everyone can join.");
  let pollCount = 0;

  await page.addInitScript(() => {
    localStorage.clear();
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      nativeSetTimeout(handler, Math.min(timeout ?? 0, 10), ...args)) as typeof window.setTimeout;
  });
  await page.route(/\/api\/stories$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        story: {
          id: LATEST_STORY_ID,
          status: "ready",
          createdAt: Date.now(),
          plan,
          brief,
          clips: clipsFor(LATEST_STORY_ID, "ready", "ending"),
        },
      }),
    });
  });
  await page.route(`**/api/stories/${LATEST_STORY_ID}`, async (route) => {
    pollCount += 1;
    if (pollCount >= 2 && pollCount <= 6) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary status failure." }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        story: {
          id: LATEST_STORY_ID,
          status: "ready",
          createdAt: Date.now(),
          plan,
          brief,
          clips: clipsFor(LATEST_STORY_ID, "ready", pollCount === 1 ? "ending" : undefined),
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Play story" }).click();

  const manualRecovery = page.getByRole("button", { name: /Recheck missing media/ });
  await expect(manualRecovery).toBeVisible();
  expect(pollCount).toBeGreaterThanOrEqual(6);
  await manualRecovery.click();
  await expect(page.locator(".player-heading h1")).toHaveText(plan.title);
  expect(pollCount).toBeGreaterThanOrEqual(7);
});

test("a stale blueprint render conflict preserves the brief and returns to recompilation", async ({ page }) => {
  const plan = legacyPlan("Stale open blueprint");
  const brief = storyBrief("Invite a new friend into the game.");
  let historyLoaded = false;

  await page.addInitScript(() => localStorage.clear());
  await page.route("**/api/plan", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ blueprintId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", plan }),
    });
  });
  await page.route(/\/api\/stories$/, async (route) => {
    if (route.request().method() === "GET") {
      historyLoaded = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ story: null }) });
      return;
    }
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: "This older blueprint must be rebuilt with the current compiler.",
        code: "BLUEPRINT_RECOMPILE_REQUIRED",
      }),
    });
  });

  await page.goto("/");
  await expect.poll(() => historyLoaded).toBe(true);
  const lessonInput = page.getByLabel("What should your child learn?");
  await lessonInput.fill(brief.lesson);
  await expect(lessonInput).toHaveValue(brief.lesson);
  await page.getByRole("button", { name: /Create story blueprint/ }).click();
  await expect(page.getByRole("heading", { name: plan.title, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: /Generate all four clips/ }).click();

  const lesson = page.getByLabel("What should your child learn?");
  await expect(lesson).toHaveValue(brief.lesson);
  await expect(lesson).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: "brief is preserved" })).toBeVisible();
});

test("structured recompile conflict from retry returns to the preserved brief", async ({ page }) => {
  const plan = legacyPlan("Failed story awaiting retry");
  const brief = storyBrief("Repair a mistake and help put things right.");

  await page.addInitScript(() => localStorage.clear());
  await page.route(/\/api\/stories$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        story: {
          id: LATEST_STORY_ID,
          status: "failed",
          createdAt: Date.now(),
          plan,
          brief,
          clips: clipsFor(LATEST_STORY_ID, "failed"),
        },
      }),
    });
  });
  await page.route(`**/api/stories/${LATEST_STORY_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        story: {
          id: LATEST_STORY_ID,
          status: "failed",
          createdAt: Date.now(),
          plan,
          brief,
          clips: clipsFor(LATEST_STORY_ID, "failed"),
        },
      }),
    });
  });
  await page.route(`**/api/stories/${LATEST_STORY_ID}/retry`, async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: "This older unfinished story cannot be retried safely.",
        code: "STORY_RECOMPILE_REQUIRED",
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Resume generation" }).click();
  await page.getByRole("button", { name: /Retry unfinished clips/ }).click();

  await expect(page.getByText("An older story needs rebuilding")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use this brief again" })).toBeFocused();
  await page.getByRole("button", { name: "Use this brief again" }).click();
  await expect(page.getByLabel("What should your child learn?")).toHaveValue(brief.lesson);
});

test("late initial recovery cannot overwrite a story started by the user", async ({ page }) => {
  const olderPlan = legacyPlan("Older recovered story");
  const activePlan = legacyPlan("New active story");
  const activeBrief = storyBrief("Include a new friend in the adventure.");
  let markLatestRequested = () => {};
  let releaseLatest = () => {};
  const latestRequested = new Promise<void>((resolve) => { markLatestRequested = resolve; });
  const latestGate = new Promise<void>((resolve) => { releaseLatest = resolve; });

  await page.addInitScript(() => localStorage.clear());
  await page.route("**/api/plan", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ blueprintId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", plan: activePlan }),
    });
  });
  await page.route(/\/api\/stories$/, async (route) => {
    if (route.request().method() === "GET") {
      markLatestRequested();
      await latestGate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          story: {
            id: STALE_STORY_ID,
            status: "partial",
            createdAt: Date.now() - 10_000,
            plan: olderPlan,
            brief: storyBrief("An older lesson."),
            compatibility: {
              mode: "recompile_required",
              sourceSchemaVersion: null,
              targetSchemaVersion: "1.1",
              providerActionsAllowed: false,
            },
            clips: clipsFor(STALE_STORY_ID, "failed"),
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        story: {
          id: ACTIVE_STORY_ID,
          status: "rendering",
          createdAt: Date.now(),
          plan: activePlan,
          brief: activeBrief,
          clips: clipsFor(ACTIVE_STORY_ID, "rendering"),
        },
      }),
    });
  });
  await page.route(`**/api/stories/${ACTIVE_STORY_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        story: {
          id: ACTIVE_STORY_ID,
          status: "failed",
          createdAt: Date.now(),
          plan: activePlan,
          brief: activeBrief,
          clips: clipsFor(ACTIVE_STORY_ID, "failed"),
        },
      }),
    });
  });

  await page.goto("/");
  await latestRequested;
  await page.getByLabel("What should your child learn?").fill(activeBrief.lesson);
  await page.getByRole("button", { name: /Create story blueprint/ }).click();
  await expect(page.getByRole("heading", { name: activePlan.title, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: /Generate all four clips/ }).click();
  await expect(page.getByRole("heading", { name: `Building “${activePlan.title}”` })).toBeVisible();

  releaseLatest();
  await expect.poll(() => page.evaluate(() => {
    const value = localStorage.getItem("kindpath-generation");
    return value ? JSON.parse(value).storyId : null;
  })).toBe(ACTIVE_STORY_ID);
  await expect(page.getByText(olderPlan.title)).toHaveCount(0);
});
