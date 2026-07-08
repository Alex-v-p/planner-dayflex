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

export interface PlannerWorkspaceData {
  readonly selectedDate: string;
  readonly planningDays: readonly PlanningDay[];
  readonly day: PlanningDay | null;
  readonly fixedEvents: readonly FixedEvent[];
  readonly tasks: readonly Task[];
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

@Injectable({ providedIn: "root" })
export class PlannerApiService {
  private readonly api = inject(ApiClientService);

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
            snapshot: null,
          });
        }

        return forkJoin({
          fixedEvents: this.api.getJson<FixedEvent[]>(
            `/planning/days/${day.id}/fixed-events`,
          ),
          snapshot: this.loadLatestSnapshot(day),
        }).pipe(
          map(({ fixedEvents, snapshot }) => ({
            selectedDate,
            planningDays,
            day,
            fixedEvents,
            tasks,
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
