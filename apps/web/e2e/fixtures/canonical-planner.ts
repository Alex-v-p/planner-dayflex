import type { Page, Route } from "@playwright/test";

export type CanonicalPlannerState = "initial" | "revised";

const user = {
  id: "user-canonical",
  username: "canonical_user",
  created_at: "2026-06-20T08:00:00Z",
  password_changed_at: null,
};

const planningDay = {
  id: "canonical-day",
  local_date: "2026-06-22",
  time_zone: "Europe/Brussels",
  current_snapshot_id: "canonical-initial-snapshot",
  created_at: "2026-06-20T08:00:00Z",
};

const fixedEvents = [
  fixedEvent(
    "team-meeting",
    "Team meeting",
    "2026-06-22T09:00:00+02:00",
    "2026-06-22T10:00:00+02:00",
  ),
  fixedEvent(
    "lunch-appointment",
    "Lunch appointment",
    "2026-06-22T12:00:00+02:00",
    "2026-06-22T13:00:00+02:00",
  ),
  fixedEvent(
    "collection-appointment",
    "Collection appointment",
    "2026-06-22T15:30:00+02:00",
    "2026-06-22T16:00:00+02:00",
  ),
];

const tasks = [
  task("reply-inbox", "Reply to inbox", 45, 4, null, false, null),
  task("write-report", "Write report", 90, 5, null, false, null),
  task("study-notes", "Study notes", 90, 3, null, true, 15),
  task("buy-groceries", "Buy groceries", 30, 2, "2026-06-22", false, null),
];

const revisedTasks = tasks.map((candidate) =>
  candidate.id === "study-notes"
    ? { ...candidate, completed_minutes: 60, remaining_minutes: 30 }
    : candidate.id === "write-report"
      ? { ...candidate, completed_minutes: 90, remaining_minutes: 0 }
      : candidate,
);

const progress = [
  {
    id: "progress-write-report",
    task_id: "write-report",
    planning_day_id: planningDay.id,
    completed_minutes: 90,
    recorded_at: "2026-06-22T11:30:00+02:00",
    created_at: "2026-06-22T09:30:00Z",
  },
  {
    id: "progress-study-notes",
    task_id: "study-notes",
    planning_day_id: planningDay.id,
    completed_minutes: 60,
    recorded_at: "2026-06-22T14:00:00+02:00",
    created_at: "2026-06-22T12:00:00Z",
  },
];

export const canonicalInitialSnapshot = {
  id: "canonical-initial-snapshot",
  planning_day_id: planningDay.id,
  version: 1,
  created_at: "2026-06-22T06:05:00Z",
  scheduler_version: "0.1.0",
  configuration: {
    day_start: "08:00:00",
    day_end: "18:00:00",
    default_buffer_minutes: 10,
  },
  items: [
    scheduleItem("initial-inbox", "task", "08:00", "08:45", {
      task_id: "reply-inbox",
    }),
    scheduleItem("initial-buffer-1", "buffer", "08:45", "08:55"),
    scheduleItem("initial-team", "fixed_event", "09:00", "10:00", {
      fixed_event_id: "team-meeting",
    }),
    scheduleItem("initial-report", "task", "10:00", "11:30", {
      task_id: "write-report",
    }),
    scheduleItem("initial-buffer-2", "buffer", "11:30", "11:40"),
    scheduleItem("initial-lunch", "fixed_event", "12:00", "13:00", {
      fixed_event_id: "lunch-appointment",
    }),
    scheduleItem("initial-study", "task", "13:00", "14:30", {
      task_id: "study-notes",
    }),
    scheduleItem("initial-buffer-3", "buffer", "14:30", "14:40"),
    scheduleItem("initial-groceries", "task", "14:40", "15:10", {
      task_id: "buy-groceries",
    }),
    scheduleItem("initial-buffer-4", "buffer", "15:10", "15:20"),
    scheduleItem("initial-collection", "fixed_event", "15:30", "16:00", {
      fixed_event_id: "collection-appointment",
    }),
    scheduleItem("initial-free", "designated_free_time", "16:00", "18:00"),
  ],
  decisions: [
    decision(
      "decision-inbox",
      "reply-inbox",
      "placed_in_earliest_valid_window",
    ),
    decision(
      "decision-report",
      "write-report",
      "placed_in_earliest_valid_window",
    ),
    decision(
      "decision-study",
      "study-notes",
      "placed_in_earliest_valid_window",
    ),
    decision(
      "decision-groceries",
      "buy-groceries",
      "placed_in_earliest_valid_window",
    ),
    decision("decision-free", null, "designated_free_time"),
  ],
};

export const canonicalRevisedSnapshot = {
  ...canonicalInitialSnapshot,
  id: "canonical-revised-snapshot",
  version: 2,
  created_at: "2026-06-22T12:05:00Z",
  items: [
    scheduleItem("revised-study-history", "task", "13:00", "14:00", {
      task_id: "study-notes",
    }),
    scheduleItem("revised-interruption", "interruption", "14:00", "15:15", {
      interruption_id: "interruption-1",
    }),
    scheduleItem("revised-collection", "fixed_event", "15:30", "16:00", {
      fixed_event_id: "collection-appointment",
    }),
    scheduleItem("revised-study-remaining", "task", "16:00", "16:30", {
      task_id: "study-notes",
    }),
    scheduleItem("revised-buffer-1", "buffer", "16:30", "16:40"),
    scheduleItem("revised-groceries", "task", "16:40", "17:10", {
      task_id: "buy-groceries",
    }),
    scheduleItem("revised-buffer-2", "buffer", "17:10", "17:20"),
    scheduleItem("revised-free", "designated_free_time", "17:20", "18:00"),
  ],
  decisions: [
    decision("decision-study-moved", "study-notes", "moved_after_interruption"),
    decision(
      "decision-groceries-moved",
      "buy-groceries",
      "moved_after_interruption",
    ),
    decision("decision-revised-free", null, "designated_free_time"),
  ],
};

export async function installCanonicalPlannerApi(
  page: Page,
  state: CanonicalPlannerState,
): Promise<void> {
  const snapshot =
    state === "revised" ? canonicalRevisedSnapshot : canonicalInitialSnapshot;
  const activePlanningDay = {
    ...planningDay,
    current_snapshot_id: snapshot.id,
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = `${url.pathname.replace(/^\/api/, "")}${url.search}`;
    const method = request.method();

    if (method === "GET" && path === "/auth/me") {
      await respond(route, { user });
      return;
    }
    if (method === "GET" && path === "/planning/days") {
      await respond(route, [activePlanningDay]);
      return;
    }
    if (method === "GET" && path === "/planning/tasks") {
      await respond(route, state === "revised" ? revisedTasks : tasks);
      return;
    }
    if (
      method === "GET" &&
      path === `/planning/days/${planningDay.id}/fixed-events`
    ) {
      await respond(route, fixedEvents);
      return;
    }
    if (
      method === "GET" &&
      path === `/planning/days/${planningDay.id}/task-progress`
    ) {
      await respond(route, state === "revised" ? progress : []);
      return;
    }
    if (
      method === "GET" &&
      path === `/planning/days/${planningDay.id}/schedule`
    ) {
      await respond(route, snapshot);
      return;
    }
    if (method === "GET" && path.startsWith("/planning/overviews/week?")) {
      await respond(route, overviewSummary("week"));
      return;
    }
    if (method === "GET" && path.startsWith("/planning/overviews/month?")) {
      await respond(route, overviewSummary("month"));
      return;
    }
    if (method === "GET" && path.startsWith("/planning/free-times?")) {
      await respond(route, freeTimesSummary());
      return;
    }
    if (method === "POST" && path.includes("/ai-explanation")) {
      await respond(route, {
        status: "fallback",
        confidence: 0,
        explanation: null,
        deterministic_reason: "The scheduler reason is available.",
        reason_code: "moved_after_interruption",
        fallback_reason: "ai_disabled",
        error_code: "ai_disabled",
      });
      return;
    }

    await respond(route, { detail: `Unhandled ${method} ${path}` }, 500);
  });
}

function fixedEvent(
  id: string,
  title: string,
  start_at: string,
  end_at: string,
) {
  return {
    id,
    planning_day_id: planningDay.id,
    title,
    start_at,
    end_at,
    time_zone: planningDay.time_zone,
    created_at: "2026-06-20T08:00:00Z",
    updated_at: "2026-06-20T08:00:00Z",
  };
}

function task(
  id: string,
  title: string,
  estimated_minutes: number,
  priority: number,
  due_date: string | null,
  splitting_allowed: boolean,
  min_segment_minutes: number | null,
) {
  return {
    id,
    title,
    estimated_minutes,
    priority,
    due_date,
    earliest_start_at: null,
    splitting_allowed,
    min_segment_minutes,
    status: "active",
    completed_minutes: 0,
    remaining_minutes: estimated_minutes,
    created_at: "2026-06-20T08:00:00Z",
    updated_at: "2026-06-20T08:00:00Z",
  };
}

function scheduleItem(
  id: string,
  kind: string,
  start: string,
  end: string,
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
    start_at: `2026-06-22T${start}:00+02:00`,
    end_at: `2026-06-22T${end}:00+02:00`,
    ...overrides,
  };
}

function decision(id: string, task_id: string | null, reason_code: string) {
  return {
    id,
    task_id,
    reason_code,
    details: {},
  };
}

function overviewSummary(mode: "week" | "month") {
  const startDate = mode === "week" ? "2026-06-22" : "2026-06-01";
  const dayCount = mode === "week" ? 7 : 30;
  return {
    start_date: startDate,
    end_date: addDays(startDate, dayCount - 1),
    days: Array.from({ length: dayCount }, (_, index) =>
      planningDaySummary(addDays(startDate, index)),
    ),
  };
}

function planningDaySummary(local_date: string) {
  if (local_date === "2026-06-22") {
    return {
      local_date,
      planning_day_id: planningDay.id,
      time_zone: planningDay.time_zone,
      status: "planned",
      snapshot_id: canonicalRevisedSnapshot.id,
      snapshot_version: canonicalRevisedSnapshot.version,
      planned_minutes: 120,
      fixed_event_count: 3,
      interruption_minutes: 75,
      unscheduled_deferred_count: 0,
      has_useful_free_time: true,
    };
  }
  if (local_date === "2026-06-23") {
    return {
      local_date,
      planning_day_id: "saved-inputs-day",
      time_zone: planningDay.time_zone,
      status: "incomplete",
      snapshot_id: null,
      snapshot_version: null,
      planned_minutes: 0,
      fixed_event_count: 1,
      interruption_minutes: 0,
      unscheduled_deferred_count: 0,
      has_useful_free_time: false,
    };
  }
  if (local_date === "2026-06-24") {
    return {
      local_date,
      planning_day_id: "deferred-day",
      time_zone: planningDay.time_zone,
      status: "planned",
      snapshot_id: "deferred-snapshot",
      snapshot_version: 1,
      planned_minutes: 60,
      fixed_event_count: 2,
      interruption_minutes: 30,
      unscheduled_deferred_count: 1,
      has_useful_free_time: false,
    };
  }

  return {
    local_date,
    planning_day_id: null,
    time_zone: null,
    status: "empty",
    snapshot_id: null,
    snapshot_version: null,
    planned_minutes: 0,
    fixed_event_count: 0,
    interruption_minutes: 0,
    unscheduled_deferred_count: 0,
    has_useful_free_time: false,
  };
}

function freeTimesSummary() {
  return {
    start_date: "2026-06-22",
    end_date: "2026-06-28",
    minimum_minutes: 30,
    days: [
      {
        local_date: "2026-06-22",
        planning_day_id: planningDay.id,
        time_zone: planningDay.time_zone,
        status: "has_free_time",
        snapshot_id: canonicalRevisedSnapshot.id,
        snapshot_version: canonicalRevisedSnapshot.version,
        snapshot_created_at: canonicalRevisedSnapshot.created_at,
        windows: [
          {
            local_date: "2026-06-22",
            planning_day_id: planningDay.id,
            time_zone: planningDay.time_zone,
            snapshot_id: canonicalRevisedSnapshot.id,
            snapshot_version: canonicalRevisedSnapshot.version,
            snapshot_created_at: canonicalRevisedSnapshot.created_at,
            schedule_item_id: "revised-free",
            start_at: "2026-06-22T17:20:00+02:00",
            end_at: "2026-06-22T18:00:00+02:00",
            duration_minutes: 40,
          },
        ],
      },
      {
        local_date: "2026-06-23",
        planning_day_id: "saved-inputs-day",
        time_zone: planningDay.time_zone,
        status: "no_generated_plan",
        snapshot_id: null,
        snapshot_version: null,
        snapshot_created_at: null,
        windows: [],
      },
      {
        local_date: "2026-06-24",
        planning_day_id: "deferred-day",
        time_zone: planningDay.time_zone,
        status: "no_useful_free_time",
        snapshot_id: "deferred-snapshot",
        snapshot_version: 1,
        snapshot_created_at: "2026-06-24T06:10:00Z",
        windows: [],
      },
      {
        local_date: "2026-06-25",
        planning_day_id: null,
        time_zone: null,
        status: "no_generated_plan",
        snapshot_id: null,
        snapshot_version: null,
        snapshot_created_at: null,
        windows: [],
      },
    ],
  };
}

async function respond(
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

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
