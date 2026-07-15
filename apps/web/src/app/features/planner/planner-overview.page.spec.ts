import { ComponentFixture, TestBed } from "@angular/core/testing";
import { HttpErrorResponse } from "@angular/common/http";
import { ActivatedRoute, Router, convertToParamMap } from "@angular/router";
import { BehaviorSubject, Observable, of, throwError } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiClientService } from "../../core/api/api-client.service";
import { PlannerApiService, PlanningRangeSummary } from "./planner-api.service";
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
    emptyDay("2026-07-03"),
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

describe("planner overview API contract", () => {
  it("loads week and month summaries through authenticated overview endpoints", async () => {
    const api = new FakeApiClient();
    api.responses.set(
      "/planning/overviews/week?start_date=2026-06-29",
      weekSummary,
    );
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

    expect(await firstValue(service.loadWeekOverview("2026-06-29"))).toEqual(
      weekSummary,
    );
    expect(await firstValue(service.loadMonthOverview("2026-07-01"))).toEqual(
      monthSummary,
    );
    expect(api.gets).toEqual([
      "/planning/overviews/week?start_date=2026-06-29",
      "/planning/overviews/month?month=2026-07-01",
    ]);
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

  it("renders planned, incomplete, and empty week days with day workspace links", async () => {
    const fixture = await renderOverview(
      routeData,
      queryParamMap,
      plannerApi,
      router,
    );

    expect(plannerApi.weekStarts).toEqual(["2026-06-29"]);
    expect(text(fixture)).toContain("Week overview");
    expect(text(fixture)).toContain("Saved daily plans only.");
    expect(text(fixture)).toContain("Snapshot v2");
    expect(text(fixture)).toContain("1 hr 30 min");
    expect(text(fixture)).toContain("Fixed");
    expect(text(fixture)).toContain("2");
    expect(text(fixture)).toContain("Interruptions");
    expect(text(fixture)).toContain("45 min");
    expect(text(fixture)).toContain("Deferred");
    expect(text(fixture)).toContain("1");
    expect(text(fixture)).toContain("Useful free time:");
    expect(text(fixture)).toContain("Saved inputs");
    expect(text(fixture)).toContain(
      "No saved inputs or current snapshot indicators for this date.",
    );
    expect(
      linkByAriaLabel(
        fixture,
        "Open planner workspace for Jul 1, 2026, Snapshot v2",
      )?.getAttribute("href"),
    ).toBe("/planner?date=2026-07-01");
    expect(announcement(fixture)).toContain("Week overview loaded");
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
    expect(text(fixture)).toContain("Month overview");
    expect(text(fixture)).toContain("Jul 1, 2026 to Jul 31, 2026");
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
        "Month overview loaded for Jul 1, 2026 through Jul 31, 2026.",
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

    buttonByText(fixture, "Next").click();
    fixture.detectChanges();

    expect(router.navigations).toEqual([
      { queryParams: { date: "2026-07-08" } },
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

    expect(text(fixture)).toContain("Planner summary did not load");
    expect(text(fixture)).toContain("Planner overview data did not load.");
    expect(announcement(fixture)).toContain(
      "Planner overview data did not load.",
    );
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

    expect(text(fixture)).toContain("Overview unavailable");
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
  readonly weekStarts: string[] = [];
  readonly monthStarts: string[] = [];

  loadWeekOverview(startDate: string): Observable<PlanningRangeSummary> {
    this.weekStarts.push(startDate);
    if (this.error !== null) {
      return throwError(() => this.error);
    }
    return of(weekSummary);
  }

  loadMonthOverview(monthDate: string): Observable<PlanningRangeSummary> {
    this.monthStarts.push(monthDate);
    if (this.error !== null) {
      return throwError(() => this.error);
    }
    return of(monthSummary);
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
