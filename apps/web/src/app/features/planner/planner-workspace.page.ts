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

type GeneratePlanState =
  | { readonly status: "idle"; readonly message: string }
  | { readonly status: "pending"; readonly message: string }
  | { readonly status: "success"; readonly message: string }
  | { readonly status: "error"; readonly message: string };

type RecoveryMutationState = GeneratePlanState;

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

interface ScheduleSummary {
  readonly scheduledWorkMinutes: number;
  readonly freeTimeMinutes: number;
  readonly deferredWorkCount: number;
}

const PLANNER_VIEW_OPTIONS: readonly SegmentedControlOption[] = [
  { label: "Day", value: "day", ariaLabel: "Show day planner" },
  { label: "Week", value: "week", ariaLabel: "Show week overview" },
  { label: "Month", value: "month", ariaLabel: "Show month overview" },
  { label: "Free time", value: "free", ariaLabel: "Show free-time finder" },
];
const COMPACT_TIMELINE_BLOCK_MINUTES = 20;

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
          this.generatePlanState.set({ status: "idle", message: "" });
          this.progressState.set({ status: "idle", message: "" });
          this.interruptionState.set({ status: "idle", message: "" });
          this.explanationStates.set({});
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
          if (isBlankProgressForm(this.progressForm())) {
            this.progressForm.set(emptyProgressForm(timeZone));
          }
          if (isBlankInterruptionForm(this.interruptionForm())) {
            this.interruptionForm.set(emptyInterruptionForm(timeZone));
          }
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

  protected openToday(): void {
    const nextDate = todayLocalDate();
    this.selectedDate.set(nextDate);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { date: nextDate },
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

  protected switchPlannerView(view: string): void {
    const date = this.selectedDate();
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
            start_date: date,
            end_date: addDays(date, 6),
            minimum_minutes: 30,
          }
        : { date };

    void this.router.navigate([route], { queryParams });
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

  protected suggestTask(): void {
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
          this.taskSuggestion.set({
            status: result.status === "suggested" ? "ready" : "fallback",
            message: suggestionMessage(result),
            result,
          });
        },
        error: () => {
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

  protected itemClass(kind: string, isCompact: boolean): string {
    const shared = isCompact
      ? "absolute overflow-hidden rounded-sm border border-mist-200 bg-white shadow-sm"
      : "absolute overflow-hidden rounded-md border border-mist-200 bg-white p-3 shadow-sm";

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

  protected timelineBlocks(
    snapshot: ScheduleSnapshot,
    tasks: readonly Task[],
    fixedEvents: readonly FixedEvent[],
    planningDayTimeZone: string | undefined,
  ): readonly TimelineBlock[] {
    const timeZone = planningDayTimeZone ?? "UTC";
    const bounds = timelineBounds(snapshot, timeZone);
    const totalMinutes = Math.max(1, bounds.endMinutes - bounds.startMinutes);

    const laneLayout = timelineLaneLayout(snapshot.items, timeZone);

    return snapshot.items.map((item) => {
      const startMinutes = minutesFromIsoInZone(item.start_at, timeZone);
      const endMinutes = minutesFromIsoInZone(item.end_at, timeZone);
      const topMinutes = Math.max(0, startMinutes - bounds.startMinutes);
      const heightMinutes = Math.max(1, endMinutes - startMinutes);
      const lanes = laneLayout.get(item.id) ?? { laneIndex: 0, laneCount: 1 };
      const widthPercent = 100 / lanes.laneCount;

      return {
        item,
        label: this.itemLabel(item, tasks, fixedEvents),
        kindLabel: this.kindLabel(item.kind),
        marker: itemMarker(item.kind),
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
    snapshot: ScheduleSnapshot,
    planningDayTimeZone: string | undefined,
  ): number {
    const bounds = timelineBounds(snapshot, planningDayTimeZone ?? "UTC");
    return Math.max(26, (bounds.endMinutes - bounds.startMinutes) * 1.2);
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

function timelineBounds(
  snapshot: ScheduleSnapshot,
  timeZone: string,
): { readonly startMinutes: number; readonly endMinutes: number } {
  const configuredStart = configurationTimeMinutes(
    snapshot.configuration["day_start"],
  );
  const configuredEnd = configurationTimeMinutes(
    snapshot.configuration["day_end"],
  );
  const itemStarts = snapshot.items.map((item) =>
    minutesFromIsoInZone(item.start_at, timeZone),
  );
  const itemEnds = snapshot.items.map((item) =>
    minutesFromIsoInZone(item.end_at, timeZone),
  );
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
