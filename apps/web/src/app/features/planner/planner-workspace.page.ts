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
import {
  Observable,
  Subject,
  catchError,
  map,
  merge,
  of,
  switchMap,
  tap,
} from "rxjs";

import { AuthSessionService } from "../../core/auth/auth-session.service";
import {
  FixedEvent,
  FixedEventInputRequest,
  PlannerApiService,
  PlannerWorkspaceData,
  ScheduleItem,
  ScheduleSnapshot,
  Task,
  TaskInputRequest,
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

interface TaskFormModel {
  readonly id: string | null;
  readonly title: string;
  readonly estimatedMinutes: string;
  readonly priority: string;
  readonly dueDate: string;
  readonly earliestStartLocal: string;
  readonly earliestStartTimeZone: string;
  readonly splittingAllowed: boolean;
  readonly minSegmentMinutes: string;
}

interface FixedEventFormModel {
  readonly id: string | null;
  readonly planningDayId: string | null;
  readonly title: string;
  readonly startLocal: string;
  readonly endLocal: string;
  readonly timeZone: string;
}

type FormErrors = Readonly<Record<string, string>>;

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
  protected readonly taskForm = signal<TaskFormModel>(emptyTaskForm());
  protected readonly fixedEventForm = signal<FixedEventFormModel>(
    emptyFixedEventForm(),
  );
  protected readonly taskFormErrors = signal<FormErrors>({});
  protected readonly fixedEventFormErrors = signal<FormErrors>({});
  protected readonly taskFormMessage = signal("");
  protected readonly fixedEventFormMessage = signal("");
  protected readonly busyAction = signal<string | null>(null);
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
        if (
          state.status === "ready" &&
          isBlankNewFixedEventForm(this.fixedEventForm())
        ) {
          this.fixedEventForm.set(
            emptyFixedEventForm(state.data.day?.time_zone),
          );
        }
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

  protected updateTaskForm(patch: Partial<TaskFormModel>): void {
    this.taskForm.update((form) => ({ ...form, ...patch }));
  }

  protected updateFixedEventForm(patch: Partial<FixedEventFormModel>): void {
    this.fixedEventForm.update((form) => ({ ...form, ...patch }));
  }

  protected editTask(task: Task): void {
    const timeZone =
      currentWorkspaceDay(this.state())?.time_zone ?? guessTimeZone();
    this.taskForm.set({
      id: task.id,
      title: task.title,
      estimatedMinutes: String(task.estimated_minutes),
      priority: String(task.priority),
      dueDate: task.due_date ?? "",
      earliestStartLocal:
        task.earliest_start_at === null
          ? ""
          : toDateTimeLocalValue(task.earliest_start_at, timeZone),
      earliestStartTimeZone: timeZone,
      splittingAllowed: task.splitting_allowed,
      minSegmentMinutes:
        task.min_segment_minutes === null
          ? ""
          : String(task.min_segment_minutes),
    });
    this.taskFormErrors.set({});
    this.taskFormMessage.set("");
  }

  protected resetTaskForm(): void {
    this.taskForm.set(emptyTaskForm());
    this.taskFormErrors.set({});
    this.taskFormMessage.set("");
  }

  protected submitTask(): void {
    const form = this.taskForm();
    const result = buildTaskRequest(form);
    if (!result.ok) {
      this.taskFormErrors.set(result.errors);
      this.taskFormMessage.set("Review the task details before saving.");
      return;
    }

    const action = form.id === null ? "task:create" : `task:update:${form.id}`;
    const request$ =
      form.id === null
        ? this.plannerApi.createTask(result.request)
        : this.plannerApi.updateTask(form.id, result.request);

    this.runMutation(action, request$, "task");
  }

  protected deleteTask(task: Task): void {
    if (!window.confirm(`Delete "${task.title}" from active flexible tasks?`)) {
      return;
    }

    this.runMutation(
      `task:delete:${task.id}`,
      this.plannerApi.deleteTask(task.id),
      "task",
    );
  }

  protected editFixedEvent(event: FixedEvent): void {
    this.fixedEventForm.set({
      id: event.id,
      planningDayId: event.planning_day_id,
      title: event.title,
      startLocal: toDateTimeLocalValue(event.start_at, event.time_zone),
      endLocal: toDateTimeLocalValue(event.end_at, event.time_zone),
      timeZone: event.time_zone,
    });
    this.fixedEventFormErrors.set({});
    this.fixedEventFormMessage.set("");
  }

  protected resetFixedEventForm(): void {
    this.fixedEventForm.set(
      emptyFixedEventForm(currentWorkspaceDay(this.state())?.time_zone),
    );
    this.fixedEventFormErrors.set({});
    this.fixedEventFormMessage.set("");
  }

  protected submitFixedEvent(): void {
    const form = this.fixedEventForm();
    const result = buildFixedEventRequest(form);
    if (!result.ok) {
      this.fixedEventFormErrors.set(result.errors);
      this.fixedEventFormMessage.set(
        "Review the fixed event details before saving.",
      );
      return;
    }

    const state = this.state();
    if (state.status !== "ready") {
      this.fixedEventFormMessage.set("Planner data is still loading.");
      return;
    }

    const request$ =
      form.id === null
        ? this.plannerApi.saveFixedEventForDate(
            state.selectedDate,
            state.data.day,
            result.request,
          )
        : this.plannerApi.updateFixedEvent(
            form.planningDayId ?? state.data.day?.id ?? "",
            form.id,
            result.request,
          );

    this.runMutation(
      form.id === null ? "event:create" : `event:update:${form.id}`,
      request$,
      "fixedEvent",
    );
  }

  protected deleteFixedEvent(event: FixedEvent): void {
    if (!window.confirm(`Delete "${event.title}" from this planning day?`)) {
      return;
    }

    this.runMutation(
      `event:delete:${event.id}`,
      this.plannerApi.deleteFixedEvent(event.planning_day_id, event.id),
      "fixedEvent",
    );
  }

  protected fieldError(errors: FormErrors, field: string): string {
    return errors[field] ?? "";
  }

  protected isBusy(action: string): boolean {
    return this.busyAction() === action;
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

  protected formatDateTime(
    value: string,
    planningDayTimeZone: string | undefined,
  ): string {
    return formatTime(value, planningDayTimeZone ?? "UTC");
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

  private runMutation<T>(
    action: string,
    request$: Observable<T>,
    formKind: "task" | "fixedEvent",
  ): void {
    this.busyAction.set(action);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.busyAction.set(null);
        if (formKind === "task") {
          this.resetTaskForm();
        } else {
          this.resetFixedEventForm();
        }
        this.reload();
      },
      error: (error: unknown) => {
        this.busyAction.set(null);
        const message = mutationErrorMessage(error);
        const validationErrors = validationErrorsFor(error, formKind);
        if (formKind === "task") {
          if (Object.keys(validationErrors).length > 0) {
            this.taskFormErrors.set(validationErrors);
          }
          this.taskFormMessage.set(message);
        } else {
          if (Object.keys(validationErrors).length > 0) {
            this.fixedEventFormErrors.set(validationErrors);
          }
          this.fixedEventFormMessage.set(message);
        }
      },
    });
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

function emptyTaskForm(): TaskFormModel {
  return {
    id: null,
    title: "",
    estimatedMinutes: "",
    priority: "3",
    dueDate: "",
    earliestStartLocal: "",
    earliestStartTimeZone: guessTimeZone(),
    splittingAllowed: false,
    minSegmentMinutes: "",
  };
}

function emptyFixedEventForm(timeZone?: string): FixedEventFormModel {
  return {
    id: null,
    planningDayId: null,
    title: "",
    startLocal: "",
    endLocal: "",
    timeZone: normalizeTimeZone(timeZone ?? guessTimeZone()),
  };
}

function isBlankNewFixedEventForm(form: FixedEventFormModel): boolean {
  return (
    form.id === null &&
    form.planningDayId === null &&
    form.title === "" &&
    form.startLocal === "" &&
    form.endLocal === ""
  );
}

function buildTaskRequest(
  form: TaskFormModel,
): { ok: true; request: TaskInputRequest } | { ok: false; errors: FormErrors } {
  const errors: Record<string, string> = {};
  const title = form.title.trim();
  const estimatedMinutes = Number(form.estimatedMinutes);
  const priority = Number(form.priority);
  const minSegmentMinutes =
    form.minSegmentMinutes.trim() === ""
      ? null
      : Number(form.minSegmentMinutes);

  if (title === "") {
    errors["title"] = "Enter a task title.";
  }
  if (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1) {
    errors["estimatedMinutes"] = "Estimate must be at least 1 minute.";
  }
  if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
    errors["priority"] = "Priority must be from 1 to 5.";
  }
  if (form.dueDate !== "" && !isValidDateInput(form.dueDate)) {
    errors["dueDate"] = "Use a valid due date.";
  }
  const earliestStartTimeZone = normalizeTimeZone(form.earliestStartTimeZone);
  if (
    form.earliestStartLocal !== "" &&
    !isValidTimeZone(earliestStartTimeZone)
  ) {
    errors["earliestStartTimeZone"] = "Use a valid IANA time zone.";
  }
  if (form.splittingAllowed) {
    if (minSegmentMinutes === null) {
      errors["minSegmentMinutes"] = "Enter the minimum split segment.";
    } else if (!Number.isInteger(minSegmentMinutes) || minSegmentMinutes < 15) {
      errors["minSegmentMinutes"] =
        "Minimum segment must be at least 15 minutes.";
    } else if (
      Number.isInteger(estimatedMinutes) &&
      minSegmentMinutes > estimatedMinutes
    ) {
      errors["minSegmentMinutes"] =
        "Minimum segment cannot exceed the estimate.";
    }
  } else if (form.minSegmentMinutes.trim() !== "") {
    errors["minSegmentMinutes"] =
      "Clear minimum segment minutes when splitting is off.";
  }

  let earliestStartAt: string | null = null;
  if (form.earliestStartLocal !== "" && !errors["earliestStartTimeZone"]) {
    earliestStartAt = zonedLocalDateTimeToIso(
      form.earliestStartLocal,
      earliestStartTimeZone,
    );
    if (earliestStartAt === null) {
      errors["earliestStartLocal"] = "Use a valid earliest start time.";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    request: {
      title,
      estimated_minutes: estimatedMinutes,
      priority,
      due_date: form.dueDate === "" ? null : form.dueDate,
      earliest_start_at: earliestStartAt,
      splitting_allowed: form.splittingAllowed,
      min_segment_minutes: form.splittingAllowed ? minSegmentMinutes : null,
    },
  };
}

function buildFixedEventRequest(
  form: FixedEventFormModel,
):
  | { ok: true; request: FixedEventInputRequest }
  | { ok: false; errors: FormErrors } {
  const errors: Record<string, string> = {};
  const title = form.title.trim();

  if (title === "") {
    errors["title"] = "Enter an event title.";
  }
  const timeZone = normalizeTimeZone(form.timeZone);
  if (!isValidTimeZone(timeZone)) {
    errors["timeZone"] = "Use a valid IANA time zone.";
  }

  const startAt = errors["timeZone"]
    ? null
    : zonedLocalDateTimeToIso(form.startLocal, timeZone);
  const endAt = errors["timeZone"]
    ? null
    : zonedLocalDateTimeToIso(form.endLocal, timeZone);

  if (startAt === null) {
    errors["startLocal"] = "Enter a valid start time.";
  }
  if (endAt === null) {
    errors["endLocal"] = "Enter a valid end time.";
  }
  if (
    startAt !== null &&
    endAt !== null &&
    Date.parse(endAt) <= Date.parse(startAt)
  ) {
    errors["endLocal"] = "End time must be after start time.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  if (startAt === null || endAt === null) {
    return {
      ok: false,
      errors: {
        startLocal: "Enter a valid start time.",
        endLocal: "Enter a valid end time.",
      },
    };
  }

  return {
    ok: true,
    request: {
      title,
      start_at: startAt,
      end_at: endAt,
      time_zone: timeZone,
    },
  };
}

function currentWorkspaceDay(state: WorkspaceLoadState) {
  return state.status === "ready" ? state.data.day : null;
}

function guessTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function isValidTimeZone(value: string): boolean {
  const timeZone = normalizeTimeZone(value);
  try {
    new Intl.DateTimeFormat(undefined, { timeZone }).format();
    return timeZone !== "";
  } catch {
    return false;
  }
}

function normalizeTimeZone(value: string): string {
  return value.trim();
}

function toDateTimeLocalValue(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: string) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  const year = part("year");
  const month = part("month");
  const day = part("day");
  const hours = part("hour");
  const minutes = part("minute");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function zonedLocalDateTimeToIso(
  value: string,
  timeZone: string,
): string | null {
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (match === null || !isValidTimeZone(normalizedTimeZone)) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hours > 23 ||
    minutes > 59 ||
    !isValidDateInput(`${match[1]}-${match[2]}-${match[3]}`)
  ) {
    return null;
  }

  const localAsUtc = Date.UTC(year, month - 1, day, hours, minutes);
  let offsetMinutes = timeZoneOffsetMinutes(
    new Date(localAsUtc),
    normalizedTimeZone,
  );
  const candidate = new Date(localAsUtc - offsetMinutes * 60_000);
  offsetMinutes = timeZoneOffsetMinutes(candidate, normalizedTimeZone);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const offsetRemainder = String(absoluteOffset % 60).padStart(2, "0");

  return `${value}:00${sign}${offsetHours}:${offsetRemainder}`;
}

function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
}

function mutationErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 409) {
      return "That change conflicts with another saved event for the day.";
    }
    if (error.status === 422) {
      return "The API could not accept those details. Review the form and try again.";
    }
    if (error.status === 401 || error.status === 403) {
      return "Your session cannot save this change. Sign in again before continuing.";
    }
    if (error.status === 404) {
      return "That planning item is no longer available. Refresh the workspace.";
    }
  }

  return "We could not save that change. Try again when the API is available.";
}

function validationErrorsFor(
  error: unknown,
  formKind: "task" | "fixedEvent",
): FormErrors {
  if (!(error instanceof HttpErrorResponse) || error.status !== 422) {
    return {};
  }

  const errors: Record<string, string> = {};
  const details = validationDetails(error.error);
  for (const detail of details) {
    const apiField = validationApiField(detail);
    if (apiField === null) {
      continue;
    }

    const formField =
      formKind === "task"
        ? taskFieldForApiField(apiField)
        : fixedEventFieldForApiField(apiField);
    if (formField !== null) {
      errors[formField] = safeValidationMessage(apiField, detail.msg);
    }
  }

  return errors;
}

interface FastApiValidationDetail {
  readonly loc: readonly unknown[];
  readonly msg?: unknown;
}

function validationDetails(value: unknown): readonly FastApiValidationDetail[] {
  if (
    typeof value !== "object" ||
    value === null ||
    !("detail" in value) ||
    !Array.isArray(value.detail)
  ) {
    return [];
  }

  return value.detail.filter(
    (detail): detail is FastApiValidationDetail =>
      typeof detail === "object" &&
      detail !== null &&
      "loc" in detail &&
      Array.isArray(detail.loc),
  );
}

function validationApiField(detail: FastApiValidationDetail): string | null {
  const bodyIndex = detail.loc.findIndex((part) => part === "body");
  const candidate =
    bodyIndex >= 0 ? detail.loc[bodyIndex + 1] : detail.loc.at(-1);
  return typeof candidate === "string" ? candidate : null;
}

function taskFieldForApiField(apiField: string): string | null {
  switch (apiField) {
    case "title":
      return "title";
    case "estimated_minutes":
      return "estimatedMinutes";
    case "priority":
      return "priority";
    case "due_date":
      return "dueDate";
    case "earliest_start_at":
      return "earliestStartLocal";
    case "splitting_allowed":
      return "splittingAllowed";
    case "min_segment_minutes":
      return "minSegmentMinutes";
    default:
      return null;
  }
}

function fixedEventFieldForApiField(apiField: string): string | null {
  switch (apiField) {
    case "title":
      return "title";
    case "start_at":
      return "startLocal";
    case "end_at":
      return "endLocal";
    case "time_zone":
      return "timeZone";
    default:
      return null;
  }
}

function safeValidationMessage(apiField: string, message: unknown): string {
  const lowerMessage = typeof message === "string" ? message.toLowerCase() : "";
  const label = apiField.replace(/_/g, " ");

  if (lowerMessage.includes("at most 200")) {
    return "Use 200 characters or fewer.";
  }
  if (lowerMessage.includes("at most 64")) {
    return "Use 64 characters or fewer.";
  }
  if (lowerMessage.includes("valid iana time zone")) {
    return "Use a valid IANA time zone.";
  }
  if (lowerMessage.includes("date without a time")) {
    return "Use a date without a time.";
  }
  if (lowerMessage.includes("explicit utc offset")) {
    return "Use a date and time with a valid offset.";
  }
  if (lowerMessage.includes("after start_at")) {
    return "End time must be after start time.";
  }
  if (lowerMessage.includes("greater than 0")) {
    return "Use a value greater than 0.";
  }
  if (lowerMessage.includes("greater than or equal to 1")) {
    return "Use a value from 1 to 5.";
  }
  if (lowerMessage.includes("less than or equal to 5")) {
    return "Use a value from 1 to 5.";
  }
  if (lowerMessage.includes("minimum segment")) {
    return "Review the split minimum.";
  }

  return `Review ${label}.`;
}
