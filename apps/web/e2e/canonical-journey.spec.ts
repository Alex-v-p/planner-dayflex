import { expect, test, type Page, type Route } from "@playwright/test";

const user = {
  id: "user-1",
  username: "daily_user",
  created_at: "2026-07-03T08:00:00Z",
  password_changed_at: null,
};

const planningDay = {
  id: "day-1",
  local_date: "2026-07-04",
  time_zone: "Europe/Brussels",
  current_snapshot_id: null as string | null,
  created_at: "2026-07-03T08:00:00Z",
};

const task = {
  id: "task-1",
  title: "Write report",
  estimated_minutes: 90,
  priority: 5,
  due_date: "2026-07-04",
  earliest_start_at: null,
  splitting_allowed: false,
  min_segment_minutes: null,
  status: "active",
  completed_minutes: 0,
  remaining_minutes: 90,
  created_at: "2026-07-03T08:00:00Z",
  updated_at: "2026-07-03T08:00:00Z",
};

const fixedEvent = {
  id: "event-1",
  planning_day_id: "day-1",
  title: "Team meeting",
  start_at: "2026-07-04T09:00:00+02:00",
  end_at: "2026-07-04T10:00:00+02:00",
  time_zone: "Europe/Brussels",
  created_at: "2026-07-03T08:00:00Z",
  updated_at: "2026-07-03T08:00:00Z",
};

const generatedSnapshot = {
  id: "snapshot-1",
  planning_day_id: "day-1",
  version: 1,
  created_at: "2026-07-04T08:05:00Z",
  scheduler_version: "0.1.0",
  configuration: { day_start: "08:00:00", day_end: "18:00:00" },
  items: [
    scheduleItem(
      "fixed-item",
      "fixed_event",
      "2026-07-04T09:00:00+02:00",
      "2026-07-04T10:00:00+02:00",
      {
        fixed_event_id: "event-1",
      },
    ),
    scheduleItem(
      "task-item",
      "task",
      "2026-07-04T10:00:00+02:00",
      "2026-07-04T11:30:00+02:00",
      {
        task_id: "task-1",
      },
    ),
    scheduleItem(
      "free-item",
      "designated_free_time",
      "2026-07-04T16:00:00+02:00",
      "2026-07-04T18:00:00+02:00",
    ),
  ],
  decisions: [
    {
      id: "decision-1",
      task_id: "task-1",
      reason_code: "placed_in_earliest_valid_window",
      details: {},
    },
  ],
};

const revisedSnapshot = {
  ...generatedSnapshot,
  id: "snapshot-2",
  version: 2,
  items: [
    scheduleItem(
      "fixed-item",
      "fixed_event",
      "2026-07-04T09:00:00+02:00",
      "2026-07-04T10:00:00+02:00",
      {
        fixed_event_id: "event-1",
      },
    ),
    scheduleItem(
      "progressed-task-item",
      "task",
      "2026-07-04T10:00:00+02:00",
      "2026-07-04T10:45:00+02:00",
      {
        task_id: "task-1",
      },
    ),
    scheduleItem(
      "interruption-item",
      "interruption",
      "2026-07-04T14:00:00+02:00",
      "2026-07-04T14:30:00+02:00",
      {
        interruption_id: "interruption-1",
      },
    ),
    scheduleItem(
      "revised-free-item",
      "designated_free_time",
      "2026-07-04T16:00:00+02:00",
      "2026-07-04T18:00:00+02:00",
    ),
  ],
  decisions: [
    {
      id: "decision-2",
      task_id: "task-1",
      reason_code: "moved_after_interruption",
      details: {},
    },
  ],
};

const progress = {
  id: "progress-1",
  task_id: "task-1",
  planning_day_id: "day-1",
  completed_minutes: 45,
  recorded_at: "2026-07-04T10:45:00+02:00",
  created_at: "2026-07-04T08:45:00Z",
};

test("canonical recovery journey works with a stubbed API", async ({
  page,
}) => {
  const api = new StubbedPlannerApi();
  await api.install(page);

  await page.goto("/register");
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Password").fill("a-long-passphrase");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Day planner")).toBeVisible();
  await page.goto("/planner?date=2026-07-04");
  await expect(
    page.getByText("No saved planning day for this date."),
  ).toBeVisible();

  await page
    .locator("[aria-labelledby='tasks-title']")
    .getByRole("button", { name: "Add task" })
    .click();
  await page.locator("#task-title").fill(task.title);
  await page.locator("#task-estimate").fill(String(task.estimated_minutes));
  await page.locator("#task-priority").fill(String(task.priority));
  await page.locator("#task-due-date").fill(task.due_date);
  await page
    .locator("form[aria-label='Flexible task details']")
    .getByRole("button", { name: "Add task" })
    .click();
  await expect(
    page.locator("[aria-labelledby='tasks-title']").getByText("Write report", {
      exact: true,
    }),
  ).toBeVisible();

  await page
    .locator("[aria-labelledby='fixed-events-title']")
    .getByRole("button", { name: "Add event" })
    .click();
  await page.locator("#fixed-event-title").fill(fixedEvent.title);
  await page.locator("#fixed-event-start").fill("2026-07-04T09:00");
  await page.locator("#fixed-event-end").fill("2026-07-04T10:00");
  await page.locator("#fixed-event-time-zone").fill("Europe/Brussels");
  await page
    .locator("form[aria-label='Fixed event details']")
    .getByRole("button", { name: "Add event" })
    .click();
  await expect(page.getByText("Team meeting")).toBeVisible();

  await page
    .getByTestId("day-workspace-header")
    .getByRole("button", { name: "Generate plan" })
    .click();
  await expect(page.getByText("Generated schedule snapshot v1.")).toBeVisible();
  await expect(page.getByTestId("daily-timeline")).toContainText("Free");

  await page.locator("#progress-task").selectOption(task.id);
  await page.locator("#progress-minutes").fill("45");
  await page.locator("#progress-recorded").fill("2026-07-04T10:45");
  await page.locator("#progress-time-zone").fill("Europe/Brussels");
  await page.getByRole("button", { name: "Record progress" }).click();
  await expect(page.getByText("Progress saved.")).toBeVisible();
  await expect(page.getByText("45 min completed")).toBeVisible();

  await page.locator("#interruption-start").fill("2026-07-04T14:00");
  await page.locator("#interruption-end").fill("2026-07-04T14:30");
  await page.locator("#interruption-zone").fill("Europe/Brussels");
  await page.locator("#interruption-reported").fill("2026-07-04T14:00");
  await page.getByRole("button", { name: "Submit interruption" }).click();
  await expect(
    page.getByText("Revised schedule snapshot v2 is now shown."),
  ).toBeVisible();
  await expect(page.getByTestId("daily-timeline")).toContainText("Unavailable");

  await page.getByRole("link", { name: "Open planner week overview" }).click();
  await expect(
    page.getByRole("heading", { name: "Week overview" }),
  ).toBeVisible();
  await expect(page.getByText("Snapshot v2")).toBeVisible();

  await page.getByRole("link", { name: "Open planner month overview" }).click();
  await expect(
    page.getByRole("heading", { name: "Month overview" }),
  ).toBeVisible();
  await expect(page.getByText("Useful free time:")).toBeVisible();

  await page.getByRole("link", { name: "Open free-time finder" }).click();
  await expect(
    page.getByRole("heading", { name: "Free-time finder" }),
  ).toBeVisible();
  await expect(page.getByTestId("free-time-count")).toContainText(
    "1 useful windows",
  );
  await expect(
    page.getByTestId("free-time-results").getByText("Duration"),
  ).toBeVisible();
  await expect(page.getByText("2 hr")).toBeVisible();
  await expect(page.getByText("Snapshot v2")).toBeVisible();
});

class StubbedPlannerApi {
  private registered = false;
  private tasks: unknown[] = [];
  private days: unknown[] = [];
  private fixedEvents: unknown[] = [];
  private currentSnapshot:
    | typeof generatedSnapshot
    | typeof revisedSnapshot
    | null = null;
  private progressRecords: unknown[] = [];

  async install(page: Page): Promise<void> {
    await page.route("**/api/**", (route) => this.handle(route));
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const path = `${url.pathname.replace(/^\/api/, "")}${url.search}`;
    const method = request.method();

    if (method === "GET" && path === "/auth/me") {
      await this.respond(
        route,
        this.registered ? { user } : { detail: "Unauthorized" },
        this.registered ? 200 : 401,
      );
      return;
    }
    if (method === "POST" && path === "/auth/register") {
      this.registered = true;
      await this.respond(route, { user });
      return;
    }
    if (method === "GET" && path === "/planning/days") {
      await this.respond(route, this.days);
      return;
    }
    if (method === "GET" && path === "/planning/tasks") {
      await this.respond(route, this.tasks);
      return;
    }
    if (method === "POST" && path === "/planning/tasks") {
      this.tasks = [{ ...task, ...(await request.postDataJSON()) }];
      await this.respond(route, this.tasks[0]);
      return;
    }
    if (method === "POST" && path === "/planning/days") {
      this.days = [planningDay];
      await this.respond(route, planningDay);
      return;
    }
    if (method === "GET" && path === "/planning/days/day-1/fixed-events") {
      await this.respond(route, this.fixedEvents);
      return;
    }
    if (method === "POST" && path === "/planning/days/day-1/fixed-events") {
      this.fixedEvents = [fixedEvent];
      await this.respond(route, fixedEvent);
      return;
    }
    if (method === "GET" && path === "/planning/days/day-1/task-progress") {
      await this.respond(route, this.progressRecords);
      return;
    }
    if (method === "GET" && path === "/planning/days/day-1/schedule") {
      await this.respond(
        route,
        this.currentSnapshot ?? { detail: "Not found" },
        this.currentSnapshot ? 200 : 404,
      );
      return;
    }
    if (method === "POST" && path === "/planning/days/day-1/generate-plan") {
      this.currentSnapshot = generatedSnapshot;
      this.days = [
        { ...planningDay, current_snapshot_id: generatedSnapshot.id },
      ];
      await this.respond(route, generatedSnapshot);
      return;
    }
    if (method === "POST" && path === "/planning/days/day-1/task-progress") {
      this.progressRecords = [progress];
      this.tasks = [{ ...task, completed_minutes: 45, remaining_minutes: 45 }];
      await this.respond(route, progress);
      return;
    }
    if (method === "POST" && path === "/planning/days/day-1/interruptions") {
      this.currentSnapshot = revisedSnapshot;
      this.days = [{ ...planningDay, current_snapshot_id: revisedSnapshot.id }];
      await this.respond(route, revisedSnapshot);
      return;
    }
    if (method === "GET" && path.startsWith("/planning/overviews/week?")) {
      await this.respond(route, overviewSummary("2026-06-29", "2026-07-05"));
      return;
    }
    if (method === "GET" && path.startsWith("/planning/overviews/month?")) {
      await this.respond(route, overviewSummary("2026-07-01", "2026-07-31"));
      return;
    }
    if (method === "GET" && path.startsWith("/planning/free-times?")) {
      await this.respond(route, freeTimesSummary());
      return;
    }

    await this.respond(route, { detail: `Unhandled ${method} ${path}` }, 500);
  }

  private async respond(
    route: Route,
    body: unknown,
    status = 200,
  ): Promise<void> {
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  }
}

function scheduleItem(
  id: string,
  kind: string,
  start_at: string,
  end_at: string,
  overrides: Partial<{
    readonly task_id: string | null;
    readonly fixed_event_id: string | null;
    readonly interruption_id: string | null;
  }> = {},
) {
  return {
    id,
    kind,
    task_id: null,
    fixed_event_id: null,
    interruption_id: null,
    start_at,
    end_at,
    ...overrides,
  };
}

function overviewSummary(startDate: string, endDate: string) {
  return {
    start_date: startDate,
    end_date: endDate,
    days: [
      {
        local_date: "2026-07-04",
        planning_day_id: "day-1",
        time_zone: "Europe/Brussels",
        status: "planned",
        snapshot_id: "snapshot-2",
        snapshot_version: 2,
        planned_minutes: 45,
        fixed_event_count: 1,
        interruption_minutes: 30,
        unscheduled_deferred_count: 0,
        has_useful_free_time: true,
      },
    ],
  };
}

function freeTimesSummary() {
  return {
    start_date: "2026-07-04",
    end_date: "2026-07-10",
    minimum_minutes: 30,
    days: [
      {
        local_date: "2026-07-04",
        planning_day_id: "day-1",
        time_zone: "Europe/Brussels",
        status: "has_free_time",
        snapshot_id: "snapshot-2",
        snapshot_version: 2,
        snapshot_created_at: "2026-07-04T08:05:00Z",
        windows: [
          {
            local_date: "2026-07-04",
            planning_day_id: "day-1",
            time_zone: "Europe/Brussels",
            snapshot_id: "snapshot-2",
            snapshot_version: 2,
            snapshot_created_at: "2026-07-04T08:05:00Z",
            schedule_item_id: "revised-free-item",
            start_at: "2026-07-04T16:00:00+02:00",
            end_at: "2026-07-04T18:00:00+02:00",
            duration_minutes: 120,
          },
        ],
      },
    ],
  };
}
