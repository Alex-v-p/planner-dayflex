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
import { ActivatedRoute, Router } from "@angular/router";
import { Subject, catchError, map, merge, of, switchMap, tap } from "rxjs";

import { AuthSessionService } from "../../core/auth/auth-session.service";
import {
  FixedEvent,
  PlannerApiService,
  PlannerWorkspaceData,
  ScheduleItem,
  ScheduleSnapshot,
  Task,
} from "./planner-api.service";

type WorkspaceLoadState =
  | { readonly status: "loading"; readonly selectedDate: string }
  | {
      readonly status: "ready";
      readonly selectedDate: string;
      readonly data: PlannerWorkspaceData;
    }
  | {
      readonly status: "permission";
      readonly selectedDate: string;
      readonly message: string;
    }
  | {
      readonly status: "error";
      readonly selectedDate: string;
      readonly message: string;
    };

@Component({
  selector: "pdf-planner-workspace-page",
  standalone: true,
  imports: [FormsModule],
  templateUrl: "./planner-workspace.page.html",
})
export class PlannerWorkspacePage implements OnInit {
  protected readonly auth = inject(AuthSessionService);
  protected readonly state = signal<WorkspaceLoadState>({
    status: "loading",
    selectedDate: todayLocalDate(),
  });
  protected readonly selectedDate = signal(todayLocalDate());
  protected readonly announcement = computed(() => {
    const state = this.state();

    if (state.status === "loading") {
      return `Loading planner workspace for ${formatDateLabel(state.selectedDate)}.`;
    }

    if (state.status === "ready") {
      return `Planner workspace loaded for ${formatDateLabel(state.selectedDate)}.`;
    }

    return state.message;
  });

  private readonly plannerApi = inject(PlannerApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reloadRequests = new Subject<string>();

  ngOnInit(): void {
    const routeDates = this.route.queryParamMap.pipe(
      map((queryParamMap) => normalizeDateInput(queryParamMap.get("date"))),
      tap((date) => {
        this.selectedDate.set(date);
      }),
    );

    merge(routeDates, this.reloadRequests)
      .pipe(
        tap((selectedDate) => {
          this.state.set({ status: "loading", selectedDate });
        }),
        switchMap((selectedDate) =>
          this.plannerApi.loadWorkspaceDate(selectedDate).pipe(
            map(
              (data): WorkspaceLoadState => ({
                status: "ready",
                selectedDate,
                data,
              }),
            ),
            catchError((error: unknown) => of(errorState(selectedDate, error))),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((state) => {
        this.state.set(state);
      });
  }

  protected openSelectedDate(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { date: this.selectedDate() },
      queryParamsHandling: "merge",
    });
  }

  protected moveDate(days: number): void {
    const nextDate = addDays(this.selectedDate(), days);
    this.selectedDate.set(nextDate);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { date: nextDate },
      queryParamsHandling: "merge",
    });
  }

  protected reload(): void {
    this.reloadRequests.next(this.state().selectedDate);
  }

  protected formatDateLabel(value: string): string {
    return formatDateLabel(value);
  }

  protected formatTimeRange(
    startAt: string,
    endAt: string,
    timeZone: string,
  ): string {
    return `${formatTime(startAt, timeZone)}-${formatTime(endAt, timeZone)}`;
  }

  protected formatScheduleTimeRange(
    startAt: string,
    endAt: string,
    planningDayTimeZone: string | undefined,
  ): string {
    return this.formatTimeRange(startAt, endAt, planningDayTimeZone ?? "UTC");
  }

  protected itemLabel(
    item: ScheduleItem,
    tasks: readonly Task[],
    fixedEvents: readonly FixedEvent[],
  ): string {
    if (item.kind === "task") {
      return tasks.find((task) => task.id === item.task_id)?.title ?? "Task";
    }

    if (item.kind === "fixed_event") {
      return (
        fixedEvents.find((event) => event.id === item.fixed_event_id)?.title ??
        "Fixed event"
      );
    }

    return formatKindLabel(item.kind);
  }

  protected itemClass(kind: string): string {
    const shared = "rounded-md border border-mist-200 border-l-4 bg-white p-4";

    switch (kind) {
      case "task":
        return `${shared} border-meadow-600`;
      case "fixed_event":
        return `${shared} border-signal-600`;
      case "interruption":
        return `${shared} border-rose-500`;
      case "designated_free_time":
        return `${shared} border-sky-500`;
      default:
        return `${shared} border-mist-300`;
    }
  }

  protected kindLabel(kind: string): string {
    return formatKindLabel(kind);
  }

  protected snapshotItemCount(snapshot: ScheduleSnapshot | null): number {
    return snapshot?.items.length ?? 0;
  }
}

function errorState(selectedDate: string, error: unknown): WorkspaceLoadState {
  if (
    error instanceof HttpErrorResponse &&
    (error.status === 401 || error.status === 403)
  ) {
    return {
      status: "permission",
      selectedDate,
      message:
        "Your session cannot open this planning day. Sign in again or choose a day from your account.",
    };
  }

  return {
    status: "error",
    selectedDate,
    message:
      "We could not load this planning day. Your selected date is still here; try again when the API is available.",
  };
}

function normalizeDateInput(value: string | null): string {
  if (value !== null && isValidDateInput(value)) {
    return value;
  }

  return todayLocalDate();
}

function isValidDateInput(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (match === null) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function todayLocalDate(): string {
  return toLocalDateString(new Date());
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toLocalDateString(date);
}

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

function formatKindLabel(kind: string): string {
  return kind
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
