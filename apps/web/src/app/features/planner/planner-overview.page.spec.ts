import { ComponentFixture, TestBed } from "@angular/core/testing";
import { HttpErrorResponse } from "@angular/common/http";
import { ActivatedRoute, Router, convertToParamMap } from "@angular/router";
import { BehaviorSubject, NEVER, Observable, of, throwError } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiClientService } from "../../core/api/api-client.service";
import {
  FixedEvent,
  PlannerApiService,
  PlanningRangeSummary,
  PlanningWeekDetail,
  ScheduleSnapshot,
  Task,
  TaskProgress,
} from "./planner-api.service";
import { PlannerOverviewPage } from "./planner-overview.page";

const weekSummary: PlanningRangeSummary = {
  start_date: "2026-06-29",
  end_date: "2026-07-05",
  days: [
    emptyDay("2026-06-29"),
    emptyDay("2026-06-30"),
    {
      local_date: "2026-07-01",
      planning_day_id: "day-1",
      time_zone: "Europe/Brussels",
      status: "planned",
      snapshot_id: "snapshot-1",
      snapshot_version: 2,
      planned_minutes: 90,
      fixed_event_count: 2,
      interruption_minutes: 45,
      unscheduled_deferred_count: 1,
      has_useful_free_time: true,
    },
    {
      ...emptyDay("2026-07-02"),
      planning_day_id: "day-2",
      time_zone: "Europe/Brussels",
      status: "incomplete",
      fixed_event_count: 1,
    },
    {
      ...emptyDay("2026-07-03"),
      planning_day_id: "day-3",
      time_zone: "Europe/Brussels",
      status: "incomplete",
    },
    emptyDay("2026-07-04"),
    emptyDay("2026-07-05"),
  ],
};

const monthSummary: PlanningRangeSummary = {
  start_date: "2026-07-01",
  end_date: "2026-07-31",
  days: Array.from({ length: 31 }, (_, index) =>
    emptyDay(`2026-07-${String(index + 1).padStart(2, "0")}`),
  ),
};

const weekTasks: readonly Task[] = [
  task("task-focus", "Focus draft", 90),
  task("task-moved", "Moved follow-up", 60),
  task("task-deferred", "Deferred admin", 45),
];

const weekFixedEvents: readonly FixedEvent[] = [
  fixedEvent(
    "fixed-standup",
    "day-1",
    "Team standup",
    "2026-07-01T08:00:00+02:00",
    "2026-07-01T08:30:00+02:00",
  ),
];

const weekProgress: readonly TaskProgress[] = [
  {
    id: "progress-1",
    task_id: "task-focus",
    planning_day_id: "day-1",
    completed_minutes: 90,
    recorded_at: "2026-07-01T12:00:00+02:00",
    created_at: "2026-07-01T12:00:00+02:00",
  },
];

const weekSnapshot: ScheduleSnapshot = {
  id: "snapshot-1",
  planning_day_id: "day-1",
  version: 2,
  created_at: "2026-07-01T07:00:00+02:00",
  scheduler_version: "test",
  configuration: { day_start: "08:00", day_end: "12:00" },
  items: [
    scheduleItem(
      "fixed-item",
      "fixed_event",
      null,
      "fixed-standup",
      null,
      "2026-07-01T08:00:00+02:00",
      "2026-07-01T08:30:00+02:00",
    ),
    scheduleItem(
      "task-done-item",
      "task",
      "task-focus",
      null,
      null,
      "2026-07-01T08:30:00+02:00",
      "2026-07-01T10:00:00+02:00",
    ),
    scheduleItem(
      "interruption-item",
      "interruption",
      null,
      null,
      "interruption-1",
      "2026-07-01T10:00:00+02:00",
      "2026-07-01T10:30:00+02:00",
    ),
    scheduleItem(
      "buffer-item",
      "buffer",
      null,
      null,
      null,
      "2026-07-01T10:30:00+02:00",
      "2026-07-01T10:45:00+02:00",
    ),
    scheduleItem(
      "moved-item",
      "task",
      "task-moved",
      null,
      null,
      "2026-07-01T10:45:00+02:00",
      "2026-07-01T11:45:00+02:00",
    ),
    scheduleItem(
      "free-item",
      "designated_free_time",
      null,
      null,
      null,
      "2026-07-01T11:45:00+02:00",
      "2026-07-01T12:00:00+02:00",
    ),
  ],
  decisions: [
    {
      id: "decision-moved",
      task_id: "task-moved",
      reason_code: "moved_after_interruption",
      details: {},
    },
    {
      id: "decision-deferred",
      task_id: "task-deferred",
      reason_code: "blocked_by_interruption",
      details: {},
    },
    {
      id: "decision-free",
      task_id: null,
      reason_code: "designated_free_time",
      details: {},
    },
  ],
};

const weekDetail: PlanningWeekDetail = {
  summary: weekSummary,
  tasks: weekTasks,
  days: weekSummary.days.map((summary) => ({
    summary,
    day:
      summary.local_date === "2026-07-01"
        ? {
            id: "day-1",
            local_date: "2026-07-01",
            time_zone: "Europe/Brussels",
            current_snapshot_id: "snapshot-1",
            created_at: "2026-07-01T07:00:00+02:00",
          }
        : summary.planning_day_id !== null
          ? {
              id: summary.planning_day_id,
              local_date: summary.local_date,
              time_zone: summary.time_zone ?? "Europe/Brussels",
              current_snapshot_id: null,
              created_at: `${summary.local_date}T00:00:00+02:00`,
            }
          : null,
    fixedEvents: summary.local_date === "2026-07-01" ? weekFixedEvents : [],
    progress: summary.local_date === "2026-07-01" ? weekProgress : [],
    snapshot: summary.local_date === "2026-07-01" ? weekSnapshot : null,
  })),
};

describe("planner overview API contract", () => {
  it("loads week details through existing summary and day endpoints", async () => {
    const api = new FakeApiClient();
    api.responses.set(
      "/planning/overviews/week?start_date=2026-06-29",
      weekSummary,
    );
    api.responses.set("/planning/days", [
      {
        id: "day-1",
        local_date: "2026-07-01",
        time_zone: "Europe/Brussels",
        current_snapshot_id: "snapshot-1",
        created_at: "2026-07-01T07:00:00+02:00",
      },
      {
        id: "day-2",
        local_date: "2026-07-02",
        time_zone: "Europe/Brussels",
        current_snapshot_id: null,
        created_at: "2026-07-02T07:00:00+02:00",
      },
      {
        id: "day-3",
        local_date: "2026-07-03",
        time_zone: "Europe/Brussels",
        current_snapshot_id: null,
        created_at: "2026-07-03T07:00:00+02:00",
      },
    ]);
    api.responses.set("/planning/tasks", weekTasks);
    api.responses.set("/planning/days/day-1/fixed-events", weekFixedEvents);
    api.responses.set("/planning/days/day-1/task-progress", weekProgress);
    api.responses.set("/planning/days/day-1/schedule", weekSnapshot);
    api.responses.set("/planning/days/day-2/fixed-events", []);
    api.responses.set("/planning/days/day-2/task-progress", []);
    api.responses.set("/planning/days/day-3/fixed-events", []);
    api.responses.set("/planning/days/day-3/task-progress", []);
    await TestBed.configureTestingModule({
      providers: [
        PlannerApiService,
        { provide: ApiClientService, useValue: api },
      ],
    }).compileComponents();
    const service = TestBed.inject(PlannerApiService);

    const detail = await firstValue(service.loadWeekDetail("2026-06-29"));

    expect(detail.summary).toEqual(weekSummary);
    expect(detail.tasks).toEqual(weekTasks);
    expect(
      detail.days.find((day) => day.summary.local_date === "2026-07-01"),
    ).toMatchObject({
      fixedEvents: weekFixedEvents,
      progress: weekProgress,
      snapshot: weekSnapshot,
    });
    expect(api.gets).toEqual([
      "/planning/overviews/week?start_date=2026-06-29",
      "/planning/days",
      "/planning/tasks",
      "/planning/days/day-1/fixed-events",
      "/planning/days/day-1/task-progress",
      "/planning/days/day-1/schedule",
      "/planning/days/day-2/fixed-events",
      "/planning/days/day-2/task-progress",
      "/planning/days/day-3/fixed-events",
      "/planning/days/day-3/task-progress",
    ]);
    expect(api.gets.join("\n")).not.toContain("user-1");
  });

  it("loads month summaries through the authenticated overview endpoint", async () => {
    const api = new FakeApiClient();
    api.responses.set(
      "/planning/overviews/month?month=2026-07-01",
      monthSummary,
    );
    await TestBed.configureTestingModule({
      providers: [
        PlannerApiService,
        { provide: ApiClientService, useValue: api },
      ],
    }).compileComponents();
    const service = TestBed.inject(PlannerApiService);

    expect(await firstValue(service.loadMonthOverview("2026-07-01"))).toEqual(
      monthSummary,
    );
    expect(api.gets).toEqual(["/planning/overviews/month?month=2026-07-01"]);
    expect(api.gets.join("\n")).not.toContain("user-1");
  });
});

describe("rendered planner overviews", () => {
  let routeData: BehaviorSubject<{ overviewMode: string }>;
  let queryParamMap: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let plannerApi: FakePlannerApi;
  let router: FakeRouter;

  beforeEach(() => {
    routeData = new BehaviorSubject({ overviewMode: "week" });
    queryParamMap = new BehaviorSubject(
      convertToParamMap({ date: "2026-07-01" }),
    );
    plannerApi = new FakePlannerApi();
    router = new FakeRouter();
  });

  it("renders the week route as a timed grid with schedule block cues", async () => {
    const fixture = await renderOverview(
      routeData,
      queryParamMap,
      plannerApi,
      router,
    );

    expect(plannerApi.weekStarts).toEqual(["2026-06-29"]);
    expect(text(fixture)).toContain("Week calendar");
    expect(text(fixture)).toContain("Saved daily plans only.");
    expect(text(fixture)).toContain("Timed week grid");
    expect(text(fixture)).toContain("Europe/Brussels");
    expect(text(fixture)).toContain("Day bounds 08:00-12:00");
    expect(text(fixture)).toContain("Selected day");
    expect(text(fixture)).toContain("Selected date");
    expect(text(fixture)).toContain("Week totals");
    expect(text(fixture)).toContain("Plan v2");
    expect(text(fixture)).toContain("1 hr 30 min");
    expect(text(fixture)).toContain("Fixed events");
    expect(text(fixture)).toContain("2");
    expect(text(fixture)).toContain("Interruptions");
    expect(text(fixture)).toContain("45 min");
    expect(text(fixture)).toContain("Deferred");
    expect(text(fixture)).toContain("1");
    expect(text(fixture)).toContain("Useful free time:");
    expect(text(fixture)).toContain("Present");
    expect(text(fixture)).toContain("Team standup");
    expect(text(fixture)).toContain("Focus draft");
    expect(text(fixture)).toContain("Unavailable");
    expect(text(fixture)).toContain("Buffer");
    expect(text(fixture)).toContain("Useful free time");
    expect(text(fixture)).toContain("Moved work: 1");
    expect(text(fixture)).toContain("Completed work");
    expect(text(fixture)).toContain("Deferred: 1");
    expect(
      linkByAriaLabel(
        fixture,
        "Open planner workspace for Jul 2, 2026, Saved inputs only",
      )?.getAttribute("href"),
    ).toBe("/planner?date=2026-07-02");
    expect(weekDayColumn(fixture, "2026-07-04")?.textContent).toContain(
      "No saved day",
    );
    expect(weekDayColumn(fixture, "2026-07-03")?.textContent).toContain(
      "Saved inputs only",
    );
    expect(overviewSummary(fixture).className).toContain("order-first");
    expect(overviewSummary(fixture).className).toContain("xl:order-none");
    expect(
      linkByAriaLabel(
        fixture,
        "Open planner workspace for Jul 1, 2026, Generated snapshot v2, 1 deferred",
      )?.getAttribute("href"),
    ).toBe("/planner?date=2026-07-01");
    expect(
      linkByAriaLabel(
        fixture,
        "Open planner workspace for Jul 1, 2026, Generated snapshot v2, 1 deferred",
      )?.textContent,
    ).toContain("1 deferred");
    expect(announcement(fixture)).toContain("Week calendar loaded");
  });

  it("places week blocks proportionally and preserves non-color status cues", async () => {
    const fixture = await renderOverview(
      routeData,
      queryParamMap,
      plannerApi,
      router,
    );
    const fixed = weekBlock(fixture, "fixed-item");
    const done = weekBlock(fixture, "task-done-item");
    const interruption = weekBlock(fixture, "interruption-item");
    const buffer = weekBlock(fixture, "buffer-item");
    const moved = weekBlock(fixture, "moved-item");
    const free = weekBlock(fixture, "free-item");

    expect(weekTimeRuler(fixture).textContent).toContain("08:00");
    expect(weekTimeRuler(fixture).textContent).toContain("12:00");
    expect(fixed?.getAttribute("data-top-minutes")).toBe("0");
    expect(fixed?.getAttribute("data-height-minutes")).toBe("30");
    expect(done?.getAttribute("data-top-minutes")).toBe("30");
    expect(done?.getAttribute("data-height-minutes")).toBe("90");
    expect(done?.getAttribute("data-completion")).toBe("Done");
    expect(done?.textContent).toContain("Done");
    expect(done?.getAttribute("aria-label")).toContain("Flexible work");
    expect(fixed?.textContent).toContain("Fixed");
    expect(fixed?.getAttribute("aria-label")).toContain("Fixed event");
    expect(interruption?.textContent).toContain("Unavailable");
    expect(interruption?.getAttribute("aria-label")).toContain(
      "Reported unavailable time",
    );
    expect(buffer?.textContent).toContain("Buffer");
    expect(buffer?.getAttribute("aria-label")).toContain("Buffer");
    expect(moved?.getAttribute("data-recovery-state")).toBe("moved");
    expect(moved?.textContent).toContain("Moved");
    expect(moved?.getAttribute("aria-label")).toContain("Moved");
    expect(free?.getAttribute("data-kind")).toBe("designated_free_time");
    expect(free?.textContent).toContain("Free");
    expect(free?.getAttribute("aria-label")).toContain("Useful free time");
    expect(fixed?.getAttribute("role")).toBe("button");
    expect(done?.getAttribute("tabindex")).toBe("0");
    expect(text(fixture)).toContain("Deferred: 1");
  });

  it("opens week slots and existing blocks in the day workspace editor flow", async () => {
    const fixture = await renderOverview(
      routeData,
      queryParamMap,
      plannerApi,
      router,
    );
    const openSlot = weekOpenSlot(fixture, "2026-07-04", "08:00");

    expect(openSlot.tagName).toBe("BUTTON");
    expect(openSlot.getAttribute("type")).toBe("button");
    expect(openSlot.getAttribute("aria-label")).toBe(
      "Create planner item on Jul 4, 2026 at 08:00, choose fixed event or flexible task",
    );
    expect(openSlot.className).toContain("min-h-10");
    expect(openSlot.className).toContain("border-dashed");
    expect(openSlot.className).toContain("border-meadow-500");
    expect(openSlot.className).not.toContain("text-transparent");

    openSlot.click();
    fixture.detectChanges();

    expect(router.navigations.at(-1)).toEqual({
      commands: ["/planner"],
      queryParams: {
        date: "2026-07-04",
        create: "slot",
        start: "08:00",
      },
    });

    weekBlock(fixture, "fixed-item")?.click();
    fixture.detectChanges();

    expect(weekBlock(fixture, "fixed-item")?.getAttribute("role")).toBe(
      "button",
    );
    expect(weekBlock(fixture, "fixed-item")?.getAttribute("tabindex")).toBe(
      "0",
    );
    expect(router.navigations.at(-1)).toEqual({
      commands: ["/planner"],
      queryParams: {
        date: "2026-07-01",
        editFixedEvent: "fixed-standup",
      },
    });

    weekBlock(fixture, "moved-item")?.dispatchEvent(
      keyboardEvent("keydown", "Enter"),
    );
    fixture.detectChanges();

    expect(router.navigations.at(-1)).toEqual({
      commands: ["/planner"],
      queryParams: {
        date: "2026-07-01",
        editTask: "task-moved",
      },
    });
  });

  it("does not offer week create slots over saved fixed events before a plan exists", async () => {
    plannerApi.responseWeekDetail = {
      ...weekDetail,
      days: weekDetail.days.map((day) =>
        day.summary.local_date === "2026-07-02"
          ? {
              ...day,
              fixedEvents: [
                fixedEvent(
                  "fixed-input-only",
                  "day-2",
                  "Client call",
                  "2026-07-02T08:00:00+02:00",
                  "2026-07-02T08:30:00+02:00",
                ),
              ],
              snapshot: null,
            }
          : day,
      ),
    };
    const fixture = await renderOverview(
      routeData,
      queryParamMap,
      plannerApi,
      router,
    );

    expect(queryWeekOpenSlot(fixture, "2026-07-02", "08:00")).toBeNull();
    expect(queryWeekOpenSlot(fixture, "2026-07-02", "08:30")).not.toBeNull();
  });

  it("places the current-time marker using the planning time zone date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T19:00:00Z"));
    const timeZone = "Pacific/Kiritimati";
    const nextWeekSummary = {
      ...weekSummary,
      days: weekSummary.days.map((day) =>
        day.local_date === "2026-07-01"
          ? { ...day, time_zone: timeZone, status: "planned" as const }
          : day,
      ),
    };
    plannerApi.responseWeekDetail = {
      ...weekDetail,
      summary: nextWeekSummary,
      days: weekDetail.days.map((day) => ({
        ...day,
        summary:
          nextWeekSummary.days.find(
            (summary) => summary.local_date === day.summary.local_date,
          ) ?? day.summary,
        day:
          day.summary.local_date === "2026-07-01"
            ? {
                id: "day-1",
                local_date: "2026-07-01",
                time_zone: timeZone,
                current_snapshot_id: "snapshot-timezone",
                created_at: "2026-07-01T08:00:00+14:00",
              }
            : day.day,
        snapshot:
          day.summary.local_date === "2026-07-01"
            ? {
                ...weekSnapshot,
                id: "snapshot-timezone",
                items: [],
                decisions: [],
              }
            : day.snapshot,
      })),
    };

    try {
      const fixture = await renderOverview(
        routeData,
        queryParamMap,
        plannerApi,
        router,
      );
      const indicator = currentTimeIndicator(fixture);

      expect(indicator?.getAttribute("aria-label")).toBe("Current time 09:00");
      expect(weekDayColumn(fixture, "2026-07-01")?.contains(indicator)).toBe(
        true,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses one Day Week Month switcher and keeps free-time out of route header modes", async () => {
    const fixture = await renderOverview(
      routeData,
      queryParamMap,
      plannerApi,
      router,
    );

    expect(text(fixture)).toContain("Day");
    expect(text(fixture)).toContain("Week");
    expect(text(fixture)).toContain("Month");
    expect(text(fixture)).not.toContain("Free time finder");
    clickButtonWithText(fixture, "Month");

    expect(router.navigations.at(-1)).toEqual({
      commands: ["/planner/month"],
      queryParams: { date: "2026-07-01" },
    });

    clickButtonWithText(fixture, "Day");

    expect(router.navigations.at(-1)).toEqual({
      commands: ["/planner"],
      queryParams: { date: "2026-07-01" },
    });
  });

  it("keeps the selected week range and primary grid visible while loading", async () => {
    plannerApi.pendingWeek = true;
    const fixture = await renderOverview(
      routeData,
      queryParamMap,
      plannerApi,
      router,
    );

    expect(text(fixture)).toContain("Loading week calendar");
    expect(text(fixture)).toContain("Jun 29, 2026 to Jul 5, 2026");
    expect(text(fixture)).toContain("Day");
    expect(text(fixture)).toContain("Week");
    expect(text(fixture)).toContain("Month");
    expect(weekGrid(fixture).textContent).toContain("Time");
    expect(weekGrid(fixture).textContent).toContain("Wed");
    expect(weekGrid(fixture).textContent).toContain("1");
    expect(weekGrid(fixture).textContent).toContain("Selected date");
    expect(announcement(fixture)).toContain(
      "Loading week calendar for Jul 1, 2026.",
    );
  });

  it("loads a month overview from the first day of the selected month", async () => {
    routeData.next({ overviewMode: "month" });
    queryParamMap.next(convertToParamMap({ date: "2026-07-20" }));

    const fixture = await renderOverview(
      routeData,
      queryParamMap,
      plannerApi,
      router,
    );

    expect(plannerApi.monthStarts).toEqual(["2026-07-01"]);
    expect(text(fixture)).toContain("Month calendar");
    expect(text(fixture)).toContain("Jul 1, 2026 to Jul 31, 2026");
  });

  it("renders month day indicators and the selected-day summary from daily snapshots", async () => {
    routeData.next({ overviewMode: "month" });
    queryParamMap.next(convertToParamMap({ date: "2026-07-15" }));
    plannerApi.responseMonthSummary = {
      ...monthSummary,
      days: monthSummary.days.map((day) => {
        if (day.local_date === "2026-07-15") {
          return {
            ...day,
            planning_day_id: "day-15",
            time_zone: "Europe/Brussels",
            status: "planned",
            snapshot_id: "snapshot-15",
            snapshot_version: 3,
            planned_minutes: 135,
            fixed_event_count: 2,
            interruption_minutes: 30,
            unscheduled_deferred_count: 4,
            has_useful_free_time: true,
          };
        }
        if (day.local_date === "2026-07-16") {
          return {
            ...day,
            planning_day_id: "day-16",
            time_zone: "Europe/Brussels",
            status: "incomplete",
            fixed_event_count: 1,
          };
        }
        return day;
      }),
    };

    const fixture = await renderOverview(
      routeData,
      queryParamMap,
      plannerApi,
      router,
    );
    const selectedCell = overviewDayCell(fixture, "2026-07-15");
    const incompleteCell = overviewDayCell(fixture, "2026-07-16");

    expect(selectedCell?.textContent).toContain("Plan v3");
    expect(selectedCell?.textContent).toContain("2 hr 15 min");
    expect(selectedCell?.textContent).toContain("30 min");
    expect(selectedCell?.textContent).toContain("4 deferred");
    expect(selectedCell?.textContent).toContain("Useful free time");
    expect(selectedCell?.getAttribute("aria-current")).toBe("date");
    expect(incompleteCell?.textContent).toContain("Inputs");
    expect(incompleteCell?.textContent).toContain("Inputs saved");
    expect(text(fixture)).toContain(
      "Current generated snapshot summarizes this day only.",
    );
    expect(text(fixture)).toContain("Generated snapshots");
    expect(text(fixture)).toContain("1 day with useful free time");
    expect(
      linkByAriaLabel(
        fixture,
        "Open planner workspace for Jul 15, 2026, Generated snapshot v3",
      )?.getAttribute("href"),
    ).toBe("/planner?date=2026-07-15");
  });

  it("keeps selected-day empty and no-generated summaries distinct", async () => {
    const nextSummary = {
      ...weekSummary,
      days: weekSummary.days.map((day) =>
        day.local_date === "2026-07-02"
          ? {
              ...day,
              planning_day_id: "day-2",
              time_zone: "Europe/Brussels",
              status: "incomplete" as const,
              fixed_event_count: 1,
            }
          : day,
      ),
    };
    plannerApi.responseWeekDetail = {
      ...weekDetail,
      summary: nextSummary,
      days: weekDetail.days.map((day) => ({
        ...day,
        summary:
          nextSummary.days.find(
            (summary) => summary.local_date === day.summary.local_date,
          ) ?? day.summary,
      })),
    };
    queryParamMap.next(convertToParamMap({ date: "2026-07-02" }));

    const incompleteFixture = await renderOverview(
      routeData,
      queryParamMap,
      plannerApi,
      router,
    );

    expect(text(incompleteFixture)).toContain(
      "Saved inputs exist, but no generated schedule snapshot is current.",
    );
    expect(text(incompleteFixture)).not.toContain(
      "No saved inputs or current schedule snapshot for this date.",
    );

    TestBed.resetTestingModule();
    queryParamMap = new BehaviorSubject(
      convertToParamMap({ date: "2026-07-04" }),
    );
    const emptyFixture = await renderOverview(
      routeData,
      queryParamMap,
      plannerApi,
      router,
    );

    expect(text(emptyFixture)).toContain(
      "No saved inputs or current schedule snapshot for this date.",
    );
    expect(text(emptyFixture)).not.toContain(
      "Saved inputs exist, but no generated schedule snapshot is current.",
    );
  });

  it("keeps date-only month labels stable in negative-offset runtimes", async () => {
    const restoreDateTimeFormat = mockNegativeOffsetRuntimeDateFormatting();
    routeData.next({ overviewMode: "month" });
    queryParamMap.next(convertToParamMap({ date: "2026-07-20" }));

    try {
      const fixture = await renderOverview(
        routeData,
        queryParamMap,
        plannerApi,
        router,
      );

      expect(text(fixture)).toContain("Jul 1, 2026 to Jul 31, 2026");
      expect(
        linkByAriaLabel(
          fixture,
          "Open planner workspace for Jul 1, 2026, No saved day",
        )?.getAttribute("href"),
      ).toBe("/planner?date=2026-07-01");
      expect(firstDayHeading(fixture)).toBe("Wed");
      expect(announcement(fixture)).toContain(
        "Month calendar loaded for Jul 1, 2026 through Jul 31, 2026.",
      );
    } finally {
      restoreDateTimeFormat();
    }
  });

  it("pads month grids so month dates align to Monday-first weekday columns", async () => {
    routeData.next({ overviewMode: "month" });
    queryParamMap.next(convertToParamMap({ date: "2026-07-20" }));

    const fixture = await renderOverview(
      routeData,
      queryParamMap,
      plannerApi,
      router,
    );
    const cells = overviewGridCells(fixture);

    expect(cells).toHaveLength(35);
    expect(cells.slice(0, 2).map((cell) => cell.kind)).toEqual([
      "padding",
      "padding",
    ]);
    expect(cells[2]).toEqual({ kind: "day", date: "2026-07-01" });
    expect(cells[32]).toEqual({ kind: "day", date: "2026-07-31" });
    expect(cells.slice(33).map((cell) => cell.kind)).toEqual([
      "padding",
      "padding",
    ]);
  });

  it("navigates between ranges without embedding a user id", async () => {
    const fixture = await renderOverview(
      routeData,
      queryParamMap,
      plannerApi,
      router,
    );

    buttonByAriaLabel(fixture, "Next week").click();
    fixture.detectChanges();

    expect(router.navigations).toEqual([
      { commands: [], queryParams: { date: "2026-07-08" } },
    ]);
    expect(JSON.stringify(router.navigations)).not.toContain("user-1");
  });

  it("surfaces overview load failures accessibly", async () => {
    plannerApi.error = new Error("offline");
    const fixture = await renderOverview(
      routeData,
      queryParamMap,
      plannerApi,
      router,
    );

    expect(text(fixture)).toContain("Planner calendar did not load");
    expect(text(fixture)).toContain("Planner overview data did not load.");
    expect(announcement(fixture)).toContain(
      "Planner overview data did not load.",
    );
    expect(text(fixture)).toContain("Jun 29, 2026 to Jul 5, 2026");
    expect(text(fixture)).toContain("Selected date");
    expect(weekGrid(fixture).textContent).toContain("Wed");
    expect(weekGrid(fixture).textContent).toContain("1");
  });

  it("links permission failures back to sign-in with the selected overview context", async () => {
    plannerApi.error = new HttpErrorResponse({ status: 403 });
    routeData.next({ overviewMode: "month" });
    queryParamMap.next(convertToParamMap({ date: "2026-07-20" }));

    const fixture = await renderOverview(
      routeData,
      queryParamMap,
      plannerApi,
      router,
    );

    expect(text(fixture)).toContain("Calendar unavailable");
    expect(linkByText(fixture, "Sign in again")?.getAttribute("href")).toBe(
      "/sign-in?returnUrl=%2Fplanner%2Fmonth%3Fdate%3D2026-07-20",
    );
  });
});

class FakeApiClient {
  readonly responses = new Map<string, unknown>();
  readonly gets: string[] = [];

  getJson<TResponse>(path: string): Observable<TResponse> {
    this.gets.push(path);
    if (!this.responses.has(path)) {
      throw new Error(`Unexpected GET ${path}`);
    }
    return of(this.responses.get(path) as TResponse);
  }
}

class FakePlannerApi {
  error: unknown = null;
  pendingWeek = false;
  responseWeekDetail: PlanningWeekDetail = weekDetail;
  responseMonthSummary: PlanningRangeSummary = monthSummary;
  readonly weekStarts: string[] = [];
  readonly monthStarts: string[] = [];

  loadWeekDetail(startDate: string): Observable<PlanningWeekDetail> {
    this.weekStarts.push(startDate);
    if (this.pendingWeek) {
      return NEVER;
    }
    if (this.error !== null) {
      return throwError(() => this.error);
    }
    return of(this.responseWeekDetail);
  }

  loadMonthOverview(monthDate: string): Observable<PlanningRangeSummary> {
    this.monthStarts.push(monthDate);
    if (this.error !== null) {
      return throwError(() => this.error);
    }
    return of(this.responseMonthSummary);
  }
}

class FakeRouter {
  readonly navigations: Array<{
    commands?: unknown[];
    queryParams: Record<string, string>;
  }> = [];

  navigate(
    commands: unknown[],
    options: { queryParams: Record<string, string> },
  ): Promise<boolean> {
    this.navigations.push({ commands, queryParams: options.queryParams });
    return Promise.resolve(true);
  }

  createUrlTree(
    commands: readonly unknown[],
    options?: { queryParams?: Record<string, string> },
  ): string {
    const path = commands.join("/");
    const queryParams = new URLSearchParams(options?.queryParams).toString();
    return queryParams ? `${path}?${queryParams}` : path;
  }

  serializeUrl(url: unknown): string {
    return String(url);
  }
}

async function renderOverview(
  data: BehaviorSubject<{ overviewMode: string }>,
  params: BehaviorSubject<ReturnType<typeof convertToParamMap>>,
  plannerApi: FakePlannerApi,
  router: FakeRouter,
): Promise<ComponentFixture<PlannerOverviewPage>> {
  await TestBed.configureTestingModule({
    imports: [PlannerOverviewPage],
    providers: [
      { provide: PlannerApiService, useValue: plannerApi },
      {
        provide: ActivatedRoute,
        useValue: {
          data,
          queryParamMap: params,
        },
      },
      { provide: Router, useValue: router },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(PlannerOverviewPage);
  fixture.detectChanges();
  await Promise.resolve();
  fixture.detectChanges();
  return fixture;
}

function emptyDay(localDate: string) {
  return {
    local_date: localDate,
    planning_day_id: null,
    time_zone: null,
    status: "empty" as const,
    snapshot_id: null,
    snapshot_version: null,
    planned_minutes: 0,
    fixed_event_count: 0,
    interruption_minutes: 0,
    unscheduled_deferred_count: 0,
    has_useful_free_time: false,
  };
}

function task(id: string, title: string, estimatedMinutes: number): Task {
  return {
    id,
    title,
    estimated_minutes: estimatedMinutes,
    priority: 2,
    due_date: null,
    earliest_start_at: null,
    splitting_allowed: true,
    min_segment_minutes: null,
    status: "pending",
    created_at: "2026-07-01T07:00:00+02:00",
    updated_at: "2026-07-01T07:00:00+02:00",
  };
}

function fixedEvent(
  id: string,
  planningDayId: string,
  title: string,
  startAt: string,
  endAt: string,
): FixedEvent {
  return {
    id,
    planning_day_id: planningDayId,
    title,
    start_at: startAt,
    end_at: endAt,
    time_zone: "Europe/Brussels",
    created_at: startAt,
    updated_at: startAt,
  };
}

function scheduleItem(
  id: string,
  kind: string,
  taskId: string | null,
  fixedEventId: string | null,
  interruptionId: string | null,
  startAt: string,
  endAt: string,
) {
  return {
    id,
    kind,
    task_id: taskId,
    fixed_event_id: fixedEventId,
    interruption_id: interruptionId,
    start_at: startAt,
    end_at: endAt,
  };
}

function text<T>(fixture: ComponentFixture<T>): string {
  return fixture.nativeElement.textContent;
}

function announcement<T>(fixture: ComponentFixture<T>): string {
  return (
    fixture.nativeElement.querySelector(
      '[data-testid="overview-announcement"]',
    ) as HTMLElement
  ).textContent;
}

function linkByAriaLabel<T>(
  fixture: ComponentFixture<T>,
  label: string,
): HTMLAnchorElement | null {
  return fixture.nativeElement.querySelector(`a[aria-label="${label}"]`);
}

function linkByText<T>(
  fixture: ComponentFixture<T>,
  linkText: string,
): HTMLAnchorElement | null {
  const links = Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll("a"),
  );
  return (
    links.find((candidate) => candidate.textContent?.includes(linkText)) ?? null
  );
}

function buttonByAriaLabel<T>(
  fixture: ComponentFixture<T>,
  label: string,
): HTMLButtonElement {
  const button = (fixture.nativeElement as HTMLElement).querySelector(
    `button[aria-label="${label}"]`,
  );

  if (!button) {
    throw new Error(`Could not find ${label} button`);
  }

  return button as HTMLButtonElement;
}

function overviewGridCells<T>(
  fixture: ComponentFixture<T>,
): Array<
  | { readonly kind: "padding"; readonly date?: undefined }
  | { readonly kind: "day"; readonly date: string }
> {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelector(
      "[data-testid='overview-grid']",
    )?.children ?? [],
  ).map((element) => {
    const date = element.getAttribute("data-date");
    return date === null ? { kind: "padding" } : { kind: "day", date };
  });
}

function firstDayHeading<T>(fixture: ComponentFixture<T>): string {
  return (
    (fixture.nativeElement as HTMLElement).querySelector(
      "[data-testid='overview-day-cell'] p",
    )?.textContent ?? ""
  ).trim();
}

function overviewDayCell<T>(
  fixture: ComponentFixture<T>,
  date: string,
): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(
    `[data-testid='overview-day-cell'][data-date='${date}']`,
  );
}

function weekDayColumn<T>(
  fixture: ComponentFixture<T>,
  date: string,
): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(
    `[data-testid='week-day-column'][data-date='${date}']`,
  );
}

function weekBlock<T>(
  fixture: ComponentFixture<T>,
  itemId: string,
): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(
    `[data-testid='week-schedule-block'][data-item-id='${itemId}']`,
  );
}

function weekOpenSlot<T>(
  fixture: ComponentFixture<T>,
  date: string,
  start: string,
): HTMLButtonElement {
  const slot = queryWeekOpenSlot(fixture, date, start);
  if (slot === null) {
    throw new Error(`Could not find week slot ${date} ${start}`);
  }
  return slot as HTMLButtonElement;
}

function queryWeekOpenSlot<T>(
  fixture: ComponentFixture<T>,
  date: string,
  start: string,
): HTMLButtonElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(
    `[data-testid='week-open-slot'][data-date='${date}'][data-start='${start}']`,
  );
}

function weekTimeRuler<T>(fixture: ComponentFixture<T>): HTMLElement {
  const element = (fixture.nativeElement as HTMLElement).querySelector(
    "[data-testid='week-time-ruler']",
  );
  if (element === null) {
    throw new Error("Could not find week time ruler");
  }
  return element as HTMLElement;
}

function weekGrid<T>(fixture: ComponentFixture<T>): HTMLElement {
  const element = (fixture.nativeElement as HTMLElement).querySelector(
    "[data-testid='week-time-grid']",
  );
  if (element === null) {
    throw new Error("Could not find week time grid");
  }
  return element as HTMLElement;
}

function currentTimeIndicator<T>(
  fixture: ComponentFixture<T>,
): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(
    "[data-testid='current-time-indicator']",
  );
}

function clickButtonWithText<T>(
  fixture: ComponentFixture<T>,
  buttonText: string,
): void {
  const button = Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll("button"),
  ).find((candidate) => candidate.textContent?.includes(buttonText));

  if (!button) {
    throw new Error(`Could not find ${buttonText} button`);
  }

  (button as HTMLButtonElement).click();
  fixture.detectChanges();
}

function keyboardEvent(
  type: string,
  key: string,
  options: KeyboardEventInit = {},
): KeyboardEvent {
  return new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    key,
    ...options,
  });
}

function overviewSummary<T>(fixture: ComponentFixture<T>): HTMLElement {
  const element = (fixture.nativeElement as HTMLElement).querySelector(
    "[data-testid='overview-summary']",
  );
  if (element === null) {
    throw new Error("Could not find overview summary");
  }
  return element as HTMLElement;
}

function mockNegativeOffsetRuntimeDateFormatting(): () => void {
  const RealDateTimeFormat = Intl.DateTimeFormat;
  const mockDateTimeFormat = function MockDateTimeFormat(
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions,
  ) {
    const formatter = new RealDateTimeFormat(locales, {
      ...options,
      timeZone: "UTC",
    });
    return {
      format(value?: Date | number) {
        const date =
          value === undefined
            ? new Date()
            : value instanceof Date
              ? value
              : new Date(value);
        const displayDate =
          options?.timeZone === "UTC"
            ? date
            : new Date(date.getTime() - 7 * 60 * 60 * 1000);
        return formatter.format(displayDate);
      },
    } as Intl.DateTimeFormat;
  } as typeof Intl.DateTimeFormat;
  const spy = vi
    .spyOn(Intl, "DateTimeFormat")
    .mockImplementation(mockDateTimeFormat);

  return () => {
    spy.mockRestore();
  };
}

async function firstValue<T>(observable: Observable<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    observable.subscribe({ next: resolve, error: reject });
  });
}
