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
    expect(data.snapshot?.id).toBe("snapshot-1");
    expect(api.gets).toEqual([
      "/planning/days",
      "/planning/tasks",
      "/planning/days/day-1/fixed-events",
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

  it("loads the query-selected day and renders snapshot, inputs, summary, and recovery regions", async () => {
    plannerApi.result = workspaceData({ snapshot });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    expect(plannerApi.loadedDates).toEqual([selectedDate]);
    expect(text(fixture)).toContain("Signed in as daily_user");
    expect(text(fixture)).toContain("Day timeline");
    expect(text(fixture)).toContain("Write report");
    expect(text(fixture)).toContain("Designated Free Time");
    expect(text(fixture)).toContain("Planning inputs");
    expect(text(fixture)).toContain("Team meeting");
    expect(text(fixture)).toContain("Snapshot");
    expect(text(fixture)).toContain("v2");
    expect(text(fixture)).toContain("Recovery actions");
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
    plannerApi.result = workspaceData({ snapshot });
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
    expect(text(fixture)).toContain("Day timeline");
    expect(text(fixture)).toContain("Planning inputs");
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
  taskMutationError: unknown = null;
  fixedEventMutationError: unknown = null;

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
    `[aria-labelledby="${regionLabel === "Flexible tasks" ? "tasks-title" : "fixed-events-title"}"]`,
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
