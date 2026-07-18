import "@angular/compiler";

import { HttpErrorResponse } from "@angular/common/http";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap } from "@angular/router";
import { BehaviorSubject, Observable, of, throwError } from "rxjs";
import { describe, expect, it } from "vitest";

import { ApiClientService } from "../../core/api/api-client.service";
import { FreeTimeRange, FreeTimesApiService } from "./free-times-api.service";
import { FreeTimesPage } from "./free-times.page";

const freeTimeRange: FreeTimeRange = {
  start_date: "2026-07-01",
  end_date: "2026-07-04",
  minimum_minutes: 30,
  days: [
    {
      local_date: "2026-07-01",
      planning_day_id: "day-1",
      time_zone: "Europe/Brussels",
      status: "has_free_time",
      snapshot_id: "snapshot-1",
      snapshot_version: 2,
      snapshot_created_at: "2026-07-01T08:00:00Z",
      windows: [
        {
          local_date: "2026-07-01",
          planning_day_id: "day-1",
          time_zone: "Europe/Brussels",
          snapshot_id: "snapshot-1",
          snapshot_version: 2,
          snapshot_created_at: "2026-07-01T08:00:00Z",
          schedule_item_id: "item-1",
          start_at: "2026-07-01T11:00:00+02:00",
          end_at: "2026-07-01T11:45:00+02:00",
          duration_minutes: 45,
        },
      ],
    },
    {
      local_date: "2026-07-02",
      planning_day_id: "day-2",
      time_zone: "Europe/Brussels",
      status: "no_useful_free_time",
      snapshot_id: "snapshot-2",
      snapshot_version: 1,
      snapshot_created_at: "2026-07-02T08:00:00Z",
      windows: [],
    },
    {
      local_date: "2026-07-03",
      planning_day_id: "day-3",
      time_zone: "Europe/Brussels",
      status: "no_generated_plan",
      snapshot_id: null,
      snapshot_version: null,
      snapshot_created_at: null,
      windows: [],
    },
    {
      local_date: "2026-07-04",
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

describe("free-times API contract", () => {
  it("loads persisted free-time windows through the authenticated finder endpoint", async () => {
    const api = new FakeApiClient();
    api.responses.set(
      "/planning/free-times?start_date=2026-07-01&end_date=2026-07-03&minimum_minutes=30",
      freeTimeRange,
    );
    await TestBed.configureTestingModule({
      providers: [
        FreeTimesApiService,
        { provide: ApiClientService, useValue: api },
      ],
    }).compileComponents();
    const service = TestBed.inject(FreeTimesApiService);

    expect(
      await firstValue(service.findFreeTimes("2026-07-01", "2026-07-03", 30)),
    ).toEqual(freeTimeRange);
    expect(api.gets).toEqual([
      "/planning/free-times?start_date=2026-07-01&end_date=2026-07-03&minimum_minutes=30",
    ]);
    expect(api.gets.join("\n")).not.toContain("user-1");
  });
});

describe("rendered free-time finder", () => {
  it("renders windows, plan source metadata, status groups, and day links", async () => {
    const routeParams = new BehaviorSubject(
      convertToParamMap({
        start_date: "2026-07-01",
        end_date: "2026-07-04",
        minimum_minutes: "30",
      }),
    );
    const freeTimesApi = new FakeFreeTimesApi();
    const router = new FakeRouter();

    const fixture = await renderFreeTimes(routeParams, freeTimesApi, router);

    expect(freeTimesApi.requests).toEqual([
      {
        startDate: "2026-07-01",
        endDate: "2026-07-04",
        minimumMinutes: 30,
      },
    ]);
    expect(text(fixture)).toContain("Free-time finder");
    expect(text(fixture)).toContain("Results are grouped by saved daily plans");
    expect(text(fixture)).toContain("1 useful window");
    expect(text(fixture)).not.toContain("1 useful windows");
    expect(text(fixture)).toContain("45 min");
    expect(text(fixture)).toContain("Current plan");
    expect(text(fixture)).toContain("Plan:");
    expect(text(fixture)).not.toContain("Day day-1");
    expect(text(fixture)).not.toContain("Snapshot snapshot-1");
    expect(text(fixture)).not.toContain("Item item-1");
    expect(text(fixture)).toContain("No current plan");
    expect(text(fixture)).toContain(
      "No current plan is available for comparison on this date.",
    );
    expect(text(fixture)).toContain("Jul 3, 2026");
    expect(text(fixture)).toContain("No saved day");
    expect(text(fixture)).toContain(
      "No saved planning day exists for this date yet.",
    );
    expect(text(fixture)).toContain(
      "No saved day is available for comparison on this date.",
    );
    expect(text(fixture)).toContain("Jul 4, 2026");
    expect(
      elementByAriaLabel(fixture, "No saved day: No saved planning day"),
    ).not.toBeNull();
    expect(text(fixture)).toContain("No useful free time");
    expect(text(fixture)).toContain("No useful free-time window meets");
    expect(text(fixture)).toContain("Jul 2, 2026");
    expect(
      elementByAriaLabel(
        fixture,
        "No useful free time: Current plan without a useful free-time window",
      ),
    ).not.toBeNull();
    expect(
      linkByAriaLabel(
        fixture,
        "Open planner workspace for Jul 1, 2026",
      )?.getAttribute("href"),
    ).toBe("/planner?date=2026-07-01");
    expect(announcement(fixture)).toContain(
      "Free-time finder loaded 1 windows.",
    );
  });

  it("groups useful windows by date without using internal ids as primary content", async () => {
    const routeParams = new BehaviorSubject(
      convertToParamMap({
        start_date: "2026-07-01",
        end_date: "2026-07-02",
        minimum_minutes: "30",
      }),
    );
    const freeTimesApi = new FakeFreeTimesApi({
      ...freeTimeRange,
      start_date: "2026-07-01",
      end_date: "2026-07-02",
      days: [
        {
          ...freeTimeRange.days[0],
          windows: [
            freeTimeRange.days[0].windows[0],
            {
              ...freeTimeRange.days[0].windows[0],
              schedule_item_id: "item-2",
              start_at: "2026-07-01T15:00:00+02:00",
              end_at: "2026-07-01T16:00:00+02:00",
              duration_minutes: 60,
            },
          ],
        },
        {
          ...freeTimeRange.days[0],
          local_date: "2026-07-02",
          planning_day_id: "day-2",
          snapshot_id: "snapshot-2",
          snapshot_version: 4,
          windows: [
            {
              ...freeTimeRange.days[0].windows[0],
              local_date: "2026-07-02",
              planning_day_id: "day-2",
              snapshot_id: "snapshot-2",
              snapshot_version: 4,
              schedule_item_id: "item-3",
              start_at: "2026-07-02T09:00:00+02:00",
              end_at: "2026-07-02T09:30:00+02:00",
              duration_minutes: 30,
            },
          ],
        },
      ],
    });

    const fixture = await renderFreeTimes(
      routeParams,
      freeTimesApi,
      new FakeRouter(),
    );
    const firstDay = resultDayByDate(fixture, "2026-07-01");
    const secondDay = resultDayByDate(fixture, "2026-07-02");

    expect(text(fixture)).toContain("3 useful windows");
    expect(firstDay?.textContent).toContain("Jul 1, 2026");
    expect(firstDay?.textContent).toContain("45 min");
    expect(firstDay?.textContent).toContain("1 hr");
    expect(firstDay?.textContent).toContain("Current plan");
    expect(firstDay?.textContent).not.toContain("item-1");
    expect(firstDay?.textContent).not.toContain("item-2");
    expect(secondDay?.textContent).toContain("Jul 2, 2026");
    expect(secondDay?.textContent).toContain("30 min");
    expect(secondDay?.textContent).toContain("Current plan");
    expect(secondDay?.textContent).not.toContain("day-2");
    expect(secondDay?.textContent).not.toContain("snapshot-2");
    expect(
      linkByAriaLabel(
        fixture,
        "Open planner workspace for Jul 2, 2026",
      )?.getAttribute("href"),
    ).toBe("/planner?date=2026-07-02");
  });

  it("renders a useful empty result without mixing up missing plans", async () => {
    const routeParams = new BehaviorSubject(
      convertToParamMap({
        start_date: "2026-07-01",
        end_date: "2026-07-01",
        minimum_minutes: "60",
      }),
    );
    const freeTimesApi = new FakeFreeTimesApi({
      ...freeTimeRange,
      minimum_minutes: 60,
      days: [
        {
          ...freeTimeRange.days[1],
          local_date: "2026-07-01",
          status: "no_useful_free_time",
        },
      ],
    });

    const fixture = await renderFreeTimes(
      routeParams,
      freeTimesApi,
      new FakeRouter(),
    );

    expect(text(fixture)).toContain(
      "No useful free-time windows meet this minimum",
    );
    expect(text(fixture)).toContain("No useful free time");
    expect(text(fixture)).not.toContain("No current plan");
  });

  it("submits filters through query parameters", async () => {
    const routeParams = new BehaviorSubject(
      convertToParamMap({
        start_date: "2026-07-01",
        end_date: "2026-07-03",
        minimum_minutes: "30",
      }),
    );
    const router = new FakeRouter();
    const fixture = await renderFreeTimes(
      routeParams,
      new FakeFreeTimesApi(),
      router,
    );

    setInputValue(fixture, "#free-start-date", "2026-07-04");
    setInputValue(fixture, "#free-end-date", "2026-07-10");
    setInputValue(fixture, "#free-minimum", "45");
    buttonByText(fixture, "Find free time").click();

    expect(router.navigations).toEqual([
      {
        queryParams: {
          start_date: "2026-07-04",
          end_date: "2026-07-10",
          minimum_minutes: 45,
        },
      },
    ]);
  });

  it("surfaces validation and permission failures accessibly", async () => {
    const routeParams = new BehaviorSubject(
      convertToParamMap({
        start_date: "2026-07-01",
        end_date: "2026-08-15",
        minimum_minutes: "30",
      }),
    );
    const freeTimesApi = new FakeFreeTimesApi();
    freeTimesApi.error = new HttpErrorResponse({ status: 422 });

    const fixture = await renderFreeTimes(
      routeParams,
      freeTimesApi,
      new FakeRouter(),
    );

    expect(text(fixture)).toContain("Free-time results did not load");
    expect(text(fixture)).toContain("Choose a valid date range");
    expect(announcement(fixture)).toContain("Choose a valid date range");
  });

  it("links permission failures back to sign-in without losing filters", async () => {
    const routeParams = new BehaviorSubject(
      convertToParamMap({
        start_date: "2026-07-01",
        end_date: "2026-07-03",
        minimum_minutes: "45",
      }),
    );
    const freeTimesApi = new FakeFreeTimesApi();
    freeTimesApi.error = new HttpErrorResponse({ status: 401 });

    const fixture = await renderFreeTimes(
      routeParams,
      freeTimesApi,
      new FakeRouter(),
    );

    expect(text(fixture)).toContain("Free-time finder unavailable");
    expect(linkByText(fixture, "Sign in again")?.getAttribute("href")).toBe(
      "/sign-in?returnUrl=%2Ffree-times%3Fstart_date%3D2026-07-01%26end_date%3D2026-07-03%26minimum_minutes%3D45",
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

class FakeFreeTimesApi {
  error: unknown = null;
  readonly requests: Array<{
    readonly startDate: string;
    readonly endDate: string;
    readonly minimumMinutes: number;
  }> = [];

  constructor(private readonly response: FreeTimeRange = freeTimeRange) {}

  findFreeTimes(
    startDate: string,
    endDate: string,
    minimumMinutes: number,
  ): Observable<FreeTimeRange> {
    this.requests.push({ startDate, endDate, minimumMinutes });
    if (this.error !== null) {
      return throwError(() => this.error);
    }
    return of(this.response);
  }
}

class FakeRouter {
  readonly navigations: Array<{
    readonly queryParams: Record<string, string | number>;
  }> = [];

  navigate(
    _commands: unknown[],
    options: { queryParams: Record<string, string | number> },
  ): Promise<boolean> {
    this.navigations.push({ queryParams: options.queryParams });
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

async function renderFreeTimes(
  queryParamMap: BehaviorSubject<ReturnType<typeof convertToParamMap>>,
  freeTimesApi: FakeFreeTimesApi,
  router: FakeRouter,
): Promise<ComponentFixture<FreeTimesPage>> {
  await TestBed.configureTestingModule({
    imports: [FreeTimesPage],
    providers: [
      { provide: FreeTimesApiService, useValue: freeTimesApi },
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap,
        },
      },
      { provide: Router, useValue: router },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(FreeTimesPage);
  fixture.detectChanges();
  await Promise.resolve();
  fixture.detectChanges();
  return fixture;
}

function text<T>(fixture: ComponentFixture<T>): string {
  return fixture.nativeElement.textContent;
}

function announcement<T>(fixture: ComponentFixture<T>): string {
  return (
    fixture.nativeElement.querySelector(
      '[data-testid="free-times-announcement"]',
    ) as HTMLElement
  ).textContent;
}

function linkByAriaLabel<T>(
  fixture: ComponentFixture<T>,
  label: string,
): HTMLAnchorElement | null {
  return fixture.nativeElement.querySelector(`a[aria-label="${label}"]`);
}

function elementByAriaLabel<T>(
  fixture: ComponentFixture<T>,
  label: string,
): HTMLElement | null {
  return fixture.nativeElement.querySelector(`[aria-label="${label}"]`);
}

function resultDayByDate<T>(
  fixture: ComponentFixture<T>,
  date: string,
): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(
    `article[data-date='${date}']`,
  );
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

function buttonByText<T>(
  fixture: ComponentFixture<T>,
  buttonText: string,
): HTMLButtonElement {
  const buttons = Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll("button"),
  );
  const button = buttons.find((candidate) =>
    candidate.textContent?.includes(buttonText),
  );

  if (!button) {
    throw new Error(`Could not find ${buttonText} button`);
  }

  return button as HTMLButtonElement;
}

function setInputValue<T>(
  fixture: ComponentFixture<T>,
  selector: string,
  value: string,
): void {
  const input = (fixture.nativeElement as HTMLElement).querySelector(
    selector,
  ) as HTMLInputElement | null;
  if (input === null) {
    throw new Error(`Could not find ${selector}`);
  }
  input.value = value;
  input.dispatchEvent(new Event("input"));
  fixture.detectChanges();
}

async function firstValue<T>(observable: Observable<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    observable.subscribe({ next: resolve, error: reject });
  });
}
