import { HttpErrorResponse } from "@angular/common/http";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap } from "@angular/router";
import { BehaviorSubject, Observable, Subject, of, throwError } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiClientService } from "../../core/api/api-client.service";
import { AuthUser } from "../../core/auth/auth-contracts";
import { AuthSessionService } from "../../core/auth/auth-session.service";
import {
  FixedEvent,
  PlannerApiService,
  PlannerWorkspaceData,
  ScheduleSnapshot,
  Task,
  TaskProgress,
} from "./planner-api.service";
import { PlannerWorkspacePage } from "./planner-workspace.page";

const sampleUser: AuthUser = {
  id: "user-1",
  username: "daily_user",
  created_at: "2026-07-03T08:00:00Z",
  password_changed_at: null,
};

const selectedDate = "2026-07-04";

const fixedEvent: FixedEvent = {
  id: "event-1",
  planning_day_id: "day-1",
  title: "Team meeting",
  start_at: "2026-07-04T09:00:00+02:00",
  end_at: "2026-07-04T10:00:00+02:00",
  time_zone: "Europe/Brussels",
  created_at: "2026-07-03T08:00:00Z",
  updated_at: "2026-07-03T08:00:00Z",
};

const task: Task = {
  id: "task-1",
  title: "Write report",
  estimated_minutes: 90,
  priority: 5,
  due_date: null,
  earliest_start_at: null,
  splitting_allowed: false,
  min_segment_minutes: null,
  status: "active",
  created_at: "2026-07-03T08:00:00Z",
  updated_at: "2026-07-03T08:00:00Z",
};

const progressRecord: TaskProgress = {
  id: "progress-1",
  task_id: "task-1",
  planning_day_id: "day-1",
  completed_minutes: 45,
  recorded_at: "2026-07-04T10:45:00+02:00",
  created_at: "2026-07-04T08:45:00Z",
};

const snapshot: ScheduleSnapshot = {
  id: "snapshot-1",
  planning_day_id: "day-1",
  version: 2,
  created_at: "2026-07-04T08:05:00Z",
  scheduler_version: "0.1.0",
  configuration: { day_start: "08:00:00", day_end: "18:00:00" },
  items: [
    {
      id: "item-1",
      kind: "task",
      task_id: "task-1",
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-07-04T10:00:00+02:00",
      end_at: "2026-07-04T11:30:00+02:00",
    },
    {
      id: "item-2",
      kind: "designated_free_time",
      task_id: null,
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-07-04T16:00:00+02:00",
      end_at: "2026-07-04T18:00:00+02:00",
    },
  ],
  decisions: [],
};

const canonicalSnapshot: ScheduleSnapshot = {
  ...snapshot,
  items: [
    {
      id: "fixed-item",
      kind: "fixed_event",
      task_id: null,
      fixed_event_id: "event-1",
      interruption_id: null,
      start_at: "2026-07-04T09:00:00+02:00",
      end_at: "2026-07-04T10:00:00+02:00",
    },
    {
      id: "task-item",
      kind: "task",
      task_id: "task-1",
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-07-04T10:00:00+02:00",
      end_at: "2026-07-04T11:30:00+02:00",
    },
    {
      id: "buffer-item",
      kind: "buffer",
      task_id: null,
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-07-04T11:30:00+02:00",
      end_at: "2026-07-04T11:40:00+02:00",
    },
    {
      id: "interruption-item",
      kind: "interruption",
      task_id: null,
      fixed_event_id: null,
      interruption_id: "interruption-1",
      start_at: "2026-07-04T14:00:00+02:00",
      end_at: "2026-07-04T14:30:00+02:00",
    },
    {
      id: "free-item",
      kind: "designated_free_time",
      task_id: null,
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-07-04T16:00:00+02:00",
      end_at: "2026-07-04T18:00:00+02:00",
    },
  ],
  decisions: [
    {
      id: "decision-1",
      task_id: "task-1",
      reason_code: "placed_in_earliest_valid_window",
      details: {},
    },
    {
      id: "decision-2",
      task_id: null,
      reason_code: "designated_free_time",
      details: {},
    },
  ],
};

const overlappingLockedSnapshot: ScheduleSnapshot = {
  ...snapshot,
  items: [
    {
      id: "fixed-overlap-item",
      kind: "fixed_event",
      task_id: null,
      fixed_event_id: "event-1",
      interruption_id: null,
      start_at: "2026-07-04T09:00:00+02:00",
      end_at: "2026-07-04T10:00:00+02:00",
    },
    {
      id: "interruption-overlap-item",
      kind: "interruption",
      task_id: null,
      fixed_event_id: null,
      interruption_id: "interruption-1",
      start_at: "2026-07-04T09:30:00+02:00",
      end_at: "2026-07-04T10:30:00+02:00",
    },
    {
      id: "task-after-overlap-item",
      kind: "task",
      task_id: "task-1",
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-07-04T10:30:00+02:00",
      end_at: "2026-07-04T11:30:00+02:00",
    },
  ],
  decisions: [
    {
      id: "decision-locked-overlap",
      task_id: null,
      reason_code: "locked_time_overlap_merged",
      details: {},
    },
  ],
};

const noFitSnapshot: ScheduleSnapshot = {
  ...canonicalSnapshot,
  id: "snapshot-no-fit",
  version: 3,
  decisions: [
    ...canonicalSnapshot.decisions,
    {
      id: "decision-no-fit",
      task_id: "task-2",
      reason_code: "insufficient_remaining_day_time",
      details: {},
    },
    {
      id: "decision-unknown",
      task_id: null,
      reason_code: "out_of_contract_reason",
      details: {},
    },
  ],
};

const taskThatDoesNotFit: Task = {
  ...task,
  id: "task-2",
  title: "Prepare workshop",
  estimated_minutes: 240,
  priority: 4,
};

const studyTask: Task = {
  ...task,
  id: "task-study",
  title: "Study notes",
  estimated_minutes: 90,
  priority: 3,
  splitting_allowed: true,
  min_segment_minutes: 15,
};

const revisedStudySnapshot: ScheduleSnapshot = {
  ...canonicalSnapshot,
  id: "snapshot-revised",
  version: 3,
  items: [
    {
      id: "study-before-interruption",
      kind: "task",
      task_id: "task-study",
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-07-04T13:00:00+02:00",
      end_at: "2026-07-04T14:00:00+02:00",
    },
    {
      id: "reported-interruption",
      kind: "interruption",
      task_id: null,
      fixed_event_id: null,
      interruption_id: "interruption-2",
      start_at: "2026-07-04T14:00:00+02:00",
      end_at: "2026-07-04T15:15:00+02:00",
    },
    {
      id: "study-after-interruption",
      kind: "task",
      task_id: "task-study",
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-07-04T16:00:00+02:00",
      end_at: "2026-07-04T16:30:00+02:00",
    },
  ],
  decisions: [
    {
      id: "decision-moved-study",
      task_id: "task-study",
      reason_code: "moved_after_interruption",
      details: {},
    },
    {
      id: "decision-free-revised",
      task_id: null,
      reason_code: "designated_free_time",
      details: {},
    },
  ],
};

describe("planner workspace API contract", () => {
  it("loads the selected day through authenticated user-scoped planning endpoints", async () => {
    const api = new FakeApiClient();
    api.responses.set("/planning/days", [
      {
        id: "day-1",
        local_date: selectedDate,
        time_zone: "Europe/Brussels",
        current_snapshot_id: "snapshot-1",
        created_at: "2026-07-03T08:00:00Z",
      },
    ]);
    api.responses.set("/planning/tasks", [task]);
    api.responses.set("/planning/days/day-1/fixed-events", [fixedEvent]);
    api.responses.set("/planning/days/day-1/task-progress", [progressRecord]);
    api.responses.set("/planning/days/day-1/schedule", snapshot);
    await TestBed.configureTestingModule({
      providers: [
        PlannerApiService,
        { provide: ApiClientService, useValue: api },
      ],
    }).compileComponents();

    const data = await firstValue(
      TestBed.inject(PlannerApiService).loadWorkspaceDate(selectedDate),
    );

    expect(data.day?.id).toBe("day-1");
    expect(data.fixedEvents).toEqual([fixedEvent]);
    expect(data.tasks).toEqual([task]);
    expect(data.progress).toEqual([progressRecord]);
    expect(data.snapshot?.id).toBe("snapshot-1");
    expect(api.gets).toEqual([
      "/planning/days",
      "/planning/tasks",
      "/planning/days/day-1/fixed-events",
      "/planning/days/day-1/task-progress",
      "/planning/days/day-1/schedule",
    ]);
    expect(api.gets.join("\n")).not.toContain("user-1");
  });

  it("keeps an empty selected date understandable when no planning day exists", async () => {
    const api = new FakeApiClient();
    api.responses.set("/planning/days", []);
    api.responses.set("/planning/tasks", []);
    await TestBed.configureTestingModule({
      providers: [
        PlannerApiService,
        { provide: ApiClientService, useValue: api },
      ],
    }).compileComponents();

    const data = await firstValue(
      TestBed.inject(PlannerApiService).loadWorkspaceDate(selectedDate),
    );

    expect(data).toEqual({
      selectedDate,
      planningDays: [],
      day: null,
      fixedEvents: [],
      tasks: [],
      progress: [],
      snapshot: null,
    });
    expect(api.gets).toEqual(["/planning/days", "/planning/tasks"]);
  });

  it("creates a planning day before saving a fixed event on an empty selected date", async () => {
    const api = new FakeApiClient();
    const createdDay = {
      id: "day-new",
      local_date: selectedDate,
      time_zone: "Europe/Brussels",
      current_snapshot_id: null,
      created_at: "2026-07-03T08:00:00Z",
    };
    api.responses.set("/planning/days", createdDay);
    api.responses.set("/planning/days/day-new/fixed-events", fixedEvent);
    await TestBed.configureTestingModule({
      providers: [
        PlannerApiService,
        { provide: ApiClientService, useValue: api },
      ],
    }).compileComponents();

    const event = await firstValue(
      TestBed.inject(PlannerApiService).saveFixedEventForDate(
        selectedDate,
        null,
        {
          title: "Team meeting",
          start_at: "2026-07-04T09:00:00+02:00",
          end_at: "2026-07-04T10:00:00+02:00",
          time_zone: "Europe/Brussels",
        },
      ),
    );

    expect(event).toEqual(fixedEvent);
    expect(api.posts).toEqual([
      {
        path: "/planning/days",
        body: { local_date: selectedDate, time_zone: "Europe/Brussels" },
      },
      {
        path: "/planning/days/day-new/fixed-events",
        body: {
          title: "Team meeting",
          start_at: "2026-07-04T09:00:00+02:00",
          end_at: "2026-07-04T10:00:00+02:00",
          time_zone: "Europe/Brussels",
        },
      },
    ]);
    expect(JSON.stringify(api.posts)).not.toContain("user-1");
  });

  it("uses authenticated owner-scoped mutation endpoint shapes", async () => {
    const api = new FakeApiClient();
    api.responses.set("/planning/tasks/task-1", task);
    api.responses.set("/planning/days/day-1/fixed-events/event-1", fixedEvent);
    api.responses.set("DELETE /planning/tasks/task-1", undefined);
    api.responses.set(
      "DELETE /planning/days/day-1/fixed-events/event-1",
      undefined,
    );
    await TestBed.configureTestingModule({
      providers: [
        PlannerApiService,
        { provide: ApiClientService, useValue: api },
      ],
    }).compileComponents();
    const service = TestBed.inject(PlannerApiService);

    await firstValue(
      service.updateTask("task-1", {
        title: "Write report",
        estimated_minutes: 90,
        priority: 5,
        due_date: null,
        earliest_start_at: null,
        splitting_allowed: false,
        min_segment_minutes: null,
      }),
    );
    await firstValue(
      service.updateFixedEvent("day-1", "event-1", {
        title: "Team meeting",
        start_at: "2026-07-04T09:00:00+02:00",
        end_at: "2026-07-04T10:00:00+02:00",
        time_zone: "Europe/Brussels",
      }),
    );
    await firstValue(service.deleteTask("task-1"));
    await firstValue(service.deleteFixedEvent("day-1", "event-1"));

    expect(api.puts.map((call) => call.path)).toEqual([
      "/planning/tasks/task-1",
      "/planning/days/day-1/fixed-events/event-1",
    ]);
    expect(api.deletes).toEqual([
      "/planning/tasks/task-1",
      "/planning/days/day-1/fixed-events/event-1",
    ]);
    expect(
      JSON.stringify({ puts: api.puts, deletes: api.deletes }),
    ).not.toContain("user-1");
  });

  it("generates a persisted schedule snapshot through the planning day endpoint", async () => {
    const api = new FakeApiClient();
    api.responses.set("/planning/days/day-1/generate-plan", snapshot);
    await TestBed.configureTestingModule({
      providers: [
        PlannerApiService,
        { provide: ApiClientService, useValue: api },
      ],
    }).compileComponents();

    const generated = await firstValue(
      TestBed.inject(PlannerApiService).generatePlan("day-1"),
    );

    expect(generated).toEqual(snapshot);
    expect(api.posts).toEqual([
      { path: "/planning/days/day-1/generate-plan", body: null },
    ]);
    expect(JSON.stringify(api.posts)).not.toContain("user-1");
  });

  it("records task progress and reports interruptions through day-scoped endpoints", async () => {
    const api = new FakeApiClient();
    api.responses.set("/planning/days/day-1/task-progress", progressRecord);
    api.responses.set("/planning/days/day-1/interruptions", canonicalSnapshot);
    await TestBed.configureTestingModule({
      providers: [
        PlannerApiService,
        { provide: ApiClientService, useValue: api },
      ],
    }).compileComponents();
    const service = TestBed.inject(PlannerApiService);

    const progress = await firstValue(
      service.recordTaskProgress("day-1", {
        task_id: "task-1",
        completed_minutes: 45,
        recorded_at: "2026-07-04T10:45:00+02:00",
      }),
    );
    const revised = await firstValue(
      service.reportInterruption("day-1", {
        start_at: "2026-07-04T14:00:00+02:00",
        end_at: "2026-07-04T15:15:00+02:00",
        time_zone: "Europe/Brussels",
        reported_at: "2026-07-04T14:00:00+02:00",
      }),
    );

    expect(progress).toEqual(progressRecord);
    expect(revised).toEqual(canonicalSnapshot);
    expect(api.posts).toEqual([
      {
        path: "/planning/days/day-1/task-progress",
        body: {
          task_id: "task-1",
          completed_minutes: 45,
          recorded_at: "2026-07-04T10:45:00+02:00",
        },
      },
      {
        path: "/planning/days/day-1/interruptions",
        body: {
          start_at: "2026-07-04T14:00:00+02:00",
          end_at: "2026-07-04T15:15:00+02:00",
          time_zone: "Europe/Brussels",
          reported_at: "2026-07-04T14:00:00+02:00",
        },
      },
    ]);
    expect(JSON.stringify(api.posts)).not.toContain("user-1");
  });
});

describe("rendered planner workspace", () => {
  let routeParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let plannerApi: FakePlannerApi;
  let router: FakeRouter;

  beforeEach(() => {
    routeParams = new BehaviorSubject(
      convertToParamMap({ date: selectedDate }),
    );
    plannerApi = new FakePlannerApi();
    router = new FakeRouter();
  });

  it("loads the canonical initial day and renders the proportional accessible timeline", async () => {
    plannerApi.result = workspaceData({ snapshot: canonicalSnapshot });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    expect(plannerApi.loadedDates).toEqual([selectedDate]);
    expect(text(fixture)).toContain("Signed in as daily_user");
    expect(text(fixture)).toContain("Day timeline");
    expect(text(fixture)).toContain("Write report");
    expect(text(fixture)).toContain("Team meeting");
    expect(text(fixture)).toContain("Buffer");
    expect(text(fixture)).toContain("Unavailable");
    expect(text(fixture)).toContain("Work");
    expect(text(fixture)).toContain("Fixed");
    expect(text(fixture)).toContain("Free");
    expect(text(fixture)).toContain("Designated Free Time");
    expect(text(fixture)).toContain("Planning inputs");
    expect(text(fixture)).toContain("Snapshot");
    expect(text(fixture)).toContain("v2");
    expect(text(fixture)).toContain("Scheduled work");
    expect(text(fixture)).toContain("1 hr 30 min");
    expect(text(fixture)).toContain("Free time");
    expect(text(fixture)).toContain("2 hr");
    expect(text(fixture)).toContain("Generate schedule");
    expect(text(fixture)).toContain(
      "Write report was placed in the earliest valid window.",
    );
    expect(text(fixture)).toContain("placed_in_earliest_valid_window");
    expect(text(fixture)).toContain(
      "A remaining useful window was kept as free time.",
    );
    expect(timelineBlocks(fixture).map((block) => block.kind)).toEqual([
      "fixed_event",
      "task",
      "buffer",
      "interruption",
      "designated_free_time",
    ]);
    expect(announcement(fixture)).toContain("Planner workspace loaded");
  });

  it("renders a helpful empty state for a selected date without saved day data", async () => {
    plannerApi.result = workspaceData({
      day: null,
      fixedEvents: [],
      tasks: [],
      snapshot: null,
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    expect(text(fixture)).toContain("No saved planning day for this date.");
    expect(text(fixture)).toContain("No fixed events are saved for this day.");
    expect(text(fixture)).toContain("No active flexible tasks are saved yet.");
  });

  it("renders saved inputs clearly when a planning day has no schedule snapshot", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    expect(text(fixture)).toContain("No schedule snapshot yet.");
    expect(text(fixture)).toContain(
      "Saved inputs are still shown below so the day remains easy to review.",
    );
    expect(text(fixture)).toContain("Team meeting");
    expect(text(fixture)).toContain("Write report");
    expect(text(fixture)).toContain("Snapshot");
    expect(text(fixture)).toContain("None");
    expect(announcement(fixture)).toContain("Planner workspace loaded");
  });

  it("records partial study progress and replaces the visible plan after an interruption", async () => {
    plannerApi.result = workspaceData({
      tasks: [task, studyTask],
      snapshot: canonicalSnapshot,
    });
    plannerApi.interruptionResponse = of(revisedStudySnapshot);
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    setInput(fixture, "#progress-minutes", "60");
    setInput(fixture, "#progress-recorded", "2026-07-04T14:00");
    setInput(fixture, "#progress-time-zone", "Europe/Brussels");
    const progressTask = query(fixture, "#progress-task") as HTMLSelectElement;
    progressTask.value = "task-study";
    progressTask.dispatchEvent(new Event("change", { bubbles: true }));
    formByLabel(fixture, "Record task progress").dispatchEvent(submitEvent());
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(plannerApi.recordedProgress).toEqual([
      {
        planningDayId: "day-1",
        request: {
          task_id: "task-study",
          completed_minutes: 60,
          recorded_at: "2026-07-04T14:00:00+02:00",
        },
      },
    ]);
    expect(text(fixture)).toContain("Study notes");
    expect(text(fixture)).toContain("1 hr completed");
    expect(text(fixture)).toContain("30 min remaining");

    setInput(fixture, "#interruption-start", "2026-07-04T14:00");
    setInput(fixture, "#interruption-end", "2026-07-04T15:15");
    setInput(fixture, "#interruption-zone", "Europe/Brussels");
    setInput(fixture, "#interruption-reported", "2026-07-04T14:00");
    formByLabel(fixture, "Report interruption").dispatchEvent(submitEvent());
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(plannerApi.reportedInterruptions).toEqual([
      {
        planningDayId: "day-1",
        request: {
          start_at: "2026-07-04T14:00:00+02:00",
          end_at: "2026-07-04T15:15:00+02:00",
          time_zone: "Europe/Brussels",
          reported_at: "2026-07-04T14:00:00+02:00",
        },
      },
    ]);
    expect(plannerApi.loadedDates).toEqual([selectedDate]);
    expect(text(fixture)).toContain("Moved work");
    expect(text(fixture)).toContain(
      "Study notes was moved after reported unavailable time.",
    );
    expect(text(fixture)).toContain(
      "Revised schedule snapshot v3 is now shown.",
    );
    expect(text(fixture)).toContain("v3");
    expect(timelineBlocks(fixture).map((block) => block.kind)).toEqual([
      "task",
      "interruption",
      "task",
    ]);
  });

  it("marks unfinished work complete and removes it from progress choices", async () => {
    plannerApi.result = workspaceData({ snapshot: canonicalSnapshot });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    buttonByText(fixture, "Mark complete", "Flexible tasks").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(plannerApi.recordedProgress).toEqual([
      {
        planningDayId: "day-1",
        request: {
          task_id: "task-1",
          completed_minutes: 90,
          recorded_at: expect.stringMatching(
            /^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/,
          ),
        },
      },
    ]);
    const progressTask = query(fixture, "#progress-task") as HTMLSelectElement;
    expect(text(fixture)).toContain("Progress saved");
    expect(text(fixture)).toContain("Completed history");
    expect(text(fixture)).toContain("1 hr 30 min completed");
    expect(text(fixture)).toContain("0 min remaining");
    expect(progressTask.textContent).not.toContain("Write report");
    expect(() =>
      buttonByText(fixture, "Mark complete", "Flexible tasks"),
    ).toThrow();
  });

  it("blocks invalid interruption intervals before requesting recovery", async () => {
    plannerApi.result = workspaceData({ snapshot: canonicalSnapshot });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    setInput(fixture, "#interruption-start", "2026-07-04T15:15");
    setInput(fixture, "#interruption-end", "2026-07-04T14:00");
    setInput(fixture, "#interruption-zone", "Europe/Brussels");
    setInput(fixture, "#interruption-reported", "2026-07-04T15:15");
    formByLabel(fixture, "Report interruption").dispatchEvent(submitEvent());
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(plannerApi.reportedInterruptions).toEqual([]);
    expect(text(fixture)).toContain(
      "Review the interruption details before submitting.",
    );
    expect(text(fixture)).toContain("End time must be after start time.");
    expect(inputAriaInvalid(fixture, "#interruption-end")).toBe("true");
  });

  it("shows completed history without offering completed work for more progress", async () => {
    plannerApi.result = workspaceData({
      progress: [{ ...progressRecord, completed_minutes: 90 }],
      snapshot: canonicalSnapshot,
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const progressTask = query(fixture, "#progress-task") as HTMLSelectElement;

    expect(text(fixture)).toContain("Completed history");
    expect(text(fixture)).toContain("Write report");
    expect(text(fixture)).toContain("Completed");
    expect(progressTask.textContent).not.toContain("Write report");
    expect(() =>
      buttonByText(fixture, "Mark complete", "Flexible tasks"),
    ).toThrow();
  });

  it("renders schedule and fixed-event times in their retained IANA zones", async () => {
    const tokyoEvent: FixedEvent = {
      ...fixedEvent,
      id: "event-tokyo",
      title: "Tokyo call",
      start_at: "2026-07-04T00:00:00Z",
      end_at: "2026-07-04T01:00:00Z",
      time_zone: "Asia/Tokyo",
    };
    const newYorkSnapshot: ScheduleSnapshot = {
      ...snapshot,
      items: [
        {
          ...snapshot.items[0],
          start_at: "2026-07-04T13:00:00Z",
          end_at: "2026-07-04T14:00:00Z",
        },
      ],
    };
    plannerApi.result = workspaceData({
      day: {
        id: "day-1",
        local_date: selectedDate,
        time_zone: "America/New_York",
        current_snapshot_id: "snapshot-1",
        created_at: "2026-07-03T08:00:00Z",
      },
      fixedEvents: [tokyoEvent],
      snapshot: newYorkSnapshot,
    });

    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const timelineText =
      query(fixture, "[aria-labelledby='timeline-title']")?.textContent ?? "";
    const fixedEventsText =
      query(fixture, "[aria-labelledby='fixed-events-title']")?.textContent ??
      "";
    const newYorkRange = expectedTimeRange(
      "2026-07-04T13:00:00Z",
      "2026-07-04T14:00:00Z",
      "America/New_York",
    );
    const tokyoRange = expectedTimeRange(
      "2026-07-04T00:00:00Z",
      "2026-07-04T01:00:00Z",
      "Asia/Tokyo",
    );
    const brusselsScheduleRange = expectedTimeRange(
      "2026-07-04T13:00:00Z",
      "2026-07-04T14:00:00Z",
      "Europe/Brussels",
    );
    const brusselsFixedEventRange = expectedTimeRange(
      "2026-07-04T00:00:00Z",
      "2026-07-04T01:00:00Z",
      "Europe/Brussels",
    );

    expect(timelineText).toContain("Write report");
    expect(timelineText).toContain(newYorkRange);
    expect(timelineText).not.toContain(brusselsScheduleRange);
    expect(fixedEventsText).toContain("Tokyo call");
    expect(fixedEventsText).toContain(tokyoRange);
    expect(fixedEventsText).not.toContain(brusselsFixedEventRange);
  });

  it("preserves selected-date context in the accessible loading state", async () => {
    const pendingLoad = new Subject<PlannerWorkspaceData>();
    plannerApi.responses.set(selectedDate, pendingLoad);

    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const liveAnnouncement = announcement(fixture).trim();

    expect(text(fixture)).toContain("Loading");
    expect(text(fixture)).toContain("Keeping your selected day in view");
    expect(liveAnnouncement).toContain("Loading planner workspace for");
    expect(liveAnnouncement).toContain("July 4, 2026");
    expect(
      fixture.nativeElement.querySelector("[aria-busy='true']"),
    ).not.toBeNull();
    expect(text(fixture)).not.toContain("Write report");

    pendingLoad.next(workspaceData({ snapshot: null }));
    pendingLoad.complete();
  });

  it("keeps workspace regions on responsive desktop and narrow-width grids", async () => {
    plannerApi.result = workspaceData({ snapshot: canonicalSnapshot });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const timeline = query(fixture, "[aria-labelledby='timeline-title']");
    const fixedEvents = query(
      fixture,
      "[aria-labelledby='fixed-events-title']",
    );
    const dateControlGroup = query(fixture, "#planner-date")?.parentElement;

    expect(query(fixture, "header")?.className).toContain("lg:grid-cols");
    expect(query(fixture, "form")?.className).toContain("rounded-lg");
    expect(timeline?.parentElement?.className).toContain("lg:grid-cols");
    expect(fixedEvents?.parentElement?.className).toContain("lg:grid-cols-2");
    expect(query(fixture, "#planner-date")?.className).toContain("w-full");
    expect(dateControlGroup?.className).toContain("sm:flex-row");
    expect(
      query(fixture, "[data-testid='daily-timeline']")?.className,
    ).toContain("min-h");
    expect(text(fixture)).toContain("Day timeline");
    expect(text(fixture)).toContain("Planning inputs");
  });

  it("positions timeline blocks from item times without overlap", async () => {
    plannerApi.result = workspaceData({ snapshot: canonicalSnapshot });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const blocks = timelineBlocks(fixture);

    expect(blocks.length).toBe(5);
    for (let index = 1; index < blocks.length; index += 1) {
      const previous = blocks[index - 1];
      const current = blocks[index];
      expect(current.top).toBeGreaterThanOrEqual(
        previous.top + previous.height,
      );
    }
    expect(blocks[0]).toMatchObject({
      kind: "fixed_event",
      top: 60,
      height: 60,
    });
    expect(blocks[1]).toMatchObject({ kind: "task", top: 120, height: 90 });
  });

  it("renders overlapping locked snapshot blocks in separate timeline lanes", async () => {
    plannerApi.result = workspaceData({ snapshot: overlappingLockedSnapshot });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const blocks = timelineBlocks(fixture);

    expect(blocks).toEqual([
      {
        kind: "fixed_event",
        top: 60,
        height: 60,
        laneIndex: 0,
        laneCount: 2,
        left: 0,
        width: 50,
      },
      {
        kind: "interruption",
        top: 90,
        height: 60,
        laneIndex: 1,
        laneCount: 2,
        left: 50,
        width: 50,
      },
      {
        kind: "task",
        top: 150,
        height: 60,
        laneIndex: 0,
        laneCount: 1,
        left: 0,
        width: 100,
      },
    ]);
    expect(blocks[1].top).toBeLessThan(blocks[0].top + blocks[0].height);
    expect(blocks[1].left).toBeGreaterThanOrEqual(
      blocks[0].left + blocks[0].width,
    );
  });

  it("generates a plan, shows pending state, and displays the returned snapshot", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const generated = {
      ...canonicalSnapshot,
      id: "snapshot-generated",
      version: 4,
    };
    const generateResponse = new Subject<ScheduleSnapshot>();
    plannerApi.generateResponse = generateResponse;
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    buttonByText(fixture, "Generate plan", "Generate schedule").click();
    fixture.detectChanges();

    expect(plannerApi.generatedPlanningDayIds).toEqual(["day-1"]);
    expect(text(fixture)).toContain(
      "Generating a schedule from the saved planning inputs.",
    );
    expect(query(fixture, "button[aria-busy='true']")?.textContent).toContain(
      "Generating",
    );

    generateResponse.next(generated);
    generateResponse.complete();
    fixture.detectChanges();

    expect(text(fixture)).toContain("Generated schedule snapshot v4.");
    expect(text(fixture)).toContain("Write report");
    expect(text(fixture)).toContain("v4");
  });

  it("replaces an older displayed snapshot with the generated latest snapshot", async () => {
    plannerApi.result = workspaceData({ snapshot });
    const generated = {
      ...canonicalSnapshot,
      id: "snapshot-generated",
      version: 4,
    };
    plannerApi.generateResponse = of(generated);
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    expect(text(fixture)).toContain("v2");
    expect(timelineBlocks(fixture).map((block) => block.kind)).toEqual([
      "task",
      "designated_free_time",
    ]);

    buttonByText(fixture, "Generate plan", "Generate schedule").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(plannerApi.generatedPlanningDayIds).toEqual(["day-1"]);
    expect(text(fixture)).toContain("Generated schedule snapshot v4.");
    expect(text(fixture)).toContain("v4");
    expect(timelineBlocks(fixture).map((block) => block.kind)).toEqual([
      "fixed_event",
      "task",
      "buffer",
      "interruption",
      "designated_free_time",
    ]);
  });

  it("does not apply a generated snapshot after the user changes days", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const generated = {
      ...canonicalSnapshot,
      id: "snapshot-generated",
      version: 4,
    };
    const generateResponse = new Subject<ScheduleSnapshot>();
    plannerApi.generateResponse = generateResponse;
    plannerApi.responses.set(
      "2026-07-05",
      of(
        workspaceData({
          selectedDate: "2026-07-05",
          planningDays: [
            {
              id: "day-2",
              local_date: "2026-07-05",
              time_zone: "Europe/Brussels",
              current_snapshot_id: null,
              created_at: "2026-07-03T08:00:00Z",
            },
          ],
          day: {
            id: "day-2",
            local_date: "2026-07-05",
            time_zone: "Europe/Brussels",
            current_snapshot_id: null,
            created_at: "2026-07-03T08:00:00Z",
          },
          fixedEvents: [],
          snapshot: null,
        }),
      ),
    );
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    buttonByText(fixture, "Generate plan", "Generate schedule").click();
    fixture.detectChanges();
    routeParams.next(convertToParamMap({ date: "2026-07-05" }));
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();
    generateResponse.next(generated);
    generateResponse.complete();
    fixture.detectChanges();

    expect(plannerApi.generatedPlanningDayIds).toEqual(["day-1"]);
    expect(text(fixture)).toContain("July 5, 2026");
    expect(text(fixture)).not.toContain("Generated schedule snapshot v4.");
    expect(query(fixture, "[data-testid='daily-timeline']")).toBeNull();
  });

  it("does not show a generate-plan error after the user changes days", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const generateResponse = new Subject<ScheduleSnapshot>();
    plannerApi.generateResponse = generateResponse;
    plannerApi.responses.set(
      "2026-07-05",
      of(
        workspaceData({
          selectedDate: "2026-07-05",
          planningDays: [
            {
              id: "day-2",
              local_date: "2026-07-05",
              time_zone: "Europe/Brussels",
              current_snapshot_id: null,
              created_at: "2026-07-03T08:00:00Z",
            },
          ],
          day: {
            id: "day-2",
            local_date: "2026-07-05",
            time_zone: "Europe/Brussels",
            current_snapshot_id: null,
            created_at: "2026-07-03T08:00:00Z",
          },
          fixedEvents: [],
          snapshot: null,
        }),
      ),
    );
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    buttonByText(fixture, "Generate plan", "Generate schedule").click();
    fixture.detectChanges();
    routeParams.next(convertToParamMap({ date: "2026-07-05" }));
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();
    generateResponse.error(new HttpErrorResponse({ status: 503 }));
    fixture.detectChanges();

    expect(plannerApi.generatedPlanningDayIds).toEqual(["day-1"]);
    expect(text(fixture)).toContain("July 5, 2026");
    expect(text(fixture)).not.toContain("scheduler is unavailable");
    expect(text(fixture)).not.toContain("We could not generate the schedule");
  });

  it("requires a saved planning day before generating a plan", async () => {
    plannerApi.result = workspaceData({
      day: null,
      fixedEvents: [],
      tasks: [],
      snapshot: null,
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    (
      fixture.componentInstance as unknown as { generatePlan(): void }
    ).generatePlan();
    fixture.detectChanges();

    expect(text(fixture)).toContain("Save a planning day before generating");
    expect(plannerApi.generatedPlanningDayIds).toEqual([]);
  });

  it.each([
    [
      422,
      "The saved planning inputs could not produce a schedule. Review fixed events and task constraints, then try again.",
    ],
    [
      503,
      "The scheduler is unavailable right now. Saved inputs are unchanged; try again when scheduling is available.",
    ],
    [403, "Your session cannot generate this schedule."],
    [404, "That planning day is no longer available."],
    [500, "We could not generate the schedule."],
  ])("shows generate-plan error state for HTTP %s", async (status, message) => {
    plannerApi.result = workspaceData({ snapshot: null });
    plannerApi.generateError = new HttpErrorResponse({ status });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    buttonByText(fixture, "Generate plan", "Generate schedule").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain(message);
  });

  it("presents no-fit decisions as deferred work with scheduler-code wording", async () => {
    plannerApi.result = workspaceData({
      tasks: [task, taskThatDoesNotFit],
      snapshot: noFitSnapshot,
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    expect(text(fixture)).toContain("Deferred work");
    expect(text(fixture)).toContain("1");
    expect(text(fixture)).toContain("Deferred or unscheduled work");
    expect(text(fixture)).toContain("Prepare workshop");
    expect(text(fixture)).toContain(
      "Prepare workshop was not scheduled because there is not enough remaining time in the day.",
    );
    expect(text(fixture)).toContain("insufficient_remaining_day_time");
    expect(text(fixture)).toContain("Scheduler reason out_of_contract_reason.");
  });

  it("preserves selected-date context when the API fails", async () => {
    plannerApi.error = new HttpErrorResponse({
      status: 503,
      statusText: "Service Unavailable",
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    expect(text(fixture)).toContain("Planner data did not load");
    expect(text(fixture)).toContain("Your selected date is still here");
    expect(announcement(fixture)).toContain(
      "We could not load this planning day",
    );
  });

  it("announces permission failures without rendering another user's data", async () => {
    plannerApi.error = new HttpErrorResponse({
      status: 403,
      statusText: "Forbidden",
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    expect(text(fixture)).toContain("We cannot open");
    expect(text(fixture)).toContain(
      "Your session cannot open this planning day",
    );
    expect(text(fixture)).not.toContain("Team meeting");
  });

  it("updates the route when the user chooses a different day", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const dateInput = fixture.nativeElement.querySelector(
      "#planner-date",
    ) as HTMLInputElement;

    dateInput.value = "2026-07-05";
    dateInput.dispatchEvent(new Event("input", { bubbles: true }));
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector("form") as HTMLFormElement
    ).dispatchEvent(new SubmitEvent("submit", { bubbles: true }));

    expect(router.navigations).toEqual([
      { queryParams: { date: "2026-07-05" } },
    ]);
  });

  it("keeps the latest route date when an older load resolves after it", async () => {
    const firstLoad = new Subject<PlannerWorkspaceData>();
    const secondLoad = new Subject<PlannerWorkspaceData>();
    plannerApi.responses.set("2026-07-04", firstLoad);
    plannerApi.responses.set("2026-07-05", secondLoad);

    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    routeParams.next(convertToParamMap({ date: "2026-07-05" }));
    fixture.detectChanges();

    firstLoad.next(
      workspaceData({
        selectedDate: "2026-07-04",
        tasks: [{ ...task, title: "Stale task" }],
      }),
    );
    firstLoad.complete();
    fixture.detectChanges();

    expect(text(fixture)).toContain("Loading");
    expect(text(fixture)).not.toContain("Stale task");

    secondLoad.next(
      workspaceData({
        selectedDate: "2026-07-05",
        tasks: [{ ...task, title: "Current task" }],
      }),
    );
    secondLoad.complete();
    fixture.detectChanges();

    expect(plannerApi.loadedDates).toEqual(["2026-07-04", "2026-07-05"]);
    expect(text(fixture)).toContain("Current task");
    expect(text(fixture)).not.toContain("Stale task");
    expect(announcement(fixture)).toContain("July 5, 2026");
  });

  it("falls back to today when a route date has an impossible calendar day", async () => {
    routeParams = new BehaviorSubject(
      convertToParamMap({ date: "2026-02-31" }),
    );
    plannerApi.result = workspaceData({ snapshot: null });

    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const today = todayLocalDate();

    expect(plannerApi.loadedDates).toEqual([today]);
    expect(
      (query(fixture, "#planner-date") as HTMLInputElement | null)?.value,
    ).toBe(today);
  });

  it("blocks invalid task split settings before calling the API", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    setInput(fixture, "#task-title", "Draft outline");
    setInput(fixture, "#task-estimate", "30");
    setInput(fixture, "#task-priority", "3");
    setCheckbox(fixture, "#task-splitting", true);
    formByLabel(fixture, "Flexible task details").dispatchEvent(submitEvent());
    fixture.detectChanges();

    expect(text(fixture)).toContain("Enter the minimum split segment.");
    expect(plannerApi.createdTasks).toEqual([]);
  });

  it("blocks invalid task priorities before calling the API", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    setInput(fixture, "#task-title", "Draft outline");
    setInput(fixture, "#task-estimate", "30");
    setInput(fixture, "#task-priority", "6");
    formByLabel(fixture, "Flexible task details").dispatchEvent(submitEvent());
    fixture.detectChanges();

    expect(text(fixture)).toContain("Priority must be from 1 to 5.");
    expect(plannerApi.createdTasks).toEqual([]);
  });

  it("renders invalid task due date and earliest start errors inline", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    setInput(fixture, "#task-title", "Draft outline");
    setInput(fixture, "#task-estimate", "30");
    setInput(fixture, "#task-priority", "3");
    updateTaskFormForTest(fixture, {
      dueDate: "2026-02-31",
      earliestStartLocal: "2026-02-31T09:00",
    });
    formByLabel(fixture, "Flexible task details").dispatchEvent(submitEvent());
    fixture.detectChanges();

    expect(text(fixture)).toContain("Use a valid due date.");
    expect(text(fixture)).toContain("Use a valid earliest start time.");
    expect(inputAriaInvalid(fixture, "#task-due-date")).toBe("true");
    expect(inputAriaInvalid(fixture, "#task-earliest")).toBe("true");
    expect(plannerApi.createdTasks).toEqual([]);
  });

  it("maps task API 422 validation details to inline field errors", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    plannerApi.taskMutationError = new HttpErrorResponse({
      status: 422,
      statusText: "Unprocessable Entity",
      error: {
        detail: [
          {
            loc: ["body", "title"],
            msg: "String should have at most 200 characters",
          },
          {
            loc: ["body", "due_date"],
            msg: "Value error, due_date must be a date without a time",
          },
        ],
      },
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    setInput(fixture, "#task-title", "Server rejected task");
    setInput(fixture, "#task-estimate", "30");
    setInput(fixture, "#task-priority", "3");
    formByLabel(fixture, "Flexible task details").dispatchEvent(submitEvent());
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain(
      "The API could not accept those details. Review the form and try again.",
    );
    expect(text(fixture)).toContain("Use 200 characters or fewer.");
    expect(text(fixture)).toContain("Use a date without a time.");
    expect(inputAriaInvalid(fixture, "#task-title")).toBe("true");
    expect(inputAriaInvalid(fixture, "#task-due-date")).toBe("true");
  });

  it("defaults a new fixed event to the selected planning day's time zone", async () => {
    plannerApi.result = workspaceData({
      day: {
        id: "day-1",
        local_date: selectedDate,
        time_zone: "America/New_York",
        current_snapshot_id: null,
        created_at: "2026-07-03T08:00:00Z",
      },
      fixedEvents: [],
      snapshot: null,
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    expect(inputValue(fixture, "#fixed-event-time-zone")).toBe(
      "America/New_York",
    );
  });

  it("trims fixed-event time zones before converting and submitting", async () => {
    plannerApi.result = workspaceData({ fixedEvents: [], snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    setInput(fixture, "#fixed-event-title", "Trimmed event");
    setInput(fixture, "#fixed-event-start", "2026-07-04T09:00");
    setInput(fixture, "#fixed-event-end", "2026-07-04T10:00");
    setInput(fixture, "#fixed-event-time-zone", " Europe/Brussels ");
    formByLabel(fixture, "Fixed event details").dispatchEvent(submitEvent());
    fixture.detectChanges();
    await nextMicrotask();

    expect(plannerApi.savedFixedEvents).toEqual([
      {
        selectedDateValue: selectedDate,
        existingDay: workspaceData({ fixedEvents: [], snapshot: null }).day,
        request: {
          title: "Trimmed event",
          start_at: "2026-07-04T09:00:00+02:00",
          end_at: "2026-07-04T10:00:00+02:00",
          time_zone: "Europe/Brussels",
        },
      },
    ]);
  });

  it("blocks invalid fixed-event intervals before calling the API", async () => {
    plannerApi.result = workspaceData({ fixedEvents: [], snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    setInput(fixture, "#fixed-event-title", "Backwards event");
    setInput(fixture, "#fixed-event-start", "2026-07-04T10:00");
    setInput(fixture, "#fixed-event-end", "2026-07-04T09:00");
    setInput(fixture, "#fixed-event-time-zone", "Europe/Brussels");
    formByLabel(fixture, "Fixed event details").dispatchEvent(submitEvent());
    fixture.detectChanges();

    expect(text(fixture)).toContain("End time must be after start time.");
    expect(plannerApi.savedFixedEvents).toEqual([]);
  });

  it("edits a task, refreshes the workspace, and keeps user IDs out of payloads", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    buttonByText(fixture, "Edit", "Flexible tasks").click();
    fixture.detectChanges();
    setInput(fixture, "#task-title", "Write final report");
    setInput(fixture, "#task-estimate", "75");
    setInput(fixture, "#task-priority", "4");
    formByLabel(fixture, "Flexible task details").dispatchEvent(submitEvent());
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(plannerApi.updatedTasks).toEqual([
      {
        id: "task-1",
        request: {
          title: "Write final report",
          estimated_minutes: 75,
          priority: 4,
          due_date: null,
          earliest_start_at: null,
          splitting_allowed: false,
          min_segment_minutes: null,
        },
      },
    ]);
    expect(JSON.stringify(plannerApi.updatedTasks)).not.toContain("user-1");
    expect(plannerApi.loadedDates).toEqual([selectedDate, selectedDate]);
  });

  it("edits a fixed event, refreshes the workspace, and keeps user IDs out of payloads", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    buttonByText(fixture, "Edit", "Fixed events").click();
    fixture.detectChanges();
    setInput(fixture, "#fixed-event-title", "Planning review");
    setInput(fixture, "#fixed-event-start", "2026-07-04T11:00");
    setInput(fixture, "#fixed-event-end", "2026-07-04T12:00");
    formByLabel(fixture, "Fixed event details").dispatchEvent(submitEvent());
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(plannerApi.updatedFixedEvents).toEqual([
      {
        planningDayId: "day-1",
        fixedEventId: "event-1",
        request: {
          title: "Planning review",
          start_at: "2026-07-04T11:00:00+02:00",
          end_at: "2026-07-04T12:00:00+02:00",
          time_zone: "Europe/Brussels",
        },
      },
    ]);
    expect(JSON.stringify(plannerApi.updatedFixedEvents)).not.toContain(
      "user-1",
    );
    expect(plannerApi.loadedDates).toEqual([selectedDate, selectedDate]);
  });

  it("confirms deletion before removing a task and refreshing", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    buttonByText(fixture, "Delete", "Flexible tasks").click();
    fixture.detectChanges();
    await nextMicrotask();

    expect(confirm).toHaveBeenCalledWith(
      'Delete "Write report" from active flexible tasks?',
    );
    expect(plannerApi.deletedTasks).toEqual(["task-1"]);
    expect(plannerApi.loadedDates).toEqual([selectedDate, selectedDate]);
    confirm.mockRestore();
  });

  it("keeps a cancelled fixed-event deletion local", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    buttonByText(fixture, "Delete", "Fixed events").click();

    expect(plannerApi.deletedFixedEvents).toEqual([]);
    expect(plannerApi.loadedDates).toEqual([selectedDate]);
    confirm.mockRestore();
  });

  it("surfaces fixed-event API conflicts inline without reloading", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    plannerApi.fixedEventMutationError = new HttpErrorResponse({
      status: 409,
      statusText: "Conflict",
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    buttonByText(fixture, "Edit", "Fixed events").click();
    fixture.detectChanges();
    setInput(fixture, "#fixed-event-title", "Overlap");
    formByLabel(fixture, "Fixed event details").dispatchEvent(submitEvent());
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain(
      "That change conflicts with another saved event for the day.",
    );
    expect(plannerApi.loadedDates).toEqual([selectedDate]);
  });

  it("maps fixed-event API 422 validation details to inline field errors", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    plannerApi.fixedEventMutationError = new HttpErrorResponse({
      status: 422,
      statusText: "Unprocessable Entity",
      error: {
        detail: [
          {
            loc: ["body", "time_zone"],
            msg: "String should have at most 64 characters",
          },
          {
            loc: ["body", "end_at"],
            msg: "Value error, end_at must be after start_at",
          },
        ],
      },
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    buttonByText(fixture, "Edit", "Fixed events").click();
    fixture.detectChanges();
    setInput(fixture, "#fixed-event-title", "Server rejected event");
    formByLabel(fixture, "Fixed event details").dispatchEvent(submitEvent());
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain(
      "The API could not accept those details. Review the form and try again.",
    );
    expect(text(fixture)).toContain("Use 64 characters or fewer.");
    expect(text(fixture)).toContain("End time must be after start time.");
    expect(inputAriaInvalid(fixture, "#fixed-event-time-zone")).toBe("true");
    expect(inputAriaInvalid(fixture, "#fixed-event-end")).toBe("true");
  });
});

class FakeApiClient {
  readonly responses = new Map<string, unknown>();
  readonly gets: string[] = [];
  readonly posts: Array<{ path: string; body: unknown }> = [];
  readonly puts: Array<{ path: string; body: unknown }> = [];
  readonly deletes: string[] = [];

  getJson<TResponse>(path: string): Observable<TResponse> {
    this.gets.push(path);

    if (!this.responses.has(path)) {
      throw new Error(`Unexpected GET ${path}`);
    }

    return of(this.responses.get(path) as TResponse);
  }

  postJson<TRequest, TResponse>(
    path: string,
    body: TRequest,
  ): Observable<TResponse> {
    this.posts.push({ path, body });

    if (!this.responses.has(path)) {
      throw new Error(`Unexpected POST ${path}`);
    }

    return of(this.responses.get(path) as TResponse);
  }

  postEmpty<TResponse>(path: string): Observable<TResponse> {
    this.posts.push({ path, body: null });

    if (!this.responses.has(path)) {
      throw new Error(`Unexpected POST ${path}`);
    }

    return of(this.responses.get(path) as TResponse);
  }

  putJson<TRequest, TResponse>(
    path: string,
    body: TRequest,
  ): Observable<TResponse> {
    this.puts.push({ path, body });

    if (!this.responses.has(path)) {
      throw new Error(`Unexpected PUT ${path}`);
    }

    return of(this.responses.get(path) as TResponse);
  }

  deleteEmpty(path: string): Observable<void> {
    this.deletes.push(path);
    const key = `DELETE ${path}`;

    if (!this.responses.has(key)) {
      throw new Error(`Unexpected DELETE ${path}`);
    }

    return of(this.responses.get(key) as void);
  }
}

class FakePlannerApi {
  result: PlannerWorkspaceData = workspaceData({ snapshot: null });
  error: unknown = null;
  readonly responses = new Map<string, Observable<PlannerWorkspaceData>>();
  readonly loadedDates: string[] = [];
  readonly createdTasks: unknown[] = [];
  readonly updatedTasks: unknown[] = [];
  readonly deletedTasks: string[] = [];
  readonly savedFixedEvents: unknown[] = [];
  readonly updatedFixedEvents: unknown[] = [];
  readonly deletedFixedEvents: unknown[] = [];
  readonly generatedPlanningDayIds: string[] = [];
  readonly recordedProgress: unknown[] = [];
  readonly reportedInterruptions: unknown[] = [];
  taskMutationError: unknown = null;
  fixedEventMutationError: unknown = null;
  generateError: unknown = null;
  generateResponse: Observable<ScheduleSnapshot> | null = null;
  progressError: unknown = null;
  interruptionError: unknown = null;
  interruptionResponse: Observable<ScheduleSnapshot> | null = null;

  loadWorkspaceDate(date: string): Observable<PlannerWorkspaceData> {
    this.loadedDates.push(date);

    const response = this.responses.get(date);
    if (response) {
      return response;
    }

    if (this.error !== null) {
      return throwError(() => this.error);
    }

    return of({ ...this.result, selectedDate: date });
  }

  createTask(request: unknown): Observable<Task> {
    this.createdTasks.push(request);
    if (this.taskMutationError !== null) {
      return throwError(() => this.taskMutationError);
    }
    return of({ ...task, ...(request as Partial<Task>) });
  }

  updateTask(id: string, request: unknown): Observable<Task> {
    this.updatedTasks.push({ id, request });
    if (this.taskMutationError !== null) {
      return throwError(() => this.taskMutationError);
    }
    return of({ ...task, id, ...(request as Partial<Task>) });
  }

  deleteTask(id: string): Observable<void> {
    this.deletedTasks.push(id);
    return of(undefined);
  }

  saveFixedEventForDate(
    selectedDateValue: string,
    existingDay: unknown,
    request: unknown,
  ): Observable<FixedEvent> {
    this.savedFixedEvents.push({ selectedDateValue, existingDay, request });
    if (this.fixedEventMutationError !== null) {
      return throwError(() => this.fixedEventMutationError);
    }
    return of({ ...fixedEvent, ...(request as Partial<FixedEvent>) });
  }

  updateFixedEvent(
    planningDayId: string,
    fixedEventId: string,
    request: unknown,
  ): Observable<FixedEvent> {
    this.updatedFixedEvents.push({ planningDayId, fixedEventId, request });
    if (this.fixedEventMutationError !== null) {
      return throwError(() => this.fixedEventMutationError);
    }
    return of({
      ...fixedEvent,
      id: fixedEventId,
      ...(request as Partial<FixedEvent>),
    });
  }

  deleteFixedEvent(
    planningDayId: string,
    fixedEventId: string,
  ): Observable<void> {
    this.deletedFixedEvents.push({ planningDayId, fixedEventId });
    return of(undefined);
  }

  generatePlan(planningDayId: string): Observable<ScheduleSnapshot> {
    this.generatedPlanningDayIds.push(planningDayId);
    if (this.generateResponse !== null) {
      return this.generateResponse;
    }
    if (this.generateError !== null) {
      return throwError(() => this.generateError);
    }
    return of(snapshot);
  }

  recordTaskProgress(
    planningDayId: string,
    request: unknown,
  ): Observable<TaskProgress> {
    this.recordedProgress.push({ planningDayId, request });
    if (this.progressError !== null) {
      return throwError(() => this.progressError);
    }
    return of({
      ...progressRecord,
      id: `progress-${this.recordedProgress.length}`,
      planning_day_id: planningDayId,
      ...(request as Partial<TaskProgress>),
    });
  }

  reportInterruption(
    planningDayId: string,
    request: unknown,
  ): Observable<ScheduleSnapshot> {
    this.reportedInterruptions.push({ planningDayId, request });
    if (this.interruptionResponse !== null) {
      return this.interruptionResponse;
    }
    if (this.interruptionError !== null) {
      return throwError(() => this.interruptionError);
    }
    return of({ ...canonicalSnapshot, id: "snapshot-revised", version: 3 });
  }
}

class FakeRouter {
  readonly navigations: Array<{ queryParams: Record<string, string> }> = [];

  navigate(
    _commands: unknown[],
    options: { queryParams: Record<string, string> },
  ): Promise<boolean> {
    this.navigations.push({ queryParams: options.queryParams });
    return Promise.resolve(true);
  }
}

async function renderWorkspace(
  queryParamMap: BehaviorSubject<ReturnType<typeof convertToParamMap>>,
  plannerApi: FakePlannerApi,
  router: FakeRouter,
): Promise<ComponentFixture<PlannerWorkspacePage>> {
  await TestBed.configureTestingModule({
    imports: [PlannerWorkspacePage],
    providers: [
      { provide: PlannerApiService, useValue: plannerApi },
      { provide: AuthSessionService, useValue: new FakeAuthSession() },
      {
        provide: ActivatedRoute,
        useValue: { queryParamMap },
      },
      { provide: Router, useValue: router },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(PlannerWorkspacePage);
  fixture.detectChanges();
  await Promise.resolve();
  fixture.detectChanges();

  return fixture;
}

function workspaceData(
  overrides: Partial<PlannerWorkspaceData>,
): PlannerWorkspaceData {
  const localDate = overrides.selectedDate ?? selectedDate;

  return {
    selectedDate: localDate,
    planningDays: [
      {
        id: "day-1",
        local_date: localDate,
        time_zone: "Europe/Brussels",
        current_snapshot_id: overrides.snapshot ? "snapshot-1" : null,
        created_at: "2026-07-03T08:00:00Z",
      },
    ],
    day: {
      id: "day-1",
      local_date: localDate,
      time_zone: "Europe/Brussels",
      current_snapshot_id: overrides.snapshot ? "snapshot-1" : null,
      created_at: "2026-07-03T08:00:00Z",
    },
    fixedEvents: [fixedEvent],
    tasks: [task],
    progress: [],
    snapshot: null,
    ...overrides,
  };
}

class FakeAuthSession {
  readonly currentUser = signalLike<AuthUser | null>(sampleUser);
}

function signalLike<T>(initialValue: T): (() => T) & { set(value: T): void } {
  let value = initialValue;
  const read = (() => value) as (() => T) & { set(value: T): void };
  read.set = (nextValue: T) => {
    value = nextValue;
  };

  return read;
}

function text<T>(fixture: ComponentFixture<T>): string {
  return fixture.nativeElement.textContent;
}

function announcement<T>(fixture: ComponentFixture<T>): string {
  return (
    fixture.nativeElement.querySelector(
      '[data-testid="planner-announcement"]',
    ) as HTMLElement
  ).textContent;
}

function query<T>(
  fixture: ComponentFixture<T>,
  selector: string,
): Element | null {
  return fixture.nativeElement.querySelector(selector);
}

function setInput<T>(
  fixture: ComponentFixture<T>,
  selector: string,
  value: string,
): void {
  const control = query(fixture, selector) as HTMLInputElement;
  control.value = value;
  control.dispatchEvent(new Event("input", { bubbles: true }));
  fixture.detectChanges();
}

function inputValue<T>(fixture: ComponentFixture<T>, selector: string): string {
  return (query(fixture, selector) as HTMLInputElement).value;
}

function inputAriaInvalid<T>(
  fixture: ComponentFixture<T>,
  selector: string,
): string | null {
  return (query(fixture, selector) as HTMLInputElement).getAttribute(
    "aria-invalid",
  );
}

function updateTaskFormForTest(
  fixture: ComponentFixture<PlannerWorkspacePage>,
  patch: Record<string, unknown>,
): void {
  (
    fixture.componentInstance as unknown as {
      updateTaskForm(patch: Record<string, unknown>): void;
    }
  ).updateTaskForm(patch);
  fixture.detectChanges();
}

function setCheckbox<T>(
  fixture: ComponentFixture<T>,
  selector: string,
  checked: boolean,
): void {
  const control = query(fixture, selector) as HTMLInputElement;
  control.checked = checked;
  control.dispatchEvent(new Event("change", { bubbles: true }));
  fixture.detectChanges();
}

function formByLabel<T>(
  fixture: ComponentFixture<T>,
  label: string,
): HTMLFormElement {
  return query(fixture, `form[aria-label="${label}"]`) as HTMLFormElement;
}

function buttonByText<T>(
  fixture: ComponentFixture<T>,
  buttonText: string,
  regionLabel: string,
): HTMLButtonElement {
  const region = query(
    fixture,
    `[aria-labelledby="${regionIdForLabel(regionLabel)}"]`,
  );
  const buttons = Array.from(region?.querySelectorAll("button") ?? []);
  const button = buttons.find((candidate) =>
    candidate.textContent?.includes(buttonText),
  );

  if (!button) {
    throw new Error(`Could not find ${buttonText} button in ${regionLabel}`);
  }

  return button as HTMLButtonElement;
}

function regionIdForLabel(regionLabel: string): string {
  switch (regionLabel) {
    case "Flexible tasks":
      return "tasks-title";
    case "Fixed events":
      return "fixed-events-title";
    case "Generate schedule":
      return "recovery-title";
    case "Work progress":
      return "progress-title";
    case "Report interruption":
      return "interruption-title";
    default:
      throw new Error(`Unknown region label ${regionLabel}`);
  }
}

function timelineBlocks<T>(fixture: ComponentFixture<T>): Array<{
  readonly kind: string;
  readonly top: number;
  readonly height: number;
  readonly laneIndex: number;
  readonly laneCount: number;
  readonly left: number;
  readonly width: number;
}> {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll(
      "[data-testid='daily-timeline'] article",
    ),
  ).map((element) => ({
    kind: element.getAttribute("data-kind") ?? "",
    top: Number(element.getAttribute("data-top-minutes") ?? "0"),
    height: Number(element.getAttribute("data-height-minutes") ?? "0"),
    laneIndex: Number(element.getAttribute("data-lane-index") ?? "0"),
    laneCount: Number(element.getAttribute("data-lane-count") ?? "1"),
    left: Number(element.getAttribute("data-left-percent") ?? "0"),
    width: Number(element.getAttribute("data-width-percent") ?? "100"),
  }));
}

function submitEvent(): SubmitEvent {
  return new SubmitEvent("submit", { bubbles: true, cancelable: true });
}

function todayLocalDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function expectedTimeRange(
  startAt: string,
  endAt: string,
  timeZone: string,
): string {
  return `${expectedTime(startAt, timeZone)}-${expectedTime(endAt, timeZone)}`;
}

function expectedTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

async function firstValue<T>(observable: Observable<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    observable.subscribe({ next: resolve, error: reject });
  });
}

async function nextMicrotask(): Promise<void> {
  await Promise.resolve();
}
