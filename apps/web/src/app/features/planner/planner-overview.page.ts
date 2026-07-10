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
import { catchError, combineLatest, map, of, switchMap, tap } from "rxjs";

import {
  PlannerApiService,
  PlanningDaySummary,
  PlanningRangeSummary,
} from "./planner-api.service";

type OverviewMode = "week" | "month";

type OverviewState =
  | { readonly status: "loading"; readonly anchorDate: string }
  | {
      readonly status: "ready";
      readonly anchorDate: string;
      readonly summary: PlanningRangeSummary;
    }
  | {
      readonly status: "permission";
      readonly anchorDate: string;
      readonly message: string;
    }
  | {
      readonly status: "error";
      readonly anchorDate: string;
      readonly message: string;
    };

@Component({
  selector: "pdf-planner-overview-page",
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: "./planner-overview.page.html",
})
export class PlannerOverviewPage implements OnInit {
  protected readonly mode = signal<OverviewMode>("week");
  protected readonly anchorDate = signal(todayLocalDate());
  protected readonly state = signal<OverviewState>({
    status: "loading",
    anchorDate: todayLocalDate(),
  });
  protected readonly title = computed(() =>
    this.mode() === "week" ? "Week overview" : "Month overview",
  );
  protected readonly announcement = computed(() => {
    const state = this.state();
    if (state.status === "loading") {
      return `Loading ${this.title().toLowerCase()} for ${formatDateLabel(state.anchorDate)}.`;
    }
    if (state.status === "ready") {
      return `${this.title()} loaded for ${formatDateLabel(state.summary.start_date)} through ${formatDateLabel(state.summary.end_date)}.`;
    }
    return state.message;
  });

  private readonly plannerApi = inject(PlannerApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    const routeState = combineLatest([
      this.route.data,
      this.route.queryParamMap,
    ]).pipe(
      map(([data, queryParamMap]) => {
        const mode = data["overviewMode"];
        return {
          mode: mode === "month" ? "month" : "week",
          anchorDate: normalizeDateInput(queryParamMap.get("date")),
        } as const;
      }),
      tap(({ mode, anchorDate }) => {
        this.mode.set(mode);
        this.anchorDate.set(anchorDate);
        this.state.set({ status: "loading", anchorDate });
      }),
      switchMap(({ mode, anchorDate }) => {
        const request =
          mode === "week"
            ? this.plannerApi.loadWeekOverview(startOfWeek(anchorDate))
            : this.plannerApi.loadMonthOverview(startOfMonth(anchorDate));
        return request.pipe(
          map(
            (summary): OverviewState => ({
              status: "ready",
              anchorDate,
              summary,
            }),
          ),
          catchError((error: unknown) =>
            of(overviewErrorState(anchorDate, error)),
          ),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    );

    routeState.subscribe((state) => {
      this.state.set(state);
    });
  }

  protected openAnchorDate(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { date: this.anchorDate() },
      queryParamsHandling: "merge",
    });
  }

  protected moveRange(direction: -1 | 1): void {
    const nextDate =
      this.mode() === "week"
        ? addDays(this.anchorDate(), direction * 7)
        : addMonths(this.anchorDate(), direction);
    this.anchorDate.set(nextDate);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { date: nextDate },
      queryParamsHandling: "merge",
    });
  }

  protected retry(): void {
    this.openAnchorDate();
  }

  protected rangeLabel(summary: PlanningRangeSummary): string {
    return `${formatDateLabel(summary.start_date)} to ${formatDateLabel(summary.end_date)}`;
  }

  protected formatDateLabel(value: string): string {
    return formatDateLabel(value);
  }

  protected dayName(value: string): string {
    return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(
      dateFromLocalDate(value),
    );
  }

  protected dayNumber(value: string): string {
    return String(dateFromLocalDate(value).getUTCDate());
  }

  protected formatDuration(minutes: number): string {
    return formatDuration(minutes);
  }

  protected statusLabel(day: PlanningDaySummary): string {
    switch (day.status) {
      case "planned":
        return `Snapshot v${day.snapshot_version ?? "?"}`;
      case "incomplete":
        return "Saved inputs";
      case "empty":
        return "No saved day";
    }
  }

  protected dayLink(day: PlanningDaySummary): readonly [string] {
    void day;
    return ["/planner"];
  }

  protected hasAnySignal(day: PlanningDaySummary): boolean {
    return (
      day.planned_minutes > 0 ||
      day.fixed_event_count > 0 ||
      day.interruption_minutes > 0 ||
      day.unscheduled_deferred_count > 0 ||
      day.has_useful_free_time
    );
  }

  protected gridClass(): string {
    return this.mode() === "month"
      ? "mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-7"
      : "mt-5 grid gap-3 md:grid-cols-7";
  }
}

function overviewErrorState(anchorDate: string, error: unknown): OverviewState {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401 || error.status === 403) {
      return {
        status: "permission",
        anchorDate,
        message: "Sign in again before opening planner overviews.",
      };
    }
    if (error.status === 422) {
      return {
        status: "error",
        anchorDate,
        message: "Choose a valid overview date.",
      };
    }
  }

  return {
    status: "error",
    anchorDate,
    message:
      "Planner overview data did not load. Try again when the API is available.",
  };
}

function startOfWeek(value: string): string {
  const date = dateFromLocalDate(value);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return localDateFromDate(addUtcDays(date, mondayOffset));
}

function startOfMonth(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

function addDays(value: string, days: number): string {
  return localDateFromDate(addUtcDays(dateFromLocalDate(value), days));
}

function addMonths(value: string, months: number): string {
  const date = dateFromLocalDate(value);
  return localDateFromDate(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)),
  );
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

function normalizeDateInput(value: string | null): string {
  return value !== null && isValidDateInput(value) ? value : todayLocalDate();
}

function isValidDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
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
