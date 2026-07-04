import { HttpErrorResponse } from "@angular/common/http";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap } from "@angular/router";
import { BehaviorSubject, Observable, Subject, of, throwError } from "rxjs";
import { beforeEach, describe, expect, it } from "vitest";

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
  result: PlannerWorkspaceData = workspaceData({ snapshot: null });
  error: unknown = null;
  readonly responses = new Map<string, Observable<PlannerWorkspaceData>>();
  readonly loadedDates: string[] = [];

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

async function firstValue<T>(observable: Observable<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    observable.subscribe({ next: resolve, error: reject });
  });
}
