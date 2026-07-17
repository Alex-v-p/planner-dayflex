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

import { BlockTypeMarkerComponent } from "../../shared/ui/block-type-marker/block-type-marker.component";
import { IconButtonComponent } from "../../shared/ui/icon-button/icon-button.component";
import {
  SegmentedControlComponent,
  SegmentedControlOption,
} from "../../shared/ui/segmented-control/segmented-control.component";
import { StatusChipComponent } from "../../shared/ui/status-chip/status-chip.component";
import { SummaryValueComponent } from "../../shared/ui/summary-value/summary-value.component";
import {
  FixedEvent,
  FixedEventInputRequest,
  PlannerApiService,
  PlannerWorkspaceData,
  ScheduleDecision,
  ScheduleExplanationResponse,
  ScheduleItem,
  ScheduleSnapshot,
  Task,
  TaskInputRequest,
  TaskProgress,
  TaskProgressCreateRequest,
  InterruptionCreateRequest,
  ParseInterruptionResponse,
  ParseTaskResponse,
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

interface ProgressFormModel {
  readonly taskId: string;
  readonly completedMinutes: string;
  readonly recordedLocal: string;
  readonly timeZone: string;
}

interface InterruptionFormModel {
  readonly startLocal: string;
  readonly endLocal: string;
  readonly timeZone: string;
  readonly reportedLocal: string;
}

type FormErrors = Readonly<Record<string, string>>;
type EditorKind = "task" | "fixedEvent";
type PendingMutationFocus = {
  readonly loadingSelector: string;
  readonly readySelector: string;
  readonly fallbackReadySelector: string;
};
type EditorReturnFocus = {
  readonly element: HTMLElement | null;
  readonly selector: string | null;
  readonly fallbackSelector?: string | null;
};
type RouteEditorIntent =
  | {
      readonly kind: "create";
      readonly selectedDate: string;
      readonly start: string;
    }
  | {
      readonly kind: "editTask";
      readonly selectedDate: string;
      readonly taskId: string;
    }
  | {
      readonly kind: "editFixedEvent";
      readonly selectedDate: string;
      readonly fixedEventId: string;
    };

type GeneratePlanState =
  | { readonly status: "idle"; readonly message: string }
  | { readonly status: "pending"; readonly message: string }
  | { readonly status: "success"; readonly message: string }
  | { readonly status: "error"; readonly message: string };

type RecoveryMutationState = GeneratePlanState;
type TimelineRecoveryState = "moved" | "split";

type SuggestionState<T> =
  | { readonly status: "idle"; readonly message: string; readonly result: null }
  | {
      readonly status: "pending";
      readonly message: string;
      readonly result: null;
    }
  | { readonly status: "ready"; readonly message: string; readonly result: T }
  | {
      readonly status: "fallback";
      readonly message: string;
      readonly result: T;
    }
  | {
      readonly status: "error";
      readonly message: string;
      readonly result: null;
    };

type ExplanationState =
  | { readonly status: "idle"; readonly message: string; readonly result: null }
  | {
      readonly status: "pending";
      readonly message: string;
      readonly result: null;
    }
  | {
      readonly status: "ready";
      readonly message: string;
      readonly result: ScheduleExplanationResponse;
    }
  | {
      readonly status: "fallback";
      readonly message: string;
      readonly result: ScheduleExplanationResponse;
    };

interface TimelineBlock {
  readonly item: ScheduleItem;
  readonly label: string;
  readonly kindLabel: string;
  readonly marker: string;
  readonly recoveryState: TimelineRecoveryState | null;
  readonly recoveryLabel: string | null;
  readonly completionLabel: string | null;
  readonly isCompact: boolean;
  readonly minutes: number;
  readonly topPercent: number;
  readonly heightPercent: number;
  readonly topMinutes: number;
  readonly heightMinutes: number;
  readonly laneIndex: number;
  readonly laneCount: number;
  readonly leftPercent: number;
  readonly widthPercent: number;
}

interface TimelineTick {
  readonly label: string;
  readonly topPercent: number;
  readonly labelTopPercent: number | null;
  readonly labelClass: string;
  readonly minutesFromStart: number;
}

interface TimelineSlot {
  readonly id: string;
  readonly label: string;
  readonly startLocal: string;
  readonly endLocal: string;
  readonly timeZone: string;
  readonly topPercent: number;
  readonly heightPercent: number;
  readonly topMinutes: number;
  readonly heightMinutes: number;
}

interface CalendarCreateSelection {
  readonly sourceId: string;
  readonly label: string;
  readonly localDate: string;
  readonly startLocal: string;
  readonly endLocal: string;
  readonly timeZone: string;
  readonly durationMinutes: number;
}

interface ScheduleSummary {
  readonly scheduledWorkMinutes: number;
  readonly freeTimeMinutes: number;
  readonly deferredWorkCount: number;
}

const PLANNER_VIEW_OPTIONS: readonly SegmentedControlOption[] = [
  { label: "Day", value: "day", ariaLabel: "Show day planner" },
  { label: "Week", value: "week", ariaLabel: "Show week overview" },
  { label: "Month", value: "month", ariaLabel: "Show month overview" },
];
const COMPACT_TIMELINE_BLOCK_MINUTES = 45;

@Component({
  selector: "pdf-planner-workspace-page",
  standalone: true,
  imports: [
    BlockTypeMarkerComponent,
    FormsModule,
    IconButtonComponent,
    RouterLink,
    SegmentedControlComponent,
    StatusChipComponent,
    SummaryValueComponent,
  ],
  templateUrl: "./planner-workspace.page.html",
})
export class PlannerWorkspacePage implements OnInit {
  protected readonly plannerViewOptions = PLANNER_VIEW_OPTIONS;
  protected readonly state = signal<WorkspaceLoadState>({
    status: "loading",
    selectedDate: todayLocalDate(),
  });
  protected readonly selectedDate = signal(todayLocalDate());
  protected readonly taskForm = signal<TaskFormModel>(emptyTaskForm());
  protected readonly fixedEventForm = signal<FixedEventFormModel>(
    emptyFixedEventForm(),
  );
  protected readonly progressForm =
    signal<ProgressFormModel>(emptyProgressForm());
  protected readonly interruptionForm = signal<InterruptionFormModel>(
    emptyInterruptionForm(),
  );
  protected readonly taskFormErrors = signal<FormErrors>({});
  protected readonly fixedEventFormErrors = signal<FormErrors>({});
  protected readonly progressFormErrors = signal<FormErrors>({});
  protected readonly interruptionFormErrors = signal<FormErrors>({});
  protected readonly taskFormMessage = signal("");
  protected readonly fixedEventFormMessage = signal("");
  protected readonly taskEditorOpen = signal(false);
  protected readonly fixedEventEditorOpen = signal(false);
  protected readonly taskAiText = signal("");
  protected readonly interruptionAiText = signal("");
  protected readonly taskSuggestion = signal<
    SuggestionState<ParseTaskResponse>
  >({
    status: "idle",
    message: "",
    result: null,
  });
  protected readonly interruptionSuggestion = signal<
    SuggestionState<ParseInterruptionResponse>
  >({
    status: "idle",
    message: "",
    result: null,
  });
  protected readonly explanationStates = signal<
    Readonly<Record<string, ExplanationState>>
  >({});
  protected readonly progressState = signal<RecoveryMutationState>({
    status: "idle",
    message: "",
  });
  protected readonly interruptionState = signal<RecoveryMutationState>({
    status: "idle",
    message: "",
  });
  protected readonly generatePlanState = signal<GeneratePlanState>({
    status: "idle",
    message: "",
  });
  protected readonly busyAction = signal<string | null>(null);
  protected readonly selectedScheduleItemId = signal<string | null>(null);
  protected readonly calendarCreateSelection =
    signal<CalendarCreateSelection | null>(null);
  protected readonly announcement = computed(() => {
    const state = this.state();
    const interruptionState = this.interruptionState();
    const progressState = this.progressState();
    const generatePlanState = this.generatePlanState();

    if (state.status === "loading") {
      return `Loading planner workspace for ${formatDateLabel(state.selectedDate)}.`;
    }

    if (state.status === "ready") {
      if (interruptionState.message) {
        return interruptionState.message;
      }
      if (progressState.message) {
        return progressState.message;
      }
      if (generatePlanState.message) {
        return generatePlanState.message;
      }
      return `Planner workspace loaded for ${formatDateLabel(state.selectedDate)}.`;
    }

    return state.message;
  });

  private readonly plannerApi = inject(PlannerApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reloadRequests = new Subject<string>();
  private taskEditorReturnFocus: EditorReturnFocus = {
    element: null,
    selector: null,
  };
  private fixedEventEditorReturnFocus: EditorReturnFocus = {
    element: null,
    selector: null,
  };
  private calendarCreateReturnFocus: EditorReturnFocus = {
    element: null,
    selector: null,
  };
  private pendingMutationFocus: PendingMutationFocus | null = null;
  private pendingRouteEditorIntent: RouteEditorIntent | null = null;
  private handledRouteEditorIntentKey: string | null = null;
  private taskSuggestionRequestVersion = 0;

  ngOnInit(): void {
    const routeDates = this.route.queryParamMap.pipe(
      map((queryParamMap) => {
        const selectedDate = normalizeDateInput(queryParamMap.get("date"));
        this.pendingRouteEditorIntent = routeEditorIntent(
          queryParamMap,
          selectedDate,
        );
        return selectedDate;
      }),
      tap((date) => {
        this.selectedDate.set(date);
      }),
    );

    merge(routeDates, this.reloadRequests)
      .pipe(
        tap((selectedDate) => {
          this.state.set({ status: "loading", selectedDate });
          this.generatePlanState.set({ status: "idle", message: "" });
          this.progressState.set({ status: "idle", message: "" });
          this.interruptionState.set({ status: "idle", message: "" });
          this.explanationStates.set({});
          this.selectedScheduleItemId.set(null);
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
        if (state.status === "ready") {
          const timeZone = state.data.day?.time_zone ?? guessTimeZone();
          this.selectedScheduleItemId.set(
            state.data.snapshot?.items[0]?.id ?? null,
          );
          if (isBlankProgressForm(this.progressForm())) {
            this.progressForm.set(emptyProgressForm(timeZone));
          }
          if (isBlankInterruptionForm(this.interruptionForm())) {
            this.interruptionForm.set(emptyInterruptionForm(timeZone));
          }
          this.applyPendingRouteEditorIntent(state);
          this.restorePendingMutationFocus();
        }
      });
  }

  protected openSelectedDate(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: dateNavigationQueryParams(this.selectedDate()),
      queryParamsHandling: "merge",
    });
  }

  protected openToday(): void {
    const nextDate = todayLocalDate();
    this.selectedDate.set(nextDate);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: dateNavigationQueryParams(nextDate),
      queryParamsHandling: "merge",
    });
  }

  protected moveDate(days: number): void {
    const nextDate = addDays(this.selectedDate(), days);
    this.selectedDate.set(nextDate);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: dateNavigationQueryParams(nextDate),
      queryParamsHandling: "merge",
    });
  }

  protected switchPlannerView(view: string): void {
    const date = this.selectedDate();
    const route =
      view === "week"
        ? "/planner/week"
        : view === "month"
          ? "/planner/month"
          : "/planner";

    void this.router.navigate([route], { queryParams: { date } });
  }

  protected reload(): void {
    this.reloadRequests.next(this.state().selectedDate);
  }

  protected updateTaskForm(patch: Partial<TaskFormModel>): void {
    this.taskForm.update((form) => ({ ...form, ...patch }));
  }

  protected updateTaskAiText(value: string): void {
    this.taskAiText.set(value);
  }

  protected updateInterruptionAiText(value: string): void {
    this.interruptionAiText.set(value);
  }

  protected updateFixedEventForm(patch: Partial<FixedEventFormModel>): void {
    this.fixedEventForm.update((form) => ({ ...form, ...patch }));
  }

  protected updateProgressForm(patch: Partial<ProgressFormModel>): void {
    this.progressForm.update((form) => ({ ...form, ...patch }));
  }

  protected updateInterruptionForm(
    patch: Partial<InterruptionFormModel>,
  ): void {
    this.interruptionForm.update((form) => ({ ...form, ...patch }));
  }

  protected trapEditorFocus(event: Event, dialogId: string): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== "Tab") {
      return;
    }

    const dialog = document.getElementById(dialogId);
    if (dialog === null) {
      return;
    }

    const focusableElements = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (element) =>
        element.offsetParent !== null || element === document.activeElement,
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements.at(-1);

    if (firstElement === undefined || lastElement === undefined) {
      keyboardEvent.preventDefault();
      dialog.focus();
      return;
    }

    if (keyboardEvent.shiftKey && document.activeElement === firstElement) {
      keyboardEvent.preventDefault();
      lastElement.focus();
      return;
    }

    if (!keyboardEvent.shiftKey && document.activeElement === lastElement) {
      keyboardEvent.preventDefault();
      firstElement.focus();
    }
  }

  protected openNewTaskEditor(): void {
    this.rememberEditorReturnFocus("task");
    this.resetTaskForm();
    this.resetTaskSuggestion();
    this.taskEditorOpen.set(true);
    this.focusEditorControl("#task-title");
  }

  protected editTask(task: Task): void {
    this.rememberEditorReturnFocus("task");
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
    this.resetTaskSuggestion();
    this.taskEditorOpen.set(true);
    this.focusEditorControl("#task-title");
  }

  protected resetTaskForm(): void {
    this.taskForm.set(emptyTaskForm());
    this.taskFormErrors.set({});
    this.taskFormMessage.set("");
  }

  protected cancelTaskEditor(): void {
    this.resetTaskForm();
    this.resetTaskSuggestion();
    this.closeTaskEditor();
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

  protected suggestTask(): void {
    const requestVersion = ++this.taskSuggestionRequestVersion;
    const text = this.taskAiText().trim();
    if (text === "") {
      this.taskSuggestion.set({
        status: "error",
        message: "Add a short task description first.",
        result: null,
      });
      return;
    }

    const state = this.state();
    const timeZone =
      state.status === "ready"
        ? (state.data.day?.time_zone ?? guessTimeZone())
        : guessTimeZone();
    this.taskSuggestion.set({
      status: "pending",
      message: "Looking for editable task details.",
      result: null,
    });
    this.plannerApi
      .parseTask({
        text,
        local_date: this.selectedDate(),
        time_zone: timeZone,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (requestVersion !== this.taskSuggestionRequestVersion) {
            return;
          }
          this.taskSuggestion.set({
            status: result.status === "suggested" ? "ready" : "fallback",
            message: suggestionMessage(result),
            result,
          });
        },
        error: () => {
          if (requestVersion !== this.taskSuggestionRequestVersion) {
            return;
          }
          this.taskSuggestion.set({
            status: "fallback",
            message: fallbackMessage("service_unavailable"),
            result: taskFallbackResult("service_unavailable"),
          });
        },
      });
  }

  protected applyTaskSuggestion(result: ParseTaskResponse): void {
    if (result.status !== "suggested") {
      return;
    }
    const proposal = result.proposed_fields;
    const timeZone =
      currentWorkspaceDay(this.state())?.time_zone ??
      this.taskForm().earliestStartTimeZone;
    this.taskForm.update((form) => ({
      ...form,
      title: proposal.title ?? form.title,
      estimatedMinutes:
        proposal.estimated_minutes === null
          ? form.estimatedMinutes
          : String(proposal.estimated_minutes),
      priority:
        proposal.priority === null ? form.priority : String(proposal.priority),
      dueDate: proposal.due_date ?? form.dueDate,
      earliestStartLocal:
        proposal.earliest_start_at === null
          ? form.earliestStartLocal
          : toDateTimeLocalValue(proposal.earliest_start_at, timeZone),
      earliestStartTimeZone: timeZone,
      splittingAllowed: proposal.splitting_allowed ?? form.splittingAllowed,
      minSegmentMinutes:
        proposal.min_segment_minutes === null
          ? form.minSegmentMinutes
          : String(proposal.min_segment_minutes),
    }));
    this.taskFormErrors.set({});
    this.taskFormMessage.set("Suggestion applied. Review before saving.");
  }

  protected explainDecision(decision: ScheduleDecision): void {
    const state = this.state();
    if (state.status !== "ready" || state.data.day === null) {
      this.setExplanationState(decision.id, {
        status: "fallback",
        message: "Explanations are unavailable until a saved day is open.",
        result: explanationFallbackResult(
          decision,
          "service_unavailable",
          this.decisionText(decision, []),
        ),
      });
      return;
    }

    const deterministicReason = this.decisionText(decision, state.data.tasks);
    this.setExplanationState(decision.id, {
      status: "pending",
      message: "Optional explanation is loading.",
      result: null,
    });
    this.plannerApi
      .explainScheduleDecision(state.data.day.id, decision.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.setExplanationState(decision.id, {
            status: result.status === "explained" ? "ready" : "fallback",
            message: explanationMessage(result),
            result,
          });
        },
        error: () => {
          this.setExplanationState(decision.id, {
            status: "fallback",
            message: explanationFallbackMessage("service_unavailable"),
            result: explanationFallbackResult(
              decision,
              "service_unavailable",
              deterministicReason,
            ),
          });
        },
      });
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

  protected deleteCurrentTask(): void {
    const form = this.taskForm();
    const task = this.currentTasks().find(
      (candidate) => candidate.id === form.id,
    );
    if (task) {
      this.deleteTask(task);
    }
  }

  protected openNewFixedEventEditor(): void {
    this.rememberEditorReturnFocus("fixedEvent");
    this.resetFixedEventForm();
    this.fixedEventEditorOpen.set(true);
    this.focusEditorControl("#fixed-event-title");
  }

  protected editFixedEvent(event: FixedEvent): void {
    this.rememberEditorReturnFocus("fixedEvent");
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
    this.fixedEventEditorOpen.set(true);
    this.focusEditorControl("#fixed-event-title");
  }

  protected resetFixedEventForm(): void {
    this.fixedEventForm.set(
      emptyFixedEventForm(currentWorkspaceDay(this.state())?.time_zone),
    );
    this.fixedEventFormErrors.set({});
    this.fixedEventFormMessage.set("");
  }

  protected cancelFixedEventEditor(): void {
    this.resetFixedEventForm();
    this.closeFixedEventEditor();
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

  protected deleteCurrentFixedEvent(): void {
    const form = this.fixedEventForm();
    const event = this.currentFixedEvents().find(
      (candidate) => candidate.id === form.id,
    );
    if (event) {
      this.deleteFixedEvent(event);
    }
  }

  protected generatePlan(): void {
    const state = this.state();
    if (state.status !== "ready") {
      this.generatePlanState.set({
        status: "error",
        message: "Planner data is still loading.",
      });
      return;
    }

    const day = state.data.day;
    if (day === null) {
      this.generatePlanState.set({
        status: "error",
        message:
          "Save a planning day before generating a schedule. Add a fixed event for this date or open a saved day.",
      });
      return;
    }

    const action = "plan:generate";
    this.busyAction.set(action);
    this.generatePlanState.set({
      status: "pending",
      message: "Generating a schedule from the saved planning inputs.",
    });
    this.plannerApi
      .generatePlan(day.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (snapshot) => {
          this.busyAction.set(null);
          let snapshotApplied = false;
          this.state.update((current) => {
            if (current.status === "ready" && current.data.day?.id === day.id) {
              snapshotApplied = true;
              return {
                ...current,
                data: {
                  ...current.data,
                  day: {
                    ...current.data.day,
                    current_snapshot_id: snapshot.id,
                  },
                  snapshot,
                },
              };
            }
            return current;
          });
          if (snapshotApplied) {
            this.selectedScheduleItemId.set(snapshot.items[0]?.id ?? null);
            this.generatePlanState.set({
              status: "success",
              message: `Generated schedule snapshot v${snapshot.version}.`,
            });
          }
        },
        error: (error: unknown) => {
          this.busyAction.set(null);
          const current = this.state();
          if (current.status === "ready" && current.data.day?.id === day.id) {
            this.generatePlanState.set({
              status: "error",
              message: generatePlanErrorMessage(error),
            });
          }
        },
      });
  }

  protected submitTaskProgress(): void {
    const state = this.state();
    if (state.status !== "ready" || state.data.day === null) {
      this.progressState.set({
        status: "error",
        message: "Open a saved planning day before recording progress.",
      });
      return;
    }

    const result = buildProgressRequest(
      this.progressForm(),
      state.data.tasks,
      state.data.progress,
    );
    if (!result.ok) {
      this.progressFormErrors.set(result.errors);
      this.progressState.set({
        status: "error",
        message: "Review the progress details before saving.",
      });
      return;
    }

    const day = state.data.day;
    const action = "progress:record";
    this.busyAction.set(action);
    this.progressFormErrors.set({});
    this.progressState.set({
      status: "pending",
      message: "Recording completed work.",
    });
    this.plannerApi
      .recordTaskProgress(day.id, result.request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (progress) => {
          this.busyAction.set(null);
          this.applyProgress(progress);
          this.progressForm.set(emptyProgressForm(day.time_zone));
          this.progressState.set({
            status: "success",
            message: "Progress saved. Completed work stays in history.",
          });
        },
        error: (error: unknown) => {
          this.busyAction.set(null);
          this.progressState.set({
            status: "error",
            message: progressErrorMessage(error),
          });
        },
      });
  }

  protected markTaskComplete(task: Task): void {
    const state = this.state();
    if (state.status !== "ready" || state.data.day === null) {
      return;
    }

    const remainingMinutes = remainingTaskMinutes(task, state.data.progress);
    if (remainingMinutes <= 0) {
      return;
    }

    const timeZone = state.data.day.time_zone;
    this.progressForm.set({
      taskId: task.id,
      completedMinutes: String(remainingMinutes),
      recordedLocal: currentDateTimeLocalValue(timeZone),
      timeZone,
    });
    this.submitTaskProgress();
  }

  protected submitInterruption(): void {
    const state = this.state();
    if (state.status !== "ready" || state.data.day === null) {
      this.interruptionState.set({
        status: "error",
        message: "Open a saved planning day before reporting unavailable time.",
      });
      return;
    }
    if (state.data.snapshot === null) {
      this.interruptionState.set({
        status: "error",
        message: "Generate a schedule before reporting an interruption.",
      });
      return;
    }

    const result = buildInterruptionRequest(this.interruptionForm());
    if (!result.ok) {
      this.interruptionFormErrors.set(result.errors);
      this.interruptionState.set({
        status: "error",
        message: "Review the interruption details before submitting.",
      });
      return;
    }

    const day = state.data.day;
    const action = "interruption:report";
    this.busyAction.set(action);
    this.interruptionFormErrors.set({});
    this.interruptionState.set({
      status: "pending",
      message: "Saving unavailable time and revising the remaining plan.",
    });
    this.plannerApi
      .reportInterruption(day.id, result.request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (snapshot) => {
          this.busyAction.set(null);
          let applied = false;
          this.state.update((current) => {
            if (current.status === "ready" && current.data.day?.id === day.id) {
              applied = true;
              return {
                ...current,
                data: {
                  ...current.data,
                  day: {
                    ...current.data.day,
                    current_snapshot_id: snapshot.id,
                  },
                  snapshot,
                },
              };
            }
            return current;
          });
          if (applied) {
            this.selectedScheduleItemId.set(snapshot.items[0]?.id ?? null);
            this.interruptionForm.set(emptyInterruptionForm(day.time_zone));
            this.interruptionState.set({
              status: "success",
              message: `Revised schedule snapshot v${snapshot.version} is now shown.`,
            });
          }
        },
        error: (error: unknown) => {
          this.busyAction.set(null);
          this.interruptionState.set({
            status: "error",
            message: interruptionErrorMessage(error),
          });
        },
      });
  }

  protected suggestInterruption(): void {
    const text = this.interruptionAiText().trim();
    if (text === "") {
      this.interruptionSuggestion.set({
        status: "error",
        message: "Add a short interruption description first.",
        result: null,
      });
      return;
    }

    const timeZone =
      currentWorkspaceDay(this.state())?.time_zone ??
      this.interruptionForm().timeZone ??
      guessTimeZone();
    this.interruptionSuggestion.set({
      status: "pending",
      message: "Looking for editable unavailable time.",
      result: null,
    });
    this.plannerApi
      .parseInterruption({
        text,
        local_date: this.selectedDate(),
        time_zone: timeZone,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.interruptionSuggestion.set({
            status: result.status === "suggested" ? "ready" : "fallback",
            message: suggestionMessage(result),
            result,
          });
        },
        error: () => {
          this.interruptionSuggestion.set({
            status: "fallback",
            message: fallbackMessage("service_unavailable"),
            result: interruptionFallbackResult("service_unavailable"),
          });
        },
      });
  }

  protected applyInterruptionSuggestion(
    result: ParseInterruptionResponse,
  ): void {
    if (result.status !== "suggested") {
      return;
    }
    const proposal = result.proposed_fields;
    const timeZone = proposal.time_zone ?? this.interruptionForm().timeZone;
    this.interruptionForm.update((form) => ({
      ...form,
      startLocal:
        proposal.start_at === null
          ? form.startLocal
          : toDateTimeLocalValue(proposal.start_at, timeZone),
      endLocal:
        proposal.end_at === null
          ? form.endLocal
          : toDateTimeLocalValue(proposal.end_at, timeZone),
      timeZone,
      reportedLocal:
        proposal.reported_at === null
          ? form.reportedLocal
          : toDateTimeLocalValue(proposal.reported_at, timeZone),
    }));
    this.interruptionFormErrors.set({});
    this.interruptionState.set({
      status: "idle",
      message: "Suggestion applied. Review before submitting.",
    });
  }

  protected unfinishedTasks(
    tasks: readonly Task[],
    progress: readonly TaskProgress[],
  ): readonly Task[] {
    return tasks.filter((task) => remainingTaskMinutes(task, progress) > 0);
  }

  protected completedTasks(
    tasks: readonly Task[],
    progress: readonly TaskProgress[],
  ): readonly Task[] {
    return tasks.filter((task) => remainingTaskMinutes(task, progress) <= 0);
  }

  protected completedMinutesForTask(
    task: Task,
    progress: readonly TaskProgress[],
  ): number {
    return task.completed_minutes ?? completedTaskMinutes(task.id, progress);
  }

  protected remainingMinutesForTask(
    task: Task,
    progress: readonly TaskProgress[],
  ): number {
    return remainingTaskMinutes(task, progress);
  }

  protected progressRecordsForTask(
    task: Task,
    progress: readonly TaskProgress[],
  ): readonly TaskProgress[] {
    return progress.filter((record) => record.task_id === task.id);
  }

  protected taskTitleForProgress(
    record: TaskProgress,
    tasks: readonly Task[],
  ): string {
    return tasks.find((task) => task.id === record.task_id)?.title ?? "Task";
  }

  protected totalCompletedMinutes(progress: readonly TaskProgress[]): number {
    return totalCompletedMinutes(progress);
  }

  protected fieldError(errors: FormErrors, field: string): string {
    return errors[field] ?? "";
  }

  protected isBusy(action: string): boolean {
    return this.busyAction() === action;
  }

  protected canGeneratePlan(): boolean {
    const state = this.state();
    return (
      this.busyAction() === null &&
      state.status === "ready" &&
      state.data.day !== null
    );
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

  protected timelineSlots(
    snapshot: ScheduleSnapshot | null,
    planningDayTimeZone: string | undefined,
    selectedDate: string,
    fixedEvents: readonly FixedEvent[] = [],
  ): readonly TimelineSlot[] {
    return timelineSlots(
      snapshot,
      planningDayTimeZone ?? "UTC",
      selectedDate,
      fixedEvents,
    );
  }

  protected fallbackTimeZone(): string {
    return guessTimeZone();
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

  protected itemClass(kind: string, isCompact: boolean): string {
    const shared = isCompact
      ? "absolute min-w-0 overflow-hidden rounded-sm border border-mist-200 bg-white shadow-sm transition focus-visible:z-20 focus-visible:shadow-focus"
      : "absolute min-w-0 overflow-hidden rounded-md border border-mist-200 bg-white p-2 shadow-sm transition focus-visible:z-20 focus-visible:shadow-focus sm:p-3";

    switch (kind) {
      case "task":
        return `${shared} border-l-4 border-l-meadow-600`;
      case "fixed_event":
        return `${shared} border-l-4 border-l-signal-600`;
      case "interruption":
        return `${shared} border-l-4 border-l-rose-500`;
      case "designated_free_time":
        return `${shared} border-l-4 border-l-sky-500`;
      default:
        return `${shared} border-l-4 border-l-mist-300`;
    }
  }

  protected kindLabel(kind: string): string {
    return formatKindLabel(kind);
  }

  protected snapshotItemCount(snapshot: ScheduleSnapshot | null): number {
    return snapshot?.items.length ?? 0;
  }

  protected snapshotStateLabel(snapshot: ScheduleSnapshot | null): string {
    if (snapshot === null) {
      return "No plan";
    }

    return snapshot.version > 1
      ? snapshotHasRecoveryEvidence(snapshot)
        ? `Revised plan v${snapshot.version}`
        : `Generated plan v${snapshot.version}`
      : `Initial plan v${snapshot.version}`;
  }

  protected selectScheduleItem(itemId: string): void {
    this.selectedScheduleItemId.set(itemId);
  }

  protected activateTimelineBlock(
    block: TimelineBlock,
    tasks: readonly Task[],
    fixedEvents: readonly FixedEvent[],
    planningDayTimeZone: string | undefined,
  ): void {
    this.selectScheduleItem(block.item.id);
    if (block.item.kind === "task" && block.item.task_id !== null) {
      const task = tasks.find(
        (candidate) => candidate.id === block.item.task_id,
      );
      if (task) {
        this.editTask(task);
      }
      return;
    }
    if (
      block.item.kind === "fixed_event" &&
      block.item.fixed_event_id !== null
    ) {
      const event = fixedEvents.find(
        (candidate) => candidate.id === block.item.fixed_event_id,
      );
      if (event) {
        this.editFixedEvent(event);
      }
      return;
    }
    if (block.item.kind === "designated_free_time") {
      this.openCalendarCreateChoice({
        sourceId: `block-${block.item.id}`,
        localDate: this.selectedDate(),
        startLocal: toDateTimeLocalValue(
          block.item.start_at,
          planningDayTimeZone ?? "UTC",
        ),
        endLocal: toDateTimeLocalValue(
          block.item.end_at,
          planningDayTimeZone ?? "UTC",
        ),
        timeZone: planningDayTimeZone ?? "UTC",
      });
    }
  }

  protected openCalendarCreateChoice(slot: {
    readonly sourceId: string;
    readonly localDate: string;
    readonly startLocal: string;
    readonly endLocal: string;
    readonly timeZone: string;
    readonly returnFocusSelector?: string;
    readonly returnFocusFallbackSelector?: string;
  }): void {
    const activeElement = document.activeElement;
    this.calendarCreateReturnFocus = {
      element: activeElement instanceof HTMLElement ? activeElement : null,
      selector:
        slot.returnFocusSelector ?? calendarSlotSelector(slot.sourceId) ?? null,
      fallbackSelector: slot.returnFocusFallbackSelector ?? null,
    };
    const durationMinutes = Math.max(
      30,
      durationMinutesBetweenDateTimeLocal(slot.startLocal, slot.endLocal),
    );
    this.calendarCreateSelection.set({
      ...slot,
      durationMinutes,
      label: `${formatDateLabel(slot.localDate)} at ${slot.startLocal.slice(11)}`,
    });
    this.focusSelector("#calendar-create-fixed-event");
  }

  protected closeCalendarCreateChoice(): void {
    const target = this.calendarCreateReturnFocus;
    this.calendarCreateReturnFocus = { element: null, selector: null };
    this.calendarCreateSelection.set(null);
    this.restoreFocusTarget(target);
  }

  protected createFixedEventFromCalendarSelection(): void {
    const selection = this.calendarCreateSelection();
    if (selection === null) {
      return;
    }
    const returnFocus = this.calendarCreateReturnFocus;
    this.calendarCreateReturnFocus = { element: null, selector: null };
    this.calendarCreateSelection.set(null);
    this.fixedEventEditorReturnFocus = returnFocus;
    this.fixedEventForm.set({
      id: null,
      planningDayId: currentWorkspaceDay(this.state())?.id ?? null,
      title: "",
      startLocal: selection.startLocal,
      endLocal: selection.endLocal,
      timeZone: selection.timeZone,
    });
    this.fixedEventFormErrors.set({});
    this.fixedEventFormMessage.set("");
    this.fixedEventEditorOpen.set(true);
    this.focusEditorControl("#fixed-event-title");
  }

  protected createTaskFromCalendarSelection(): void {
    const selection = this.calendarCreateSelection();
    if (selection === null) {
      return;
    }
    const returnFocus = this.calendarCreateReturnFocus;
    this.calendarCreateReturnFocus = { element: null, selector: null };
    this.calendarCreateSelection.set(null);
    this.taskEditorReturnFocus = returnFocus;
    this.taskForm.set({
      ...emptyTaskForm(),
      estimatedMinutes: String(selection.durationMinutes),
      dueDate: selection.localDate,
      earliestStartLocal: selection.startLocal,
      earliestStartTimeZone: selection.timeZone,
    });
    this.taskFormErrors.set({});
    this.taskFormMessage.set("");
    this.resetTaskSuggestion();
    this.taskEditorOpen.set(true);
    this.focusEditorControl("#task-title");
  }

  protected selectedTimelineBlock(
    snapshot: ScheduleSnapshot,
    tasks: readonly Task[],
    fixedEvents: readonly FixedEvent[],
    progress: readonly TaskProgress[],
    planningDayTimeZone: string | undefined,
  ): TimelineBlock {
    const blocks = this.timelineBlocks(
      snapshot,
      tasks,
      fixedEvents,
      progress,
      planningDayTimeZone,
    );
    const selectedId = this.selectedScheduleItemId();

    return (
      blocks.find((block) => block.item.id === selectedId) ??
      blocks[0] ?? {
        item: {
          id: "empty",
          kind: "empty",
          task_id: null,
          fixed_event_id: null,
          interruption_id: null,
          start_at: "",
          end_at: "",
        },
        label: "No selected block",
        kindLabel: "No block",
        marker: "Block",
        recoveryState: null,
        recoveryLabel: null,
        completionLabel: null,
        isCompact: false,
        minutes: 0,
        topPercent: 0,
        heightPercent: 0,
        topMinutes: 0,
        heightMinutes: 0,
        laneIndex: 0,
        laneCount: 1,
        leftPercent: 0,
        widthPercent: 100,
      }
    );
  }

  protected selectedBlockReasons(
    block: TimelineBlock,
    snapshot: ScheduleSnapshot,
    tasks: readonly Task[],
  ): readonly string[] {
    if (block.item.kind === "task") {
      const placementReasons = snapshot.decisions
        .filter(
          (decision) =>
            decision.task_id !== null &&
            decision.task_id === block.item.task_id &&
            isBlockReasonForTimelineBlock(decision.reason_code, block),
        )
        .map((decision) => this.decisionText(decision, tasks));

      return placementReasons.length > 0
        ? placementReasons
        : [fallbackScheduleReason(block.item.kind)];
    }

    const kindReason = snapshot.decisions.find(
      (decision) =>
        decision.task_id === null &&
        decision.reason_code === reasonCodeForScheduleKind(block.item.kind),
    );

    if (kindReason) {
      return [this.decisionText(kindReason, tasks)];
    }

    return [fallbackScheduleReason(block.item.kind)];
  }

  protected isSelectedScheduleItem(itemId: string): boolean {
    return this.selectedScheduleItemId() === itemId;
  }

  protected scheduleBlockAriaLabel(
    block: TimelineBlock,
    planningDayTimeZone: string | undefined,
  ): string {
    const parts = [
      block.label,
      block.kindLabel,
      this.formatDuration(block.minutes),
      this.formatScheduleTimeRange(
        block.item.start_at,
        block.item.end_at,
        planningDayTimeZone,
      ),
    ];

    if (block.recoveryLabel) {
      parts.push(block.recoveryLabel);
    }
    if (block.completionLabel) {
      parts.push(block.completionLabel);
    }

    return parts.join(", ");
  }

  protected timeRulerTicks(
    snapshot: ScheduleSnapshot | null,
    planningDayTimeZone: string | undefined,
  ): readonly TimelineTick[] {
    const timeZone = planningDayTimeZone ?? "UTC";
    const bounds = timelineBounds(snapshot, timeZone);
    const totalMinutes = Math.max(1, bounds.endMinutes - bounds.startMinutes);
    const firstHour = Math.ceil(bounds.startMinutes / 60) * 60;
    const ticks: TimelineTick[] = [];

    ticks.push({
      label: formatMinutesAsTime(bounds.startMinutes),
      topPercent: 0,
      labelTopPercent: null,
      labelClass: "absolute right-2 top-1",
      minutesFromStart: 0,
    });

    for (let minutes = firstHour; minutes < bounds.endMinutes; minutes += 60) {
      if (minutes === bounds.startMinutes) {
        continue;
      }
      ticks.push({
        label: formatMinutesAsTime(minutes),
        topPercent: ((minutes - bounds.startMinutes) / totalMinutes) * 100,
        labelTopPercent: ((minutes - bounds.startMinutes) / totalMinutes) * 100,
        labelClass: "absolute right-2 -translate-y-1/2",
        minutesFromStart: minutes - bounds.startMinutes,
      });
    }

    ticks.push({
      label: formatMinutesAsTime(bounds.endMinutes),
      topPercent: 100,
      labelTopPercent: null,
      labelClass: "absolute bottom-1 right-2",
      minutesFromStart: totalMinutes,
    });

    return ticks;
  }

  protected dayBoundsLabel(
    snapshot: ScheduleSnapshot | null,
    planningDayTimeZone: string | undefined,
  ): string {
    const bounds = timelineBounds(snapshot, planningDayTimeZone ?? "UTC");
    return `${formatMinutesAsTime(bounds.startMinutes)}-${formatMinutesAsTime(bounds.endMinutes)}`;
  }

  protected timelineBlocks(
    snapshot: ScheduleSnapshot,
    tasks: readonly Task[],
    fixedEvents: readonly FixedEvent[],
    progress: readonly TaskProgress[],
    planningDayTimeZone: string | undefined,
  ): readonly TimelineBlock[] {
    const timeZone = planningDayTimeZone ?? "UTC";
    const bounds = timelineBounds(snapshot, timeZone);
    const totalMinutes = Math.max(1, bounds.endMinutes - bounds.startMinutes);

    const laneLayout = timelineLaneLayout(snapshot.items, timeZone);
    const completedItemIds = completedScheduleItemIds(
      snapshot,
      progress,
      timeZone,
    );
    const taskRecoveryStates = recoveryStatesByTask(snapshot.decisions);

    return snapshot.items.map((item) => {
      const startMinutes = minutesFromIsoInZone(item.start_at, timeZone);
      const endMinutes = minutesFromIsoInZone(item.end_at, timeZone);
      const topMinutes = Math.max(0, startMinutes - bounds.startMinutes);
      const heightMinutes = Math.max(1, endMinutes - startMinutes);
      const lanes = laneLayout.get(item.id) ?? { laneIndex: 0, laneCount: 1 };
      const widthPercent = 100 / lanes.laneCount;
      const completionLabel = completedItemIds.has(item.id) ? "Done" : null;
      const recoveryState =
        item.kind === "task" &&
        item.task_id !== null &&
        completionLabel === null
          ? (taskRecoveryStates.get(item.task_id) ?? null)
          : null;

      return {
        item,
        label: this.itemLabel(item, tasks, fixedEvents),
        kindLabel: this.kindLabel(item.kind),
        marker: itemMarker(item.kind),
        recoveryState,
        recoveryLabel:
          recoveryState === null ? null : recoveryLabelForState(recoveryState),
        completionLabel,
        isCompact: heightMinutes <= COMPACT_TIMELINE_BLOCK_MINUTES,
        minutes: heightMinutes,
        topPercent: (topMinutes / totalMinutes) * 100,
        heightPercent: (heightMinutes / totalMinutes) * 100,
        topMinutes,
        heightMinutes,
        laneIndex: lanes.laneIndex,
        laneCount: lanes.laneCount,
        leftPercent: lanes.laneIndex * widthPercent,
        widthPercent,
      };
    });
  }

  protected timelineHeight(
    snapshot: ScheduleSnapshot | null,
    planningDayTimeZone: string | undefined,
  ): number {
    const bounds = timelineBounds(snapshot, planningDayTimeZone ?? "UTC");
    return Math.max(26, (bounds.endMinutes - bounds.startMinutes) * 1.5);
  }

  protected scheduleSummary(
    snapshot: ScheduleSnapshot | null,
  ): ScheduleSummary {
    if (snapshot === null) {
      return {
        scheduledWorkMinutes: 0,
        freeTimeMinutes: 0,
        deferredWorkCount: 0,
      };
    }

    return {
      scheduledWorkMinutes: minutesByKind(snapshot, "task"),
      freeTimeMinutes: minutesByKind(snapshot, "designated_free_time"),
      deferredWorkCount: this.deferredDecisions(snapshot, []).length,
    };
  }

  protected deferredDecisions(
    snapshot: ScheduleSnapshot,
    tasks: readonly Task[],
  ): ReadonlyArray<ScheduleDecision & { readonly taskTitle: string }> {
    return snapshot.decisions
      .filter((decision) => isDeferredReasonCode(decision.reason_code))
      .map((decision) => ({
        ...decision,
        taskTitle:
          tasks.find((task) => task.id === decision.task_id)?.title ??
          "Unscheduled work",
      }));
  }

  protected movedDecisions(
    snapshot: ScheduleSnapshot,
    tasks: readonly Task[],
  ): ReadonlyArray<ScheduleDecision & { readonly taskTitle: string }> {
    return snapshot.decisions
      .filter((decision) => decision.reason_code === "moved_after_interruption")
      .map((decision) => ({
        ...decision,
        taskTitle:
          tasks.find((task) => task.id === decision.task_id)?.title ?? "Work",
      }));
  }

  protected decisionText(
    decision: ScheduleDecision,
    tasks: readonly Task[],
  ): string {
    const taskTitle =
      decision.task_id === null
        ? null
        : (tasks.find((task) => task.id === decision.task_id)?.title ?? "Task");
    const subject = taskTitle === null ? "The schedule" : taskTitle;

    switch (decision.reason_code) {
      case "placed_in_earliest_valid_window":
        return `${subject} was placed in the earliest valid window.`;
      case "moved_after_interruption":
        return `${subject} was moved after reported unavailable time.`;
      case "split_across_available_windows":
        return `${subject} was split across available windows.`;
      case "blocked_by_fixed_event":
        return `${subject} was not scheduled because fixed events reserve the available time.`;
      case "blocked_by_interruption":
        return `${subject} was not scheduled because reported unavailable time reserves the available time.`;
      case "missed_before_current_time":
        return `${subject} was not scheduled because its previous time is already past.`;
      case "insufficient_time_before_deadline":
        return `${subject} was not scheduled because there is not enough time before its due date.`;
      case "insufficient_remaining_day_time":
        return `${subject} was not scheduled because there is not enough remaining time in the day.`;
      case "designated_free_time":
        return "A remaining useful window was kept as free time.";
      case "locked_time_overlap_merged":
        return "Overlapping unavailable time was counted once.";
      default:
        if (decision.reason_code.startsWith("warning:")) {
          return `Schedule warning ${decision.reason_code}.`;
        }
        return `Scheduler reason ${decision.reason_code}.`;
    }
  }

  protected decisionCode(decision: ScheduleDecision): string {
    return decision.reason_code;
  }

  protected decisionExplanationState(decisionId: string): ExplanationState {
    return (
      this.explanationStates()[decisionId] ?? {
        status: "idle",
        message: "",
        result: null,
      }
    );
  }

  protected formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`;
  }

  private applyProgress(progress: TaskProgress): void {
    this.state.update((current) => {
      if (
        current.status !== "ready" ||
        current.data.day?.id !== progress.planning_day_id
      ) {
        return current;
      }

      return {
        ...current,
        data: {
          ...current.data,
          tasks: current.data.tasks.map((task) =>
            task.id === progress.task_id
              ? taskWithAppliedProgress(task, progress.completed_minutes)
              : task,
          ),
          progress: [...current.data.progress, progress].sort(compareProgress),
        },
      };
    });
  }

  private setExplanationState(
    decisionId: string,
    state: ExplanationState,
  ): void {
    this.explanationStates.update((current) => ({
      ...current,
      [decisionId]: state,
    }));
  }

  private currentTasks(): readonly Task[] {
    const state = this.state();
    return state.status === "ready" ? state.data.tasks : [];
  }

  private currentFixedEvents(): readonly FixedEvent[] {
    const state = this.state();
    return state.status === "ready" ? state.data.fixedEvents : [];
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
        this.pendingMutationFocus = mutationFocusTarget(action, formKind);
        if (formKind === "task") {
          this.resetTaskForm();
          this.closeTaskEditor({ restoreFocus: false });
        } else {
          this.resetFixedEventForm();
          this.closeFixedEventEditor({ restoreFocus: false });
        }
        this.focusSelector(this.pendingMutationFocus.loadingSelector);
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

  private rememberEditorReturnFocus(kind: EditorKind): void {
    const activeElement = document.activeElement;
    const returnFocus: EditorReturnFocus = {
      element: activeElement instanceof HTMLElement ? activeElement : null,
      selector: null,
    };
    if (kind === "task") {
      this.taskEditorReturnFocus = returnFocus;
    } else {
      this.fixedEventEditorReturnFocus = returnFocus;
    }
  }

  private closeTaskEditor(
    options: { readonly restoreFocus: boolean } = { restoreFocus: true },
  ): void {
    this.taskSuggestionRequestVersion += 1;
    this.taskEditorOpen.set(false);
    if (options.restoreFocus) {
      this.restoreEditorFocus("task");
    } else {
      this.taskEditorReturnFocus = { element: null, selector: null };
    }
  }

  private closeFixedEventEditor(
    options: { readonly restoreFocus: boolean } = { restoreFocus: true },
  ): void {
    this.fixedEventEditorOpen.set(false);
    if (options.restoreFocus) {
      this.restoreEditorFocus("fixedEvent");
    } else {
      this.fixedEventEditorReturnFocus = { element: null, selector: null };
    }
  }

  private restoreEditorFocus(kind: EditorKind): void {
    const target =
      kind === "task"
        ? this.taskEditorReturnFocus
        : this.fixedEventEditorReturnFocus;
    if (kind === "task") {
      this.taskEditorReturnFocus = { element: null, selector: null };
    } else {
      this.fixedEventEditorReturnFocus = { element: null, selector: null };
    }
    this.restoreFocusTarget(target);
  }

  private focusEditorControl(selector: string): void {
    this.focusSelector(selector);
  }

  private applyPendingRouteEditorIntent(
    state: Extract<WorkspaceLoadState, { status: "ready" }>,
  ): void {
    const intent = this.pendingRouteEditorIntent;
    if (intent === null) {
      return;
    }
    const key = routeEditorIntentKey(intent);
    if (this.handledRouteEditorIntentKey === key) {
      return;
    }
    this.handledRouteEditorIntentKey = key;
    this.clearRouteEditorIntentParams();

    if (intent.kind === "create") {
      const timeZone = state.data.day?.time_zone ?? guessTimeZone();
      const startLocal = `${intent.selectedDate}T${intent.start}`;
      this.openCalendarCreateChoice({
        sourceId: `route-${intent.selectedDate}-${intent.start}`,
        localDate: intent.selectedDate,
        startLocal,
        endLocal: addMinutesToDateTimeLocal(startLocal, 30),
        timeZone,
        returnFocusSelector: calendarSlotSelector(
          `slot-${intent.selectedDate}-${intent.start}`,
        ),
        returnFocusFallbackSelector: '[data-editor-trigger="fixed-event-add"]',
      });
      return;
    }

    if (intent.kind === "editTask") {
      const task = state.data.tasks.find(
        (candidate) => candidate.id === intent.taskId,
      );
      if (task) {
        this.editTask(task);
        this.taskEditorReturnFocus = {
          element: null,
          selector: `[data-editor-trigger="task-edit"][data-item-id="${cssEscape(intent.taskId)}"], [data-editor-trigger="task-add"]`,
        };
      }
      return;
    }

    const event = state.data.fixedEvents.find(
      (candidate) => candidate.id === intent.fixedEventId,
    );
    if (event) {
      this.editFixedEvent(event);
      this.fixedEventEditorReturnFocus = {
        element: null,
        selector: `[data-editor-trigger="fixed-event-edit"][data-item-id="${cssEscape(intent.fixedEventId)}"], [data-editor-trigger="fixed-event-add"]`,
      };
    }
  }

  private focusSelector(selector: string, fallbackSelector?: string): void {
    queueMicrotask(() => {
      const control =
        document.querySelector(selector) ??
        (fallbackSelector ? document.querySelector(fallbackSelector) : null);
      if (control instanceof HTMLElement) {
        control.focus();
      }
    });
  }

  private restorePendingMutationFocus(): void {
    const pendingFocus = this.pendingMutationFocus;
    if (pendingFocus === null) {
      return;
    }

    this.pendingMutationFocus = null;
    this.focusSelector(
      pendingFocus.readySelector,
      pendingFocus.fallbackReadySelector,
    );
  }

  private clearRouteEditorIntentParams(): void {
    this.pendingRouteEditorIntent = null;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        create: null,
        start: null,
        editTask: null,
        editFixedEvent: null,
      },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }

  private restoreFocusTarget(target: EditorReturnFocus): void {
    queueMicrotask(() => {
      if (target.element?.isConnected && target.element !== document.body) {
        target.element.focus();
        return;
      }

      if (target.selector !== null) {
        const control =
          document.querySelector(target.selector) ??
          (target.fallbackSelector
            ? document.querySelector(target.fallbackSelector)
            : null);
        if (control instanceof HTMLElement) {
          control.focus();
        }
      }
    });
  }

  private resetTaskSuggestion(): void {
    this.taskSuggestionRequestVersion += 1;
    this.taskAiText.set("");
    this.taskSuggestion.set({
      status: "idle",
      message: "",
      result: null,
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

function emptyProgressForm(timeZone?: string): ProgressFormModel {
  const normalizedTimeZone = normalizeTimeZone(timeZone ?? guessTimeZone());
  return {
    taskId: "",
    completedMinutes: "",
    recordedLocal: currentDateTimeLocalValue(normalizedTimeZone),
    timeZone: normalizedTimeZone,
  };
}

function emptyInterruptionForm(timeZone?: string): InterruptionFormModel {
  const normalizedTimeZone = normalizeTimeZone(timeZone ?? guessTimeZone());
  return {
    startLocal: "",
    endLocal: "",
    timeZone: normalizedTimeZone,
    reportedLocal: currentDateTimeLocalValue(normalizedTimeZone),
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

function isBlankProgressForm(form: ProgressFormModel): boolean {
  return form.taskId === "" && form.completedMinutes === "";
}

function isBlankInterruptionForm(form: InterruptionFormModel): boolean {
  return form.startLocal === "" && form.endLocal === "";
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

function buildProgressRequest(
  form: ProgressFormModel,
  tasks: readonly Task[],
  progress: readonly TaskProgress[],
):
  | { ok: true; request: TaskProgressCreateRequest }
  | { ok: false; errors: FormErrors } {
  const errors: Record<string, string> = {};
  const task = tasks.find((candidate) => candidate.id === form.taskId);
  const completedMinutes = Number(form.completedMinutes);

  if (task === undefined) {
    errors["taskId"] = "Choose unfinished work.";
  } else {
    const remainingMinutes = remainingTaskMinutes(task, progress);
    if (remainingMinutes <= 0) {
      errors["taskId"] = "This work is already complete.";
    } else if (
      !Number.isInteger(completedMinutes) ||
      completedMinutes < 1 ||
      completedMinutes > remainingMinutes
    ) {
      errors["completedMinutes"] = `Use 1 to ${remainingMinutes} minutes.`;
    }
  }

  const timeZone = normalizeTimeZone(form.timeZone);
  if (!isValidTimeZone(timeZone)) {
    errors["timeZone"] = "Use a valid IANA time zone.";
  }

  const recordedAt = errors["timeZone"]
    ? null
    : zonedLocalDateTimeToIso(form.recordedLocal, timeZone);
  if (recordedAt === null) {
    errors["recordedLocal"] = "Enter a valid recorded time.";
  }

  if (
    Object.keys(errors).length > 0 ||
    task === undefined ||
    recordedAt === null
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    request: {
      task_id: task.id,
      completed_minutes: completedMinutes,
      recorded_at: recordedAt,
    },
  };
}

function buildInterruptionRequest(
  form: InterruptionFormModel,
):
  | { ok: true; request: InterruptionCreateRequest }
  | { ok: false; errors: FormErrors } {
  const errors: Record<string, string> = {};
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
  const reportedAt = errors["timeZone"]
    ? null
    : zonedLocalDateTimeToIso(form.reportedLocal, timeZone);

  if (startAt === null) {
    errors["startLocal"] = "Enter a valid start time.";
  }
  if (endAt === null) {
    errors["endLocal"] = "Enter a valid end time.";
  }
  if (reportedAt === null) {
    errors["reportedLocal"] = "Enter a valid reported time.";
  }
  if (
    startAt !== null &&
    endAt !== null &&
    Date.parse(endAt) <= Date.parse(startAt)
  ) {
    errors["endLocal"] = "End time must be after start time.";
  }

  if (
    Object.keys(errors).length > 0 ||
    startAt === null ||
    endAt === null ||
    reportedAt === null
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    request: {
      start_at: startAt,
      end_at: endAt,
      time_zone: timeZone,
      reported_at: reportedAt,
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

function currentDateTimeLocalValue(timeZone: string): string {
  return toDateTimeLocalValue(new Date().toISOString(), timeZone);
}

function addMinutesToDateTimeLocal(value: string, minutes: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (match === null) {
    return value;
  }

  const date = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]) + minutes,
    ),
  );
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}T${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function durationMinutesBetweenDateTimeLocal(
  start: string,
  end: string,
): number {
  const startMinutes = dateTimeLocalToUtcMinutes(start);
  const endMinutes = dateTimeLocalToUtcMinutes(end);
  if (startMinutes === null || endMinutes === null) {
    return 30;
  }

  return Math.max(1, endMinutes - startMinutes);
}

function dateTimeLocalToUtcMinutes(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (match === null) {
    return null;
  }

  return (
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
    ) / 60_000
  );
}

function timelineSlots(
  snapshot: ScheduleSnapshot | null,
  timeZone: string,
  localDate: string,
  fixedEvents: readonly FixedEvent[] = [],
): readonly TimelineSlot[] {
  const bounds = timelineBounds(snapshot, timeZone);
  const totalMinutes = Math.max(1, bounds.endMinutes - bounds.startMinutes);
  const unavailable =
    snapshot?.items
      .filter((item) => item.kind !== "designated_free_time")
      .map((item) => ({
        startMinutes: minutesFromIsoInZone(item.start_at, timeZone),
        endMinutes: minutesFromIsoInZone(item.end_at, timeZone),
      })) ?? [];
  const fixedEventUnavailable = fixedEvents.map((event) => ({
    startMinutes: minutesFromIsoInZone(event.start_at, timeZone),
    endMinutes: minutesFromIsoInZone(event.end_at, timeZone),
  }));
  const unavailableIntervals = [...unavailable, ...fixedEventUnavailable];
  const slots: TimelineSlot[] = [];

  for (
    let startMinutes = bounds.startMinutes;
    startMinutes < bounds.endMinutes;
    startMinutes += 30
  ) {
    const endMinutes = Math.min(startMinutes + 30, bounds.endMinutes);
    if (
      unavailableIntervals.some(
        (item) =>
          startMinutes < item.endMinutes && endMinutes > item.startMinutes,
      )
    ) {
      continue;
    }

    const topMinutes = startMinutes - bounds.startMinutes;
    const startLocal = `${localDate}T${formatMinutesAsTime(startMinutes)}`;
    const endLocal = `${localDate}T${formatMinutesAsTime(endMinutes)}`;
    slots.push({
      id: `slot-${localDate}-${formatMinutesAsTime(startMinutes)}`,
      label: `${formatMinutesAsTime(startMinutes)} open slot`,
      startLocal,
      endLocal,
      timeZone,
      topPercent: (topMinutes / totalMinutes) * 100,
      heightPercent: ((endMinutes - startMinutes) / totalMinutes) * 100,
      topMinutes,
      heightMinutes: endMinutes - startMinutes,
    });
  }

  return slots;
}

function dateNavigationQueryParams(
  date: string,
): Record<string, string | null> {
  return {
    date,
    create: null,
    start: null,
    editTask: null,
    editFixedEvent: null,
  };
}

function calendarSlotSelector(slotId: string): string {
  return `[data-calendar-slot="${cssEscape(slotId)}"]`;
}

function routeEditorIntent(
  queryParamMap: { get(name: string): string | null },
  selectedDate: string,
): RouteEditorIntent | null {
  const start = queryParamMap.get("start");
  if (queryParamMap.get("create") === "slot" && isValidClockTime(start)) {
    return { kind: "create", selectedDate, start };
  }

  const taskId = queryParamMap.get("editTask");
  if (taskId !== null && taskId.trim() !== "") {
    return { kind: "editTask", selectedDate, taskId };
  }

  const fixedEventId = queryParamMap.get("editFixedEvent");
  if (fixedEventId !== null && fixedEventId.trim() !== "") {
    return { kind: "editFixedEvent", selectedDate, fixedEventId };
  }

  return null;
}

function routeEditorIntentKey(intent: RouteEditorIntent): string {
  switch (intent.kind) {
    case "create":
      return `${intent.kind}:${intent.selectedDate}:${intent.start}`;
    case "editTask":
      return `${intent.kind}:${intent.selectedDate}:${intent.taskId}`;
    case "editFixedEvent":
      return `${intent.kind}:${intent.selectedDate}:${intent.fixedEventId}`;
  }
}

function isValidClockTime(value: string | null): value is string {
  if (value === null) {
    return false;
  }
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return (
    match !== null &&
    Number(match[1]) >= 0 &&
    Number(match[1]) <= 23 &&
    Number(match[2]) >= 0 &&
    Number(match[2]) <= 59
  );
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

function mutationFocusTarget(
  action: string,
  formKind: "task" | "fixedEvent",
): PendingMutationFocus {
  const itemId = action.slice(action.lastIndexOf(":") + 1);
  const addSelector =
    formKind === "task"
      ? '[data-editor-trigger="task-add"]'
      : '[data-editor-trigger="fixed-event-add"]';
  const editSelector =
    formKind === "task"
      ? `[data-editor-trigger="task-edit"][data-item-id="${cssEscape(itemId)}"]`
      : `[data-editor-trigger="fixed-event-edit"][data-item-id="${cssEscape(itemId)}"]`;

  return {
    loadingSelector: '[data-testid="day-workspace-header"]',
    readySelector: action.includes(":update:") ? editSelector : addSelector,
    fallbackReadySelector: addSelector,
  };
}

function cssEscape(value: string): string {
  const css = globalThis.CSS as
    | { escape?: (input: string) => string }
    | undefined;
  if (css !== undefined && typeof css.escape === "function") {
    return css.escape(value);
  }

  return value.replace(/["\\]/g, "\\$&");
}

function generatePlanErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 422) {
      return "The saved planning inputs could not produce a schedule. Review fixed events and task constraints, then try again.";
    }
    if (error.status === 503) {
      return "The scheduler is unavailable right now. Saved inputs are unchanged; try again when scheduling is available.";
    }
    if (error.status === 401 || error.status === 403) {
      return "Your session cannot generate this schedule. Sign in again before continuing.";
    }
    if (error.status === 404) {
      return "That planning day is no longer available. Refresh the workspace.";
    }
  }

  return "We could not generate the schedule. Saved inputs are unchanged; try again when the API is available.";
}

function progressErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 409) {
      return "That progress would exceed the task estimate. Refresh the workspace if another update was saved.";
    }
    if (error.status === 422) {
      return "The API could not accept that progress. Review the minutes and recorded time.";
    }
    if (error.status === 401 || error.status === 403) {
      return "Your session cannot save progress. Sign in again before continuing.";
    }
    if (error.status === 404) {
      return "That planning day or task is no longer available. Refresh the workspace.";
    }
  }

  return "We could not save progress. Your details are still here; try again when the API is available.";
}

function interruptionErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 422) {
      return "The API could not accept that interruption. Review the start, end, and time zone.";
    }
    if (error.status === 503) {
      return "The scheduler is unavailable right now. Saved progress is unchanged; try again when scheduling is available.";
    }
    if (error.status === 401 || error.status === 403) {
      return "Your session cannot revise this schedule. Sign in again before continuing.";
    }
    if (error.status === 404) {
      return "Generate a schedule for this day before reporting an interruption.";
    }
  }

  return "We could not revise the schedule. Your interruption details are still here; try again when the API is available.";
}

function suggestionMessage(
  result: ParseTaskResponse | ParseInterruptionResponse,
): string {
  if (result.status === "suggested") {
    return "Suggestion ready. Apply it to the form if it helps.";
  }

  return fallbackMessage(result.fallback_reason);
}

function fallbackMessage(reason: ParseTaskResponse["fallback_reason"]): string {
  switch (reason) {
    case "ai_disabled":
      return "Suggestions are off. You can keep entering details yourself.";
    case "timeout":
      return "Suggestions took too long. Your form is unchanged.";
    case "provider_error":
    case "invalid_response":
    case "service_unavailable":
      return "Suggestions are unavailable. Your form is unchanged.";
    case "unable_to_parse":
      return "No clear suggestion yet. You can edit the fields yourself.";
    default:
      return "Suggestions are unavailable. Your form is unchanged.";
  }
}

function explanationMessage(result: ScheduleExplanationResponse): string {
  if (result.status === "explained") {
    return "Optional AI explanation ready.";
  }

  return explanationFallbackMessage(result.fallback_reason);
}

function explanationFallbackMessage(
  reason: ParseTaskResponse["fallback_reason"],
): string {
  switch (reason) {
    case "ai_disabled":
      return "Optional AI explanations are off. The scheduler reason remains available.";
    case "timeout":
      return "Optional AI explanation took too long. The scheduler reason remains available.";
    case "provider_error":
    case "invalid_response":
    case "service_unavailable":
      return "Optional AI explanation is unavailable. The scheduler reason remains available.";
    case "unable_to_parse":
      return "Optional AI explanation is unavailable for this reason. The scheduler reason remains available.";
    default:
      return "Optional AI explanation is unavailable. The scheduler reason remains available.";
  }
}

function explanationFallbackResult(
  decision: ScheduleDecision,
  reason: ParseTaskResponse["fallback_reason"],
  deterministicReason: string,
): ScheduleExplanationResponse {
  return {
    status: "fallback",
    confidence: 0,
    explanation: null,
    deterministic_reason: deterministicReason,
    reason_code: decision.reason_code,
    fallback_reason: reason,
    error_code: reason,
  };
}

function taskFallbackResult(
  reason: ParseTaskResponse["fallback_reason"],
): ParseTaskResponse {
  return {
    status: "fallback",
    confidence: 0,
    proposed_fields: {
      title: null,
      estimated_minutes: null,
      priority: null,
      due_date: null,
      earliest_start_at: null,
      splitting_allowed: null,
      min_segment_minutes: null,
    },
    fallback_reason: reason,
    error_code: reason,
  };
}

function interruptionFallbackResult(
  reason: ParseTaskResponse["fallback_reason"],
): ParseInterruptionResponse {
  return {
    status: "fallback",
    confidence: 0,
    proposed_fields: {
      start_at: null,
      end_at: null,
      time_zone: null,
      reported_at: null,
    },
    fallback_reason: reason,
    error_code: reason,
  };
}

function itemMarker(kind: string): string {
  switch (kind) {
    case "task":
      return "Work";
    case "fixed_event":
      return "Fixed";
    case "interruption":
      return "Unavailable";
    case "buffer":
      return "Buffer";
    case "designated_free_time":
      return "Free";
    default:
      return "Block";
  }
}

function reasonCodeForScheduleKind(kind: string): string {
  switch (kind) {
    case "designated_free_time":
      return "designated_free_time";
    case "interruption":
      return "blocked_by_interruption";
    case "fixed_event":
      return "blocked_by_fixed_event";
    default:
      return "";
  }
}

function fallbackScheduleReason(kind: string): string {
  switch (kind) {
    case "task":
      return "Scheduled from the persisted snapshot.";
    case "fixed_event":
      return "Fixed events reserve this time.";
    case "interruption":
      return "Reported unavailable time reserves this time.";
    case "buffer":
      return "Buffer time was preserved between scheduled blocks.";
    case "designated_free_time":
      return "A remaining useful window was kept as free time.";
    default:
      return "This block comes from the persisted schedule snapshot.";
  }
}

function formatMinutesAsTime(minutes: number): string {
  const normalizedMinutes = Math.max(0, minutes);
  const hours = Math.floor(normalizedMinutes / 60) % 24;
  const remainder = normalizedMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function completedScheduleItemIds(
  snapshot: ScheduleSnapshot,
  progress: readonly TaskProgress[],
  timeZone: string,
): ReadonlySet<string> {
  const completedByTask = new Map<string, number>();
  for (const record of progress) {
    completedByTask.set(
      record.task_id,
      (completedByTask.get(record.task_id) ?? 0) + record.completed_minutes,
    );
  }

  const completedItemIds = new Set<string>();
  const taskItems = snapshot.items
    .filter((item) => item.kind === "task" && item.task_id !== null)
    .map((item, index) => ({
      item,
      index,
      startMinutes: minutesFromIsoInZone(item.start_at, timeZone),
      endMinutes: minutesFromIsoInZone(item.end_at, timeZone),
    }))
    .sort(
      (a, b) =>
        a.startMinutes - b.startMinutes ||
        a.endMinutes - b.endMinutes ||
        a.index - b.index,
    );

  for (const entry of taskItems) {
    const taskId = entry.item.task_id;
    if (taskId === null) {
      continue;
    }
    const remainingCompletedMinutes = completedByTask.get(taskId) ?? 0;
    const itemMinutes = Math.max(
      1,
      (Date.parse(entry.item.end_at) - Date.parse(entry.item.start_at)) /
        60_000,
    );

    if (remainingCompletedMinutes >= itemMinutes) {
      completedItemIds.add(entry.item.id);
      completedByTask.set(taskId, remainingCompletedMinutes - itemMinutes);
    } else {
      completedByTask.set(taskId, 0);
    }
  }

  return completedItemIds;
}

function timelineBounds(
  snapshot: ScheduleSnapshot | null,
  timeZone: string,
): { readonly startMinutes: number; readonly endMinutes: number } {
  const configuredStart = configurationTimeMinutes(
    snapshot?.configuration["day_start"],
  );
  const configuredEnd = configurationTimeMinutes(
    snapshot?.configuration["day_end"],
  );
  const itemStarts =
    snapshot?.items.map((item) =>
      minutesFromIsoInZone(item.start_at, timeZone),
    ) ?? [];
  const itemEnds =
    snapshot?.items.map((item) =>
      minutesFromIsoInZone(item.end_at, timeZone),
    ) ?? [];
  const startMinutes = Math.min(configuredStart ?? 8 * 60, ...itemStarts);
  const endMinutes = Math.max(configuredEnd ?? 18 * 60, ...itemEnds);

  return { startMinutes, endMinutes };
}

function timelineLaneLayout(
  items: readonly ScheduleItem[],
  timeZone: string,
): ReadonlyMap<
  string,
  { readonly laneIndex: number; readonly laneCount: number }
> {
  const sortedItems = items
    .map((item, index) => ({
      item,
      index,
      startMinutes: minutesFromIsoInZone(item.start_at, timeZone),
      endMinutes: minutesFromIsoInZone(item.end_at, timeZone),
    }))
    .sort(
      (a, b) =>
        a.startMinutes - b.startMinutes ||
        a.endMinutes - b.endMinutes ||
        a.index - b.index,
    );
  const layout = new Map<string, { laneIndex: number; laneCount: number }>();
  let active: Array<{
    readonly laneIndex: number;
    readonly endMinutes: number;
  }> = [];
  let groupIds: string[] = [];
  let groupLaneCount = 0;

  const closeGroup = () => {
    if (groupIds.length === 0) {
      return;
    }

    for (const id of groupIds) {
      const existing = layout.get(id);
      if (existing) {
        layout.set(id, {
          laneIndex: existing.laneIndex,
          laneCount: Math.max(1, groupLaneCount),
        });
      }
    }
    groupIds = [];
    groupLaneCount = 0;
  };

  for (const entry of sortedItems) {
    const nextActive = active.filter(
      (candidate) => candidate.endMinutes > entry.startMinutes,
    );
    if (nextActive.length === 0) {
      closeGroup();
    }
    active = nextActive;

    const usedLanes = new Set(active.map((candidate) => candidate.laneIndex));
    let laneIndex = 0;
    while (usedLanes.has(laneIndex)) {
      laneIndex += 1;
    }

    layout.set(entry.item.id, { laneIndex, laneCount: 1 });
    active.push({
      laneIndex,
      endMinutes: Math.max(entry.endMinutes, entry.startMinutes + 1),
    });
    groupIds.push(entry.item.id);
    groupLaneCount = Math.max(groupLaneCount, active.length);
  }

  closeGroup();

  return layout;
}

function configurationTimeMinutes(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (match === null) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesFromIsoInZone(value: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: string) =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? "0");

  return part("hour") * 60 + part("minute");
}

function minutesByKind(snapshot: ScheduleSnapshot, kind: string): number {
  return snapshot.items
    .filter((item) => item.kind === kind)
    .reduce(
      (total, item) =>
        total +
        Math.max(
          0,
          (Date.parse(item.end_at) - Date.parse(item.start_at)) / 60_000,
        ),
      0,
    );
}

function completedTaskMinutes(
  taskId: string,
  progress: readonly TaskProgress[],
): number {
  return progress
    .filter((record) => record.task_id === taskId)
    .reduce((total, record) => total + record.completed_minutes, 0);
}

function remainingTaskMinutes(
  task: Task,
  progress: readonly TaskProgress[],
): number {
  if (task.remaining_minutes !== undefined) {
    return task.remaining_minutes;
  }

  return Math.max(
    0,
    task.estimated_minutes - completedTaskMinutes(task.id, progress),
  );
}

function taskWithAppliedProgress(task: Task, completedMinutes: number): Task {
  if (
    task.completed_minutes === undefined ||
    task.remaining_minutes === undefined
  ) {
    return task;
  }

  const nextCompletedMinutes = task.completed_minutes + completedMinutes;
  return {
    ...task,
    completed_minutes: nextCompletedMinutes,
    remaining_minutes: Math.max(
      0,
      task.estimated_minutes - nextCompletedMinutes,
    ),
  };
}

function totalCompletedMinutes(progress: readonly TaskProgress[]): number {
  return progress.reduce(
    (total, record) => total + record.completed_minutes,
    0,
  );
}

function compareProgress(a: TaskProgress, b: TaskProgress): number {
  return (
    Date.parse(a.recorded_at) - Date.parse(b.recorded_at) ||
    Date.parse(a.created_at) - Date.parse(b.created_at) ||
    a.id.localeCompare(b.id)
  );
}

function isDeferredReasonCode(reasonCode: string): boolean {
  return (
    reasonCode === "blocked_by_fixed_event" ||
    reasonCode === "blocked_by_interruption" ||
    reasonCode === "missed_before_current_time" ||
    reasonCode === "insufficient_time_before_deadline" ||
    reasonCode === "insufficient_remaining_day_time"
  );
}

function isBlockSafeTaskReasonCode(reasonCode: string): boolean {
  return (
    reasonCode === "placed_in_earliest_valid_window" ||
    reasonCode === "split_across_available_windows"
  );
}

function isBlockReasonForTimelineBlock(
  reasonCode: string,
  block: TimelineBlock,
): boolean {
  if (block.completionLabel !== null) {
    return isBlockSafeTaskReasonCode(reasonCode);
  }

  return (
    isBlockSafeTaskReasonCode(reasonCode) ||
    reasonCode === "moved_after_interruption"
  );
}

function snapshotHasRecoveryEvidence(snapshot: ScheduleSnapshot): boolean {
  return (
    snapshot.items.some((item) => item.kind === "interruption") ||
    snapshot.decisions.some((decision) =>
      isRecoveryReasonCode(decision.reason_code),
    )
  );
}

function isRecoveryReasonCode(reasonCode: string): boolean {
  return (
    reasonCode === "blocked_by_interruption" ||
    reasonCode === "moved_after_interruption"
  );
}

function recoveryStatesByTask(
  decisions: readonly ScheduleDecision[],
): ReadonlyMap<string, TimelineRecoveryState> {
  const states = new Map<string, TimelineRecoveryState>();

  for (const decision of decisions) {
    if (decision.task_id === null) {
      continue;
    }

    if (decision.reason_code === "moved_after_interruption") {
      states.set(decision.task_id, "moved");
    } else if (
      decision.reason_code === "split_across_available_windows" &&
      !states.has(decision.task_id)
    ) {
      states.set(decision.task_id, "split");
    }
  }

  return states;
}

function recoveryLabelForState(state: TimelineRecoveryState): string {
  switch (state) {
    case "moved":
      return "Moved";
    case "split":
      return "Split";
  }
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
