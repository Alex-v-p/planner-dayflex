import { HttpErrorResponse } from "@angular/common/http";
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { catchError, map, of, switchMap, tap } from "rxjs";

import { IconButtonComponent } from "../../shared/ui/icon-button/icon-button.component";
import {
  SegmentedControlComponent,
  SegmentedControlOption,
} from "../../shared/ui/segmented-control/segmented-control.component";
import { StatusChipComponent } from "../../shared/ui/status-chip/status-chip.component";
import { SummaryValueComponent } from "../../shared/ui/summary-value/summary-value.component";
import {
  FreeTimeDay,
  FreeTimeRange,
  FreeTimeWindow,
  FreeTimesApiService,
} from "./free-times-api.service";

type FreeTimesState =
  | {
      readonly status: "loading";
      readonly filters: FreeTimeFilters;
    }
  | {
      readonly status: "ready";
      readonly filters: FreeTimeFilters;
      readonly result: FreeTimeRange;
    }
  | {
      readonly status: "permission" | "error";
      readonly filters: FreeTimeFilters;
      readonly message: string;
    };

interface FreeTimeFilters {
  readonly startDate: string;
  readonly endDate: string;
  readonly minimumMinutes: number;
}

const PLANNER_VIEW_OPTIONS: readonly SegmentedControlOption[] = [
  { label: "Day", value: "day", ariaLabel: "Show day planner" },
  { label: "Week", value: "week", ariaLabel: "Show week overview" },
  { label: "Month", value: "month", ariaLabel: "Show month overview" },
  { label: "Free time", value: "free", ariaLabel: "Show free-time finder" },
];

@Component({
  selector: "pdf-free-times-page",
  standalone: true,
  imports: [
    FormsModule,
    IconButtonComponent,
    RouterLink,
    SegmentedControlComponent,
    StatusChipComponent,
    SummaryValueComponent,
  ],
  templateUrl: "./free-times.page.html",
})
export class FreeTimesPage implements OnInit {
  protected readonly plannerViewOptions = PLANNER_VIEW_OPTIONS;
  protected readonly filters = signal<FreeTimeFilters>(defaultFilters());
  protected readonly state = signal<FreeTimesState>({
    status: "loading",
    filters: defaultFilters(),
  });
  protected readonly announcement = computed(() => {
    const state = this.state();
    if (state.status === "loading") {
      return `Loading free-time windows from ${formatDateLabel(state.filters.startDate)} through ${formatDateLabel(state.filters.endDate)}.`;
    }
    if (state.status === "ready") {
      return `Free-time finder loaded ${this.windows(state.result).length} windows.`;
    }
    return state.message;
  });

  private readonly freeTimesApi = inject(FreeTimesApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.route.queryParamMap
      .pipe(
        map((queryParamMap) =>
          normalizeFilters({
            startDate: queryParamMap.get("start_date"),
            endDate: queryParamMap.get("end_date"),
            minimumMinutes: queryParamMap.get("minimum_minutes"),
          }),
        ),
        tap((filters) => {
          this.filters.set(filters);
          this.state.set({ status: "loading", filters });
        }),
        switchMap((filters) =>
          this.freeTimesApi
            .findFreeTimes(
              filters.startDate,
              filters.endDate,
              filters.minimumMinutes,
            )
            .pipe(
              map(
                (result): FreeTimesState => ({
                  status: "ready",
                  filters,
                  result,
                }),
              ),
              catchError((error: unknown) =>
                of(freeTimesErrorState(filters, error)),
              ),
            ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((state) => {
        this.state.set(state);
      });
  }

  protected applyFilters(): void {
    const filters = normalizeFilters({
      startDate: this.filters().startDate,
      endDate: this.filters().endDate,
      minimumMinutes: String(this.filters().minimumMinutes),
    });
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        start_date: filters.startDate,
        end_date: filters.endDate,
        minimum_minutes: filters.minimumMinutes,
      },
    });
  }

  protected moveRange(days: number): void {
    const current = this.filters();
    const nextStart = addDays(current.startDate, days);
    const nextEnd = addDays(current.endDate, days);
    this.filters.set({ ...current, startDate: nextStart, endDate: nextEnd });
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        start_date: nextStart,
        end_date: nextEnd,
        minimum_minutes: current.minimumMinutes,
      },
    });
  }

  protected openToday(): void {
    const current = this.filters();
    const nextStart = todayLocalDate();
    const nextEnd = addDays(nextStart, 6);
    this.filters.set({ ...current, startDate: nextStart, endDate: nextEnd });
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        start_date: nextStart,
        end_date: nextEnd,
        minimum_minutes: current.minimumMinutes,
      },
    });
  }

  protected switchPlannerView(view: string): void {
    const date = this.filters().startDate;
    const route =
      view === "week"
        ? "/planner/week"
        : view === "month"
          ? "/planner/month"
          : view === "free"
            ? "/free-times"
            : "/planner";
    const queryParams =
      view === "free"
        ? {
            start_date: this.filters().startDate,
            end_date: this.filters().endDate,
            minimum_minutes: this.filters().minimumMinutes,
          }
        : { date };

    void this.router.navigate([route], { queryParams });
  }

  protected updateFilter<K extends keyof FreeTimeFilters>(
    key: K,
    value: FreeTimeFilters[K],
  ): void {
    this.filters.set({ ...this.filters(), [key]: value });
  }

  protected windows(result: FreeTimeRange): readonly FreeTimeWindow[] {
    return result.days.flatMap((day) => day.windows);
  }

  protected readyResult(state: FreeTimesState): FreeTimeRange | null {
    return state.status === "ready" ? state.result : null;
  }

  protected daysWithStatus(
    result: FreeTimeRange,
    status: FreeTimeDay["status"],
  ): readonly FreeTimeDay[] {
    return result.days.filter((day) => day.status === status);
  }

  protected formatDateLabel(value: string): string {
    return formatDateLabel(value);
  }

  protected formatDateTime(value: string, timeZone: string): string {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  }

  protected formatSnapshot(value: FreeTimeWindow | FreeTimeDay): string {
    if (value.snapshot_id === null || value.snapshot_version === null) {
      return "No current snapshot";
    }
    return `Snapshot v${value.snapshot_version}`;
  }

  protected formatSnapshotCreatedAt(value: string | null): string {
    if (value === null) {
      return "";
    }
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  protected formatDuration(minutes: number): string {
    return formatDuration(minutes);
  }

  protected dayLink(day: FreeTimeDay | FreeTimeWindow): readonly [string] {
    void day;
    return ["/planner"];
  }
}

function freeTimesErrorState(
  filters: FreeTimeFilters,
  error: unknown,
): FreeTimesState {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401 || error.status === 403) {
      return {
        status: "permission",
        filters,
        message: "Sign in again before finding free time.",
      };
    }
    if (error.status === 422) {
      return {
        status: "error",
        filters,
        message:
          "Choose a valid date range up to 31 days and a positive minimum duration.",
      };
    }
  }

  return {
    status: "error",
    filters,
    message:
      "Free-time results did not load. Try again when the API is available.",
  };
}

function defaultFilters(): FreeTimeFilters {
  const startDate = todayLocalDate();
  return {
    startDate,
    endDate: addDays(startDate, 6),
    minimumMinutes: 30,
  };
}

function normalizeFilters(input: {
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly minimumMinutes: string | null;
}): FreeTimeFilters {
  const defaults = defaultFilters();
  const startDate = isValidDateInput(input.startDate)
    ? input.startDate
    : defaults.startDate;
  const requestedEndDate = isValidDateInput(input.endDate)
    ? input.endDate
    : defaults.endDate;
  const minimumMinutes = Number(input.minimumMinutes);
  const boundedMinimum =
    Number.isInteger(minimumMinutes) && minimumMinutes > 0
      ? Math.min(minimumMinutes, 1440)
      : defaults.minimumMinutes;
  const endDate =
    dateFromLocalDate(requestedEndDate) >= dateFromLocalDate(startDate)
      ? requestedEndDate
      : startDate;
  return { startDate, endDate, minimumMinutes: boundedMinimum };
}

function isValidDateInput(value: string | null): value is string {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  return localDateFromDate(dateFromLocalDate(value)) === value;
}

function todayLocalDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value: string, days: number): string {
  return localDateFromDate(addUtcDays(dateFromLocalDate(value), days));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
    ),
  );
}

function dateFromLocalDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function localDateFromDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(dateFromLocalDate(value));
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) {
    return "0 min";
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) {
    return `${remainder} min`;
  }
  if (remainder === 0) {
    return `${hours} hr`;
  }
  return `${hours} hr ${remainder} min`;
}
