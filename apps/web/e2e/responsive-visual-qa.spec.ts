import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  type CanonicalPlannerState,
  installCanonicalPlannerApi,
} from "./fixtures/canonical-planner";

const visualViewports = [
  { name: "mobile", width: 360, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
] as const;

const visualRoutes = [
  {
    name: "daily workspace initial",
    path: "/planner?date=2026-06-22",
    state: "initial",
    surface: "[data-testid='daily-timeline']",
  },
  {
    name: "daily workspace revised recovery",
    path: "/planner?date=2026-06-22",
    state: "revised",
    surface: "[data-testid='daily-timeline']",
  },
  {
    name: "week overview",
    path: "/planner/week?date=2026-06-22",
    state: "revised",
    surface: "[data-testid='overview-grid']",
  },
  {
    name: "month overview",
    path: "/planner/month?date=2026-06-22",
    state: "revised",
    surface: "[data-testid='overview-grid']",
  },
  {
    name: "free-time finder",
    path: "/free-times?start_date=2026-06-22&end_date=2026-06-28&minimum_minutes=30",
    state: "revised",
    surface: "[data-testid='free-time-results']",
  },
] as const satisfies readonly {
  readonly name: string;
  readonly path: string;
  readonly state: CanonicalPlannerState;
  readonly surface: string;
}[];

test.describe("responsive visual QA @visual", () => {
  for (const viewport of visualViewports) {
    for (const route of visualRoutes) {
      test(`@visual ${route.name} stays readable at ${viewport.name}`, async ({
        page,
      }, testInfo) => {
        test.skip(
          testInfo.project.name !== "chromium",
          "The responsive visual matrix sets explicit browser viewports in the chromium project.",
        );

        await page.setViewportSize(viewport);
        await installCanonicalPlannerApi(page, route.state);
        await page.goto(route.path);

        await expect(page.locator(route.surface)).toBeVisible();
        await assertPrimarySurfaceIsNotBlank(page, route.surface);
        await assertNoDocumentHorizontalOverflow(page);
        await assertNoTextOverflow(page);
        await assertSurfaceItemsDoNotOverlap(page, route.surface);

        if (route.surface === "[data-testid='daily-timeline']") {
          await assertTimelineExposesCanonicalShortItems(page, route.state);
          await assertTimelineBlocksDoNotOverlap(page);
        }
      });
    }
  }

  test("@visual accessibility cues remain visible without color alone", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "The responsive visual matrix sets explicit browser viewports in the chromium project.",
    );

    await page.setViewportSize({ width: 768, height: 1024 });
    await installCanonicalPlannerApi(page, "revised");

    await page.goto("/planner?date=2026-06-22");
    await expect(page.getByTestId("planner-announcement")).toContainText(
      "Planner workspace loaded",
    );
    await expect(page.getByTestId("daily-timeline")).toContainText(
      "Unavailable",
    );
    await expect(page.getByTestId("daily-timeline")).toContainText("Moved");
    await assertStatusCueHasAccessibleText(page, "Unavailable");
    await assertStatusCueHasAccessibleText(page, "Moved");
    await expect(page.getByTestId("timeline-detail-list")).toContainText(
      "Free",
    );
    await assertFocusVisible(
      page,
      page.getByRole("button", { name: /Study notes/ }).first(),
    );

    await page.goto("/planner/week?date=2026-06-22");
    await expect(page.getByTestId("overview-announcement")).toContainText(
      "Week overview loaded",
    );
    await expect(page.getByTestId("overview-grid")).toContainText(
      "Useful free time",
    );
    await expect(page.getByTestId("overview-grid")).toContainText(
      "Snapshot v2",
    );
    await assertStatusCueHasAccessibleText(page, "Plan v2");
    await assertFocusVisible(
      page,
      page
        .getByRole("link", {
          name: /Open planner workspace for Jun 22, 2026/,
        })
        .first(),
    );

    await page.goto(
      "/free-times?start_date=2026-06-22&end_date=2026-06-28&minimum_minutes=30",
    );
    await expect(page.getByTestId("free-times-announcement")).toContainText(
      "Free-time finder loaded",
    );
    await expect(page.getByTestId("free-time-results")).toContainText(
      "1 useful window",
    );
    await expect(page.getByTestId("free-time-results")).toContainText(
      "No generated plan",
    );
    await expect(page.getByTestId("free-time-results")).toContainText(
      "No useful free time",
    );
    await assertStatusCueHasAccessibleText(page, "40 min");
    await assertFocusVisible(
      page,
      page
        .getByRole("link", { name: /Open planner workspace for Jun 22/ })
        .first(),
    );
  });

  for (const viewport of visualViewports) {
    test(`@visual contextual editors stay readable at ${viewport.name}`, async ({
      page,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== "chromium",
        "The responsive visual matrix sets explicit browser viewports in the chromium project.",
      );

      await page.setViewportSize(viewport);
      await installCanonicalPlannerApi(page, "initial");
      await page.goto("/planner?date=2026-06-22");

      await page.getByRole("button", { name: "Add task" }).first().click();
      const taskEditor = page.locator("#task-editor-dialog");
      await expect(taskEditor).toBeVisible();
      await expect(taskEditor).toContainText("Add flexible task");
      await assertPrimarySurfaceIsNotBlank(page, "#task-editor-dialog");
      await assertNoDocumentHorizontalOverflow(page);
      await assertNoTextOverflow(page, "#task-editor-dialog");
      await assertFocusVisible(page, page.locator("#task-title"));
      await page.getByRole("button", { name: "Close task editor" }).click();
      await expect(taskEditor).toBeHidden();

      await page.getByRole("button", { name: "Add event" }).first().click();
      const fixedEventEditor = page.locator("#fixed-event-editor-dialog");
      await expect(fixedEventEditor).toBeVisible();
      await expect(fixedEventEditor).toContainText("Add fixed event");
      await assertPrimarySurfaceIsNotBlank(page, "#fixed-event-editor-dialog");
      await assertNoDocumentHorizontalOverflow(page);
      await assertNoTextOverflow(page, "#fixed-event-editor-dialog");
      await assertFocusVisible(page, page.locator("#fixed-event-title"));
    });
  }
});

async function assertPrimarySurfaceIsNotBlank(
  page: Page,
  selector: string,
): Promise<void> {
  const surface = page.locator(selector);
  await expect(surface).not.toBeEmpty();

  const box = await surface.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(40);
  expect(box?.height ?? 0).toBeGreaterThan(40);
}

async function assertNoDocumentHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.viewportWidth + 2);
}

async function assertNoTextOverflow(
  page: Page,
  rootSelector?: string,
): Promise<void> {
  const root = rootSelector === undefined ? page : page.locator(rootSelector);
  const overflowing = await root
    .locator(
      [
        "button",
        "a",
        "input",
        "label",
        "pdf-status-chip span",
        "pdf-summary-value",
        "[data-testid='daily-timeline'] article",
        "[data-testid='overview-day-cell']",
        "[data-testid='free-time-results'] article",
      ].join(", "),
    )
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const htmlElement = element as HTMLElement;
          const style = window.getComputedStyle(htmlElement);
          const rect = htmlElement.getBoundingClientRect();
          const isVisuallyHiddenForAssistiveText =
            style.position === "absolute" &&
            style.overflow === "hidden" &&
            (style.clip !== "auto" || style.clipPath !== "none") &&
            rect.width <= 2 &&
            rect.height <= 2;
          return (
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            !isVisuallyHiddenForAssistiveText &&
            rect.width > 0 &&
            rect.height > 0 &&
            htmlElement.innerText.trim().length > 0 &&
            (htmlElement.scrollWidth > htmlElement.clientWidth + 2 ||
              htmlElement.scrollHeight > htmlElement.clientHeight + 2)
          );
        })
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          text: (element as HTMLElement).innerText.trim().slice(0, 80),
          scrollWidth: (element as HTMLElement).scrollWidth,
          clientWidth: (element as HTMLElement).clientWidth,
          scrollHeight: (element as HTMLElement).scrollHeight,
          clientHeight: (element as HTMLElement).clientHeight,
        })),
    );

  expect(overflowing).toEqual([]);
}

async function assertSurfaceItemsDoNotOverlap(
  page: Page,
  surfaceSelector: string,
): Promise<void> {
  const itemSelector =
    surfaceSelector === "[data-testid='daily-timeline']"
      ? "[data-testid='daily-timeline'] article"
      : surfaceSelector === "[data-testid='overview-grid']"
        ? "[data-testid='overview-day-cell']"
        : "[data-testid='free-time-results'] > li > article";

  const overlaps = await page.locator(itemSelector).evaluateAll((elements) => {
    const boxes = elements.map((element, index) => {
      const rect = element.getBoundingClientRect();
      return {
        id:
          element.getAttribute("data-item-id") ??
          element.getAttribute("data-date") ??
          `${element.tagName.toLowerCase()}-${index}`,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
    });

    const failures: string[] = [];
    for (let outerIndex = 0; outerIndex < boxes.length; outerIndex += 1) {
      for (
        let innerIndex = outerIndex + 1;
        innerIndex < boxes.length;
        innerIndex += 1
      ) {
        const first = boxes[outerIndex];
        const second = boxes[innerIndex];
        const horizontalOverlap =
          Math.min(first.right, second.right) -
          Math.max(first.left, second.left);
        const verticalOverlap =
          Math.min(first.bottom, second.bottom) -
          Math.max(first.top, second.top);

        if (horizontalOverlap > 2 && verticalOverlap > 2) {
          failures.push(`${first.id} overlaps ${second.id}`);
        }
      }
    }

    return failures;
  });

  expect(overlaps).toEqual([]);
}

async function assertTimelineBlocksDoNotOverlap(page: Page): Promise<void> {
  const overlaps = await page
    .locator("[data-testid='daily-timeline'] article")
    .evaluateAll((elements) => {
      const boxes = elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          id: element.getAttribute("data-item-id") ?? "",
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        };
      });
      const failures: string[] = [];
      for (let outerIndex = 0; outerIndex < boxes.length; outerIndex += 1) {
        for (
          let innerIndex = outerIndex + 1;
          innerIndex < boxes.length;
          innerIndex += 1
        ) {
          const first = boxes[outerIndex];
          const second = boxes[innerIndex];
          const horizontalOverlap =
            Math.min(first.right, second.right) -
            Math.max(first.left, second.left);
          const verticalOverlap =
            Math.min(first.bottom, second.bottom) -
            Math.max(first.top, second.top);

          if (horizontalOverlap > 2 && verticalOverlap > 2) {
            failures.push(`${first.id} overlaps ${second.id}`);
          }
        }
      }

      return failures;
    });

  expect(overlaps).toEqual([]);
}

async function assertTimelineExposesCanonicalShortItems(
  page: Page,
  state: CanonicalPlannerState,
): Promise<void> {
  const expectedItems =
    state === "initial"
      ? [
          { id: "initial-inbox", label: "Reply to inbox" },
          { id: "initial-groceries", label: "Buy groceries" },
          { id: "initial-collection", label: "Collection appointment" },
        ]
      : [
          { id: "revised-collection", label: "Collection appointment" },
          { id: "revised-study-remaining", label: "Study notes" },
          { id: "revised-groceries", label: "Buy groceries" },
        ];

  for (const expectedItem of expectedItems) {
    const block = page.locator(
      `[data-testid='daily-timeline'] article[data-item-id='${expectedItem.id}']`,
    );
    await expect(block).toBeVisible();
    await expect(block).toContainText(expectedItem.label);
    await expect(block).toContainText(
      /\d{1,2}:\d{2}(?:\s?[AP]M)?-\d{1,2}:\d{2}(?:\s?[AP]M)?/,
    );
  }
}

async function assertStatusCueHasAccessibleText(
  page: Page,
  label: string,
): Promise<void> {
  const chip = page
    .locator("pdf-status-chip > span, pdf-block-type-marker > span")
    .filter({ hasText: label })
    .first();

  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("aria-label", new RegExp(`^${label}: .+`));
}

async function assertFocusVisible(page: Page, locator: Locator): Promise<void> {
  await page.keyboard.press("Tab");
  await locator.focus();

  const focusStyle = await locator.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      boxShadow: style.boxShadow,
    };
  });

  expect(
    focusStyle.outlineWidth > 0 ||
      focusStyle.outlineStyle !== "none" ||
      focusStyle.boxShadow !== "none",
  ).toBe(true);
}
