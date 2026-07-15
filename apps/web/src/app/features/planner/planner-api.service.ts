import { HttpErrorResponse } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable, catchError, forkJoin, map, of, switchMap } from "rxjs";

import { ApiClientService } from "../../core/api/api-client.service";

export interface PlanningDay {
  readonly id: string;
  readonly local_date: string;
  readonly time_zone: string;
  readonly current_snapshot_id: string | null;
  readonly created_at: string;
}

export interface FixedEvent {
  readonly id: string;
  readonly planning_day_id: string;
  readonly title: string;
  readonly start_at: string;
  readonly end_at: string;
  readonly time_zone: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface Task {
  readonly id: string;
  readonly title: string;
  readonly estimated_minutes: number;
  readonly priority: number;
  readonly due_date: string | null;
  readonly earliest_start_at: string | null;
  readonly splitting_allowed: boolean;
  readonly min_segment_minutes: number | null;
  readonly status: string;
  readonly completed_minutes?: number;
  readonly remaining_minutes?: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ScheduleItem {
  readonly id: string;
  readonly kind: string;
  readonly task_id: string | null;
  readonly fixed_event_id: string | null;
  readonly interruption_id: string | null;
  readonly start_at: string;
  readonly end_at: string;
}

export interface ScheduleDecision {
  readonly id: string;
  readonly task_id: string | null;
  readonly reason_code: string;
  readonly details: Record<string, string>;
}

export interface ScheduleSnapshot {
  readonly id: string;
  readonly planning_day_id: string;
  readonly version: number;
  readonly created_at: string;
  readonly scheduler_version: string;
  readonly configuration: Record<string, unknown>;
  readonly items: readonly ScheduleItem[];
  readonly decisions: readonly ScheduleDecision[];
}

export interface PlanningDaySummary {
  readonly local_date: string;
  readonly planning_day_id: string | null;
  readonly time_zone: string | null;
  readonly status: "empty" | "incomplete" | "planned";
  readonly snapshot_id: string | null;
  readonly snapshot_version: number | null;
  readonly planned_minutes: number;
  readonly fixed_event_count: number;
  readonly interruption_minutes: number;
  readonly unscheduled_deferred_count: number;
  readonly has_useful_free_time: boolean;
}

export interface PlanningRangeSummary {
  readonly start_date: string;
  readonly end_date: string;
  readonly days: readonly PlanningDaySummary[];
}

export interface TaskProgress {
  readonly id: string;
  readonly task_id: string;
  readonly planning_day_id: string;
  readonly completed_minutes: number;
  readonly recorded_at: string;
  readonly created_at: string;
}

export interface PlannerWorkspaceData {
  readonly selectedDate: string;
  readonly planningDays: readonly PlanningDay[];
  readonly day: PlanningDay | null;
  readonly fixedEvents: readonly FixedEvent[];
  readonly tasks: readonly Task[];
  readonly progress: readonly TaskProgress[];
  readonly snapshot: ScheduleSnapshot | null;
}

export interface PlanningDayCreateRequest {
  readonly local_date: string;
  readonly time_zone: string;
}

export interface TaskInputRequest {
  readonly title: string;
  readonly estimated_minutes: number;
  readonly priority: number;
  readonly due_date: string | null;
  readonly earliest_start_at: string | null;
  readonly splitting_allowed: boolean;
  readonly min_segment_minutes: number | null;
}

export interface FixedEventInputRequest {
  readonly title: string;
  readonly start_at: string;
  readonly end_at: string;
  readonly time_zone: string;
}

export interface TaskProgressCreateRequest {
  readonly task_id: string;
  readonly completed_minutes: number;
  readonly recorded_at: string;
}

export interface InterruptionCreateRequest {
  readonly start_at: string;
  readonly end_at: string;
  readonly time_zone: string;
  readonly reported_at: string;
}

export interface ParseInputRequest {
  readonly text: string;
  readonly local_date: string | null;
  readonly time_zone: string | null;
}

export interface TaskProposal {
  readonly title: string | null;
  readonly estimated_minutes: number | null;
  readonly priority: number | null;
  readonly due_date: string | null;
  readonly earliest_start_at: string | null;
  readonly splitting_allowed: boolean | null;
  readonly min_segment_minutes: number | null;
}

export interface InterruptionProposal {
  readonly start_at: string | null;
  readonly end_at: string | null;
  readonly time_zone: string | null;
  readonly reported_at: string | null;
}

export interface ParseTaskResponse {
  readonly status: "suggested" | "fallback";
  readonly confidence: number;
  readonly proposed_fields: TaskProposal;
  readonly fallback_reason:
    | "ai_disabled"
    | "service_unavailable"
    | "timeout"
    | "provider_error"
    | "invalid_response"
    | "unable_to_parse"
    | null;
  readonly error_code: string | null;
}

export interface ParseInterruptionResponse {
  readonly status: "suggested" | "fallback";
  readonly confidence: number;
  readonly proposed_fields: InterruptionProposal;
  readonly fallback_reason: ParseTaskResponse["fallback_reason"];
  readonly error_code: string | null;
}

export interface ScheduleExplanationResponse {
  readonly status: "explained" | "fallback";
  readonly confidence: number;
  readonly explanation: string | null;
  readonly deterministic_reason: string;
  readonly reason_code: string;
  readonly fallback_reason: ParseTaskResponse["fallback_reason"];
  readonly error_code: string | null;
}

@Injectable({ providedIn: "root" })
export class PlannerApiService {
  private readonly api = inject(ApiClientService);

  loadWeekOverview(startDate: string): Observable<PlanningRangeSummary> {
    return this.api.getJson<PlanningRangeSummary>(
      `/planning/overviews/week?start_date=${encodeURIComponent(startDate)}`,
    );
  }

  loadMonthOverview(monthDate: string): Observable<PlanningRangeSummary> {
    return this.api.getJson<PlanningRangeSummary>(
      `/planning/overviews/month?month=${encodeURIComponent(monthDate)}`,
    );
  }

  loadWorkspaceDate(selectedDate: string): Observable<PlannerWorkspaceData> {
    return forkJoin({
      planningDays: this.api.getJson<PlanningDay[]>("/planning/days"),
      tasks: this.api.getJson<Task[]>("/planning/tasks"),
    }).pipe(
      switchMap(({ planningDays, tasks }) => {
        const day =
          planningDays.find(
            (planningDay) => planningDay.local_date === selectedDate,
          ) ?? null;

        if (day === null) {
          return of({
            selectedDate,
            planningDays,
            day,
            fixedEvents: [],
            tasks,
            progress: [],
            snapshot: null,
          });
        }

        return forkJoin({
          fixedEvents: this.api.getJson<FixedEvent[]>(
            `/planning/days/${day.id}/fixed-events`,
          ),
          progress: this.api.getJson<TaskProgress[]>(
            `/planning/days/${day.id}/task-progress`,
          ),
          snapshot: this.loadLatestSnapshot(day),
        }).pipe(
          map(({ fixedEvents, progress, snapshot }) => ({
            selectedDate,
            planningDays,
            day,
            fixedEvents,
            tasks,
            progress,
            snapshot,
          })),
        );
      }),
    );
  }

  private loadLatestSnapshot(
    day: PlanningDay,
  ): Observable<ScheduleSnapshot | null> {
    if (day.current_snapshot_id === null) {
      return of(null);
    }

    return this.api
      .getJson<ScheduleSnapshot>(`/planning/days/${day.id}/schedule`)
      .pipe(
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 404) {
            return of(null);
          }

          throw error;
        }),
      );
  }

  createTask(request: TaskInputRequest): Observable<Task> {
    return this.api.postJson<TaskInputRequest, Task>(
      "/planning/tasks",
      request,
    );
  }

  updateTask(taskId: string, request: TaskInputRequest): Observable<Task> {
    return this.api.putJson<TaskInputRequest, Task>(
      `/planning/tasks/${taskId}`,
      request,
    );
  }

  deleteTask(taskId: string): Observable<void> {
    return this.api.deleteEmpty(`/planning/tasks/${taskId}`);
  }

  saveFixedEventForDate(
    selectedDate: string,
    existingDay: PlanningDay | null,
    request: FixedEventInputRequest,
  ): Observable<FixedEvent> {
    if (existingDay !== null) {
      return this.createFixedEvent(existingDay.id, request);
    }

    return this.createPlanningDay({
      local_date: selectedDate,
      time_zone: request.time_zone,
    }).pipe(switchMap((day) => this.createFixedEvent(day.id, request)));
  }

  updateFixedEvent(
    planningDayId: string,
    fixedEventId: string,
    request: FixedEventInputRequest,
  ): Observable<FixedEvent> {
    return this.api.putJson<FixedEventInputRequest, FixedEvent>(
      `/planning/days/${planningDayId}/fixed-events/${fixedEventId}`,
      request,
    );
  }

  deleteFixedEvent(
    planningDayId: string,
    fixedEventId: string,
  ): Observable<void> {
    return this.api.deleteEmpty(
      `/planning/days/${planningDayId}/fixed-events/${fixedEventId}`,
    );
  }

  generatePlan(planningDayId: string): Observable<ScheduleSnapshot> {
    return this.api.postEmpty<ScheduleSnapshot>(
      `/planning/days/${planningDayId}/generate-plan`,
    );
  }

  recordTaskProgress(
    planningDayId: string,
    request: TaskProgressCreateRequest,
  ): Observable<TaskProgress> {
    return this.api.postJson<TaskProgressCreateRequest, TaskProgress>(
      `/planning/days/${planningDayId}/task-progress`,
      request,
    );
  }

  reportInterruption(
    planningDayId: string,
    request: InterruptionCreateRequest,
  ): Observable<ScheduleSnapshot> {
    return this.api.postJson<InterruptionCreateRequest, ScheduleSnapshot>(
      `/planning/days/${planningDayId}/interruptions`,
      request,
    );
  }

  parseTask(request: ParseInputRequest): Observable<ParseTaskResponse> {
    return this.api.postJson<ParseInputRequest, ParseTaskResponse>(
      "/planning/ai/parse-task",
      request,
    );
  }

  parseInterruption(
    request: ParseInputRequest,
  ): Observable<ParseInterruptionResponse> {
    return this.api.postJson<ParseInputRequest, ParseInterruptionResponse>(
      "/planning/ai/parse-interruption",
      request,
    );
  }

  explainScheduleDecision(
    planningDayId: string,
    decisionId: string,
  ): Observable<ScheduleExplanationResponse> {
    return this.api.postEmpty<ScheduleExplanationResponse>(
      `/planning/days/${planningDayId}/schedule-decisions/${decisionId}/ai-explanation`,
    );
  }

  private createPlanningDay(
    request: PlanningDayCreateRequest,
  ): Observable<PlanningDay> {
    return this.api.postJson<PlanningDayCreateRequest, PlanningDay>(
      "/planning/days",
      request,
    );
  }

  private createFixedEvent(
    planningDayId: string,
    request: FixedEventInputRequest,
  ): Observable<FixedEvent> {
    return this.api.postJson<FixedEventInputRequest, FixedEvent>(
      `/planning/days/${planningDayId}/fixed-events`,
      request,
    );
  }
}
