import { HttpErrorResponse } from "@angular/common/http";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap } from "@angular/router";
import { BehaviorSubject, Observable, Subject, of, throwError } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiClientService } from "../../core/api/api-client.service";
import { AuthUser } from "../../core/auth/auth-contracts";
import { AuthSessionService } from "../../core/auth/auth-session.service";
import {
  FixedEvent,
  PlannerApiService,
  PlannerWorkspaceData,
  ScheduleSnapshot,
  Task,
  TaskProgress,
} from "./planner-api.service";
import { PlannerWorkspacePage } from "./planner-workspace.page";

const sampleUser: AuthUser = {
  id: "user-1",
  username: "daily_user",
  created_at: "2026-07-03T08:00:00Z",
  password_changed_at: null,
};

const selectedDate = "2026-07-04";

const fixedEvent: FixedEvent = {
  id: "event-1",
  planning_day_id: "day-1",
  title: "Team meeting",
  start_at: "2026-07-04T09:00:00+02:00",
  end_at: "2026-07-04T10:00:00+02:00",
  time_zone: "Europe/Brussels",
  created_at: "2026-07-03T08:00:00Z",
  updated_at: "2026-07-03T08:00:00Z",
};

const task: Task = {
  id: "task-1",
  title: "Write report",
  estimated_minutes: 90,
  priority: 5,
  due_date: null,
  earliest_start_at: null,
  splitting_allowed: false,
  min_segment_minutes: null,
  status: "active",
  created_at: "2026-07-03T08:00:00Z",
  updated_at: "2026-07-03T08:00:00Z",
};

const progressRecord: TaskProgress = {
  id: "progress-1",
  task_id: "task-1",
  planning_day_id: "day-1",
  completed_minutes: 45,
  recorded_at: "2026-07-04T10:45:00+02:00",
  created_at: "2026-07-04T08:45:00Z",
};

const snapshot: ScheduleSnapshot = {
  id: "snapshot-1",
  planning_day_id: "day-1",
  version: 2,
  created_at: "2026-07-04T08:05:00Z",
  scheduler_version: "0.1.0",
  configuration: { day_start: "08:00:00", day_end: "18:00:00" },
  items: [
    {
      id: "item-1",
      kind: "task",
      task_id: "task-1",
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-07-04T10:00:00+02:00",
      end_at: "2026-07-04T11:30:00+02:00",
    },
    {
      id: "item-2",
      kind: "designated_free_time",
      task_id: null,
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-07-04T16:00:00+02:00",
      end_at: "2026-07-04T18:00:00+02:00",
    },
  ],
  decisions: [],
};

const canonicalSnapshot: ScheduleSnapshot = {
  ...snapshot,
  items: [
    {
      id: "fixed-item",
      kind: "fixed_event",
      task_id: null,
      fixed_event_id: "event-1",
      interruption_id: null,
      start_at: "2026-07-04T09:00:00+02:00",
      end_at: "2026-07-04T10:00:00+02:00",
    },
    {
      id: "task-item",
      kind: "task",
      task_id: "task-1",
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-07-04T10:00:00+02:00",
      end_at: "2026-07-04T11:30:00+02:00",
    },
    {
      id: "buffer-item",
      kind: "buffer",
      task_id: null,
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-07-04T11:30:00+02:00",
      end_at: "2026-07-04T11:40:00+02:00",
    },
    {
      id: "interruption-item",
      kind: "interruption",
      task_id: null,
      fixed_event_id: null,
      interruption_id: "interruption-1",
      start_at: "2026-07-04T14:00:00+02:00",
      end_at: "2026-07-04T14:30:00+02:00",
    },
    {
      id: "free-item",
      kind: "designated_free_time",
      task_id: null,
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-07-04T16:00:00+02:00",
      end_at: "2026-07-04T18:00:00+02:00",
    },
  ],
  decisions: [
    {
      id: "decision-1",
      task_id: "task-1",
      reason_code: "placed_in_earliest_valid_window",
      details: {},
    },
    {
      id: "decision-2",
      task_id: null,
      reason_code: "designated_free_time",
      details: {},
    },
  ],
};

const overlappingLockedSnapshot: ScheduleSnapshot = {
  ...snapshot,
  items: [
    {
      id: "fixed-overlap-item",
      kind: "fixed_event",
      task_id: null,
      fixed_event_id: "event-1",
      interruption_id: null,
      start_at: "2026-07-04T09:00:00+02:00",
      end_at: "2026-07-04T10:00:00+02:00",
    },
    {
      id: "interruption-overlap-item",
      kind: "interruption",
      task_id: null,
      fixed_event_id: null,
      interruption_id: "interruption-1",
      start_at: "2026-07-04T09:30:00+02:00",
      end_at: "2026-07-04T10:30:00+02:00",
    },
    {
      id: "task-after-overlap-item",
      kind: "task",
      task_id: "task-1",
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-07-04T10:30:00+02:00",
      end_at: "2026-07-04T11:30:00+02:00",
    },
  ],
  decisions: [
    {
      id: "decision-locked-overlap",
      task_id: null,
      reason_code: "locked_time_overlap_merged",
      details: {},
    },
  ],
};

const shortStatusSnapshot: ScheduleSnapshot = {
  ...snapshot,
  configuration: { day_start: "09:00:00", day_end: "10:00:00" },
  items: [
    {
      id: "short-fixed-item",
      kind: "fixed_event",
      task_id: null,
      fixed_event_id: "event-1",
      interruption_id: null,
      start_at: "2026-07-04T09:00:00+02:00",
      end_at: "2026-07-04T09:10:00+02:00",
    },
    {
      id: "short-task-item",
      kind: "task",
      task_id: "task-1",
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-07-04T09:10:00+02:00",
      end_at: "2026-07-04T09:20:00+02:00",
    },
    {
      id: "short-buffer-item",
      kind: "buffer",
      task_id: null,
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-07-04T09:20:00+02:00",
      end_at: "2026-07-04T09:30:00+02:00",
    },
    {
      id: "short-interruption-item",
      kind: "interruption",
      task_id: null,
      fixed_event_id: null,
      interruption_id: "interruption-1",
      start_at: "2026-07-04T09:30:00+02:00",
      end_at: "2026-07-04T09:40:00+02:00",
    },
    {
      id: "short-free-item",
      kind: "designated_free_time",
      task_id: null,
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-07-04T09:40:00+02:00",
      end_at: "2026-07-04T09:50:00+02:00",
    },
  ],
  decisions: [],
};

const noFitSnapshot: ScheduleSnapshot = {
  ...canonicalSnapshot,
  id: "snapshot-no-fit",
  version: 3,
  decisions: [
    ...canonicalSnapshot.decisions,
    {
      id: "decision-no-fit",
      task_id: "task-2",
      reason_code: "insufficient_remaining_day_time",
      details: {},
    },
    {
      id: "decision-unknown",
      task_id: null,
      reason_code: "out_of_contract_reason",
      details: {},
    },
  ],
};

const taskThatDoesNotFit: Task = {
  ...task,
  id: "task-2",
  title: "Prepare workshop",
  estimated_minutes: 240,
  priority: 4,
};

const studyTask: Task = {
  ...task,
  id: "task-study",
  title: "Study notes",
  estimated_minutes: 90,
  priority: 3,
  splitting_allowed: true,
  min_segment_minutes: 15,
};

const revisedStudySnapshot: ScheduleSnapshot = {
  ...canonicalSnapshot,
  id: "snapshot-revised",
  version: 3,
  items: [
    {
      id: "study-before-interruption",
      kind: "task",
      task_id: "task-study",
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-07-04T13:00:00+02:00",
      end_at: "2026-07-04T14:00:00+02:00",
    },
    {
      id: "reported-interruption",
      kind: "interruption",
      task_id: null,
      fixed_event_id: null,
      interruption_id: "interruption-2",
      start_at: "2026-07-04T14:00:00+02:00",
      end_at: "2026-07-04T15:15:00+02:00",
    },
    {
      id: "study-after-interruption",
      kind: "task",
      task_id: "task-study",
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-07-04T16:00:00+02:00",
      end_at: "2026-07-04T16:30:00+02:00",
    },
  ],
  decisions: [
    {
      id: "decision-moved-study",
      task_id: "task-study",
      reason_code: "moved_after_interruption",
      details: {},
    },
    {
      id: "decision-free-revised",
      task_id: null,
      reason_code: "designated_free_time",
      details: {},
    },
  ],
};

const canonicalDate = "2026-06-22";

const canonicalFixedEvents: readonly FixedEvent[] = [
  {
    ...fixedEvent,
    id: "canonical-team-meeting",
    title: "Team meeting",
    start_at: "2026-06-22T09:00:00+02:00",
    end_at: "2026-06-22T10:00:00+02:00",
  },
  {
    ...fixedEvent,
    id: "canonical-lunch",
    title: "Lunch appointment",
    start_at: "2026-06-22T12:00:00+02:00",
    end_at: "2026-06-22T13:00:00+02:00",
  },
  {
    ...fixedEvent,
    id: "canonical-collection",
    title: "Collection appointment",
    start_at: "2026-06-22T15:30:00+02:00",
    end_at: "2026-06-22T16:00:00+02:00",
  },
];

const canonicalTasks: readonly Task[] = [
  {
    ...task,
    id: "canonical-inbox",
    title: "Reply to inbox",
    estimated_minutes: 45,
    priority: 4,
  },
  {
    ...task,
    id: "canonical-report",
    title: "Write report",
    estimated_minutes: 90,
    priority: 5,
  },
  {
    ...task,
    id: "canonical-study",
    title: "Study notes",
    estimated_minutes: 90,
    priority: 3,
    splitting_allowed: true,
    min_segment_minutes: 15,
  },
  {
    ...task,
    id: "canonical-groceries",
    title: "Buy groceries",
    estimated_minutes: 30,
    priority: 2,
    due_date: canonicalDate,
  },
];

const canonicalInitialSnapshot: ScheduleSnapshot = {
  ...snapshot,
  id: "canonical-initial-snapshot",
  version: 1,
  created_at: "2026-06-22T06:05:00Z",
  items: [
    {
      id: "canonical-inbox-item",
      kind: "task",
      task_id: "canonical-inbox",
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-06-22T08:00:00+02:00",
      end_at: "2026-06-22T08:45:00+02:00",
    },
    {
      id: "canonical-buffer-1",
      kind: "buffer",
      task_id: null,
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-06-22T08:45:00+02:00",
      end_at: "2026-06-22T08:55:00+02:00",
    },
    {
      id: "canonical-team-meeting-item",
      kind: "fixed_event",
      task_id: null,
      fixed_event_id: "canonical-team-meeting",
      interruption_id: null,
      start_at: "2026-06-22T09:00:00+02:00",
      end_at: "2026-06-22T10:00:00+02:00",
    },
    {
      id: "canonical-report-item",
      kind: "task",
      task_id: "canonical-report",
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-06-22T10:00:00+02:00",
      end_at: "2026-06-22T11:30:00+02:00",
    },
    {
      id: "canonical-buffer-2",
      kind: "buffer",
      task_id: null,
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-06-22T11:30:00+02:00",
      end_at: "2026-06-22T11:40:00+02:00",
    },
    {
      id: "canonical-lunch-item",
      kind: "fixed_event",
      task_id: null,
      fixed_event_id: "canonical-lunch",
      interruption_id: null,
      start_at: "2026-06-22T12:00:00+02:00",
      end_at: "2026-06-22T13:00:00+02:00",
    },
    {
      id: "canonical-study-item",
      kind: "task",
      task_id: "canonical-study",
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-06-22T13:00:00+02:00",
      end_at: "2026-06-22T14:30:00+02:00",
    },
    {
      id: "canonical-buffer-3",
      kind: "buffer",
      task_id: null,
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-06-22T14:30:00+02:00",
      end_at: "2026-06-22T14:40:00+02:00",
    },
    {
      id: "canonical-groceries-item",
      kind: "task",
      task_id: "canonical-groceries",
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-06-22T14:40:00+02:00",
      end_at: "2026-06-22T15:10:00+02:00",
    },
    {
      id: "canonical-buffer-4",
      kind: "buffer",
      task_id: null,
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-06-22T15:10:00+02:00",
      end_at: "2026-06-22T15:20:00+02:00",
    },
    {
      id: "canonical-collection-item",
      kind: "fixed_event",
      task_id: null,
      fixed_event_id: "canonical-collection",
      interruption_id: null,
      start_at: "2026-06-22T15:30:00+02:00",
      end_at: "2026-06-22T16:00:00+02:00",
    },
    {
      id: "canonical-free-item",
      kind: "designated_free_time",
      task_id: null,
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-06-22T16:00:00+02:00",
      end_at: "2026-06-22T18:00:00+02:00",
    },
  ],
  decisions: [
    {
      id: "canonical-inbox-decision",
      task_id: "canonical-inbox",
      reason_code: "placed_in_earliest_valid_window",
      details: {},
    },
    {
      id: "canonical-report-decision",
      task_id: "canonical-report",
      reason_code: "placed_in_earliest_valid_window",
      details: {},
    },
    {
      id: "canonical-study-decision",
      task_id: "canonical-study",
      reason_code: "placed_in_earliest_valid_window",
      details: {},
    },
    {
      id: "canonical-groceries-decision",
      task_id: "canonical-groceries",
      reason_code: "placed_in_earliest_valid_window",
      details: {},
    },
    {
      id: "canonical-free-decision",
      task_id: null,
      reason_code: "designated_free_time",
      details: {},
    },
  ],
};

const canonicalRevisedSnapshot: ScheduleSnapshot = {
  ...canonicalInitialSnapshot,
  id: "canonical-revised-snapshot",
  version: 2,
  items: [
    {
      id: "canonical-study-completed-item",
      kind: "task",
      task_id: "canonical-study",
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-06-22T13:00:00+02:00",
      end_at: "2026-06-22T14:00:00+02:00",
    },
    {
      id: "canonical-interruption-item",
      kind: "interruption",
      task_id: null,
      fixed_event_id: null,
      interruption_id: "canonical-interruption",
      start_at: "2026-06-22T14:00:00+02:00",
      end_at: "2026-06-22T15:15:00+02:00",
    },
    {
      id: "canonical-revised-collection-item",
      kind: "fixed_event",
      task_id: null,
      fixed_event_id: "canonical-collection",
      interruption_id: null,
      start_at: "2026-06-22T15:30:00+02:00",
      end_at: "2026-06-22T16:00:00+02:00",
    },
    {
      id: "canonical-study-moved-item",
      kind: "task",
      task_id: "canonical-study",
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-06-22T16:00:00+02:00",
      end_at: "2026-06-22T16:30:00+02:00",
    },
    {
      id: "canonical-revised-buffer-1",
      kind: "buffer",
      task_id: null,
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-06-22T16:30:00+02:00",
      end_at: "2026-06-22T16:40:00+02:00",
    },
    {
      id: "canonical-groceries-moved-item",
      kind: "task",
      task_id: "canonical-groceries",
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-06-22T16:40:00+02:00",
      end_at: "2026-06-22T17:10:00+02:00",
    },
    {
      id: "canonical-revised-buffer-2",
      kind: "buffer",
      task_id: null,
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-06-22T17:10:00+02:00",
      end_at: "2026-06-22T17:20:00+02:00",
    },
    {
      id: "canonical-revised-free-item",
      kind: "designated_free_time",
      task_id: null,
      fixed_event_id: null,
      interruption_id: null,
      start_at: "2026-06-22T17:20:00+02:00",
      end_at: "2026-06-22T18:00:00+02:00",
    },
  ],
  decisions: [
    {
      id: "canonical-study-moved-decision",
      task_id: "canonical-study",
      reason_code: "moved_after_interruption",
      details: {},
    },
    {
      id: "canonical-groceries-moved-decision",
      task_id: "canonical-groceries",
      reason_code: "moved_after_interruption",
      details: {},
    },
    {
      id: "canonical-revised-free-decision",
      task_id: null,
      reason_code: "designated_free_time",
      details: {},
    },
  ],
};

const canonicalStudyProgress: TaskProgress = {
  ...progressRecord,
  id: "canonical-study-progress",
  task_id: "canonical-study",
  completed_minutes: 60,
  recorded_at: "2026-06-22T14:00:00+02:00",
  created_at: "2026-06-22T12:00:00Z",
};

describe("planner workspace API contract", () => {
  it("loads the selected day through authenticated user-scoped planning endpoints", async () => {
    const api = new FakeApiClient();
    api.responses.set("/planning/days", [
      {
        id: "day-1",
        local_date: selectedDate,
        time_zone: "Europe/Brussels",
        current_snapshot_id: "snapshot-1",
        created_at: "2026-07-03T08:00:00Z",
      },
    ]);
    api.responses.set("/planning/tasks", [task]);
    api.responses.set("/planning/days/day-1/fixed-events", [fixedEvent]);
    api.responses.set("/planning/days/day-1/task-progress", [progressRecord]);
    api.responses.set("/planning/days/day-1/schedule", snapshot);
    await TestBed.configureTestingModule({
      providers: [
        PlannerApiService,
        { provide: ApiClientService, useValue: api },
      ],
    }).compileComponents();

    const data = await firstValue(
      TestBed.inject(PlannerApiService).loadWorkspaceDate(selectedDate),
    );

    expect(data.day?.id).toBe("day-1");
    expect(data.fixedEvents).toEqual([fixedEvent]);
    expect(data.tasks).toEqual([task]);
    expect(data.progress).toEqual([progressRecord]);
    expect(data.snapshot?.id).toBe("snapshot-1");
    expect(api.gets).toEqual([
      "/planning/days",
      "/planning/tasks",
      "/planning/days/day-1/fixed-events",
      "/planning/days/day-1/task-progress",
      "/planning/days/day-1/schedule",
    ]);
    expect(api.gets.join("\n")).not.toContain("user-1");
  });

  it("keeps an empty selected date understandable when no planning day exists", async () => {
    const api = new FakeApiClient();
    api.responses.set("/planning/days", []);
    api.responses.set("/planning/tasks", []);
    await TestBed.configureTestingModule({
      providers: [
        PlannerApiService,
        { provide: ApiClientService, useValue: api },
      ],
    }).compileComponents();

    const data = await firstValue(
      TestBed.inject(PlannerApiService).loadWorkspaceDate(selectedDate),
    );

    expect(data).toEqual({
      selectedDate,
      planningDays: [],
      day: null,
      fixedEvents: [],
      tasks: [],
      progress: [],
      snapshot: null,
    });
    expect(api.gets).toEqual(["/planning/days", "/planning/tasks"]);
  });

  it("creates a planning day before saving a fixed event on an empty selected date", async () => {
    const api = new FakeApiClient();
    const createdDay = {
      id: "day-new",
      local_date: selectedDate,
      time_zone: "Europe/Brussels",
      current_snapshot_id: null,
      created_at: "2026-07-03T08:00:00Z",
    };
    api.responses.set("/planning/days", createdDay);
    api.responses.set("/planning/days/day-new/fixed-events", fixedEvent);
    await TestBed.configureTestingModule({
      providers: [
        PlannerApiService,
        { provide: ApiClientService, useValue: api },
      ],
    }).compileComponents();

    const event = await firstValue(
      TestBed.inject(PlannerApiService).saveFixedEventForDate(
        selectedDate,
        null,
        {
          title: "Team meeting",
          start_at: "2026-07-04T09:00:00+02:00",
          end_at: "2026-07-04T10:00:00+02:00",
          time_zone: "Europe/Brussels",
        },
      ),
    );

    expect(event).toEqual(fixedEvent);
    expect(api.posts).toEqual([
      {
        path: "/planning/days",
        body: { local_date: selectedDate, time_zone: "Europe/Brussels" },
      },
      {
        path: "/planning/days/day-new/fixed-events",
        body: {
          title: "Team meeting",
          start_at: "2026-07-04T09:00:00+02:00",
          end_at: "2026-07-04T10:00:00+02:00",
          time_zone: "Europe/Brussels",
        },
      },
    ]);
    expect(JSON.stringify(api.posts)).not.toContain("user-1");
  });

  it("uses authenticated owner-scoped mutation endpoint shapes", async () => {
    const api = new FakeApiClient();
    api.responses.set("/planning/tasks/task-1", task);
    api.responses.set("/planning/days/day-1/fixed-events/event-1", fixedEvent);
    api.responses.set("DELETE /planning/tasks/task-1", undefined);
    api.responses.set(
      "DELETE /planning/days/day-1/fixed-events/event-1",
      undefined,
    );
    await TestBed.configureTestingModule({
      providers: [
        PlannerApiService,
        { provide: ApiClientService, useValue: api },
      ],
    }).compileComponents();
    const service = TestBed.inject(PlannerApiService);

    await firstValue(
      service.updateTask("task-1", {
        title: "Write report",
        estimated_minutes: 90,
        priority: 5,
        due_date: null,
        earliest_start_at: null,
        splitting_allowed: false,
        min_segment_minutes: null,
      }),
    );
    await firstValue(
      service.updateFixedEvent("day-1", "event-1", {
        title: "Team meeting",
        start_at: "2026-07-04T09:00:00+02:00",
        end_at: "2026-07-04T10:00:00+02:00",
        time_zone: "Europe/Brussels",
      }),
    );
    await firstValue(service.deleteTask("task-1"));
    await firstValue(service.deleteFixedEvent("day-1", "event-1"));

    expect(api.puts.map((call) => call.path)).toEqual([
      "/planning/tasks/task-1",
      "/planning/days/day-1/fixed-events/event-1",
    ]);
    expect(api.deletes).toEqual([
      "/planning/tasks/task-1",
      "/planning/days/day-1/fixed-events/event-1",
    ]);
    expect(
      JSON.stringify({ puts: api.puts, deletes: api.deletes }),
    ).not.toContain("user-1");
  });

  it("generates a persisted schedule snapshot through the planning day endpoint", async () => {
    const api = new FakeApiClient();
    api.responses.set("/planning/days/day-1/generate-plan", snapshot);
    await TestBed.configureTestingModule({
      providers: [
        PlannerApiService,
        { provide: ApiClientService, useValue: api },
      ],
    }).compileComponents();

    const generated = await firstValue(
      TestBed.inject(PlannerApiService).generatePlan("day-1"),
    );

    expect(generated).toEqual(snapshot);
    expect(api.posts).toEqual([
      { path: "/planning/days/day-1/generate-plan", body: null },
    ]);
    expect(JSON.stringify(api.posts)).not.toContain("user-1");
  });

  it("records task progress and reports interruptions through day-scoped endpoints", async () => {
    const api = new FakeApiClient();
    api.responses.set("/planning/days/day-1/task-progress", progressRecord);
    api.responses.set("/planning/days/day-1/interruptions", canonicalSnapshot);
    await TestBed.configureTestingModule({
      providers: [
        PlannerApiService,
        { provide: ApiClientService, useValue: api },
      ],
    }).compileComponents();
    const service = TestBed.inject(PlannerApiService);

    const progress = await firstValue(
      service.recordTaskProgress("day-1", {
        task_id: "task-1",
        completed_minutes: 45,
        recorded_at: "2026-07-04T10:45:00+02:00",
      }),
    );
    const revised = await firstValue(
      service.reportInterruption("day-1", {
        start_at: "2026-07-04T14:00:00+02:00",
        end_at: "2026-07-04T15:15:00+02:00",
        time_zone: "Europe/Brussels",
        reported_at: "2026-07-04T14:00:00+02:00",
      }),
    );

    expect(progress).toEqual(progressRecord);
    expect(revised).toEqual(canonicalSnapshot);
    expect(api.posts).toEqual([
      {
        path: "/planning/days/day-1/task-progress",
        body: {
          task_id: "task-1",
          completed_minutes: 45,
          recorded_at: "2026-07-04T10:45:00+02:00",
        },
      },
      {
        path: "/planning/days/day-1/interruptions",
        body: {
          start_at: "2026-07-04T14:00:00+02:00",
          end_at: "2026-07-04T15:15:00+02:00",
          time_zone: "Europe/Brussels",
          reported_at: "2026-07-04T14:00:00+02:00",
        },
      },
    ]);
    expect(JSON.stringify(api.posts)).not.toContain("user-1");
  });

  it("requests AI parsing only through planning API endpoints", async () => {
    const api = new FakeApiClient();
    api.responses.set("/planning/ai/parse-task", {
      status: "suggested",
      confidence: 0.8,
      proposed_fields: {
        title: "Write report",
        estimated_minutes: 45,
        priority: 4,
        due_date: null,
        earliest_start_at: null,
        splitting_allowed: null,
        min_segment_minutes: null,
      },
      fallback_reason: null,
      error_code: null,
    });
    api.responses.set("/planning/ai/parse-interruption", {
      status: "fallback",
      confidence: 0,
      proposed_fields: {
        start_at: null,
        end_at: null,
        time_zone: null,
        reported_at: null,
      },
      fallback_reason: "ai_disabled",
      error_code: "ai_disabled",
    });
    await TestBed.configureTestingModule({
      providers: [
        PlannerApiService,
        { provide: ApiClientService, useValue: api },
      ],
    }).compileComponents();
    const service = TestBed.inject(PlannerApiService);

    await firstValue(
      service.parseTask({
        text: "Write report for 45 minutes",
        local_date: selectedDate,
        time_zone: "Europe/Brussels",
      }),
    );
    await firstValue(
      service.parseInterruption({
        text: "from 10 to 11",
        local_date: selectedDate,
        time_zone: "Europe/Brussels",
      }),
    );

    expect(api.posts.map((call) => call.path)).toEqual([
      "/planning/ai/parse-task",
      "/planning/ai/parse-interruption",
    ]);
    expect(JSON.stringify(api.posts)).not.toContain("openai");
  });

  it("requests schedule explanations only through planning API endpoints", async () => {
    const api = new FakeApiClient();
    api.responses.set(
      "/planning/days/day-1/schedule-decisions/decision-1/ai-explanation",
      {
        status: "explained",
        confidence: 0.7,
        explanation:
          "Write report moved because the interruption changed the available windows.",
        deterministic_reason:
          "Write report was moved after reported unavailable time.",
        reason_code: "moved_after_interruption",
        fallback_reason: null,
        error_code: null,
      },
    );
    await TestBed.configureTestingModule({
      providers: [
        PlannerApiService,
        { provide: ApiClientService, useValue: api },
      ],
    }).compileComponents();

    const result = await firstValue(
      TestBed.inject(PlannerApiService).explainScheduleDecision(
        "day-1",
        "decision-1",
      ),
    );

    expect(result.status).toBe("explained");
    expect(api.posts).toEqual([
      {
        path: "/planning/days/day-1/schedule-decisions/decision-1/ai-explanation",
        body: null,
      },
    ]);
    expect(JSON.stringify(api.posts)).not.toContain("ai.test");
  });
});

describe("rendered planner workspace", () => {
  let routeParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let plannerApi: FakePlannerApi;
  let router: FakeRouter;

  beforeEach(() => {
    routeParams = new BehaviorSubject(
      convertToParamMap({ date: selectedDate }),
    );
    plannerApi = new FakePlannerApi();
    router = new FakeRouter();
  });

  it("loads the canonical initial day and renders the proportional accessible timeline", async () => {
    plannerApi.result = workspaceData({ snapshot: canonicalSnapshot });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    expect(plannerApi.loadedDates).toEqual([selectedDate]);
    expect(text(fixture)).toContain("Day planner");
    expect(text(fixture)).toContain("Day timeline");
    expect(text(fixture)).toContain("Day bounds 08:00-18:00");
    expect(text(fixture)).toContain("Write report");
    expect(text(fixture)).toContain("Team meeting");
    expect(text(fixture)).toContain("Buffer");
    expect(text(fixture)).toContain("Unavailable");
    expect(text(fixture)).toContain("Work");
    expect(text(fixture)).toContain("Fixed");
    expect(text(fixture)).toContain("Free");
    expect(text(fixture)).toContain("Designated Free Time");
    expect(text(fixture)).toContain("Planning inputs");
    expect(text(fixture)).toContain("Snapshot");
    expect(text(fixture)).toContain("v2");
    expect(text(fixture)).toContain("Scheduled work");
    expect(text(fixture)).toContain("1 hr 30 min");
    expect(text(fixture)).toContain("Free time");
    expect(text(fixture)).toContain("2 hr");
    expect(text(fixture)).toContain("Generate schedule");
    expect(dayHeaderText(fixture)).toContain("Generate plan");
    expect(dayHeaderSummaryText(fixture)).toContain("Snapshot");
    expect(dayHeaderSummaryText(fixture)).toContain("Revised plan v2");
    expect(dayHeaderSummaryText(fixture)).toContain("v2");
    expect(dayHeaderSummaryText(fixture)).toContain("Scheduled work");
    expect(dayHeaderSummaryText(fixture)).toContain("1 hr 30 min");
    expect(dayHeaderSummaryText(fixture)).toContain("Free time");
    expect(dayHeaderSummaryText(fixture)).toContain("2 hr");
    expect(dayHeaderSummaryText(fixture)).toContain("Deferred work");
    expect(dayHeaderSummaryText(fixture)).toContain("0");
    expect(dayHeaderSummaryText(fixture)).toContain("Completed work");
    expect(dayHeaderSummaryText(fixture)).toContain("0 min");
    expect(
      buttonsByText(
        query(fixture, "[aria-labelledby='timeline-title']"),
        "Generate plan",
      ),
    ).toEqual([]);
    expect(text(fixture)).toContain(
      "Write report was placed in the earliest valid window.",
    );
    expect(text(fixture)).toContain("placed_in_earliest_valid_window");
    expect(text(fixture)).toContain(
      "A remaining useful window was kept as free time.",
    );
    expect(timeRulerText(fixture)).toContain("08:00");
    expect(timeRulerText(fixture)).toContain("09:00");
    expect(timeRulerText(fixture)).toContain("18:00");
    expect(timelineBlocks(fixture).map((block) => block.kind)).toEqual([
      "fixed_event",
      "task",
      "buffer",
      "interruption",
      "designated_free_time",
    ]);
    expect(announcement(fixture)).toContain("Planner workspace loaded");
  });

  it("labels later generated snapshots without recovery evidence as generated plans", async () => {
    plannerApi.result = workspaceData({ snapshot });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    expect(dayHeaderSummaryText(fixture)).toContain("Generated plan v2");
    expect(dayHeaderSummaryText(fixture)).not.toContain("Revised plan");
    expect(
      query(fixture, "[aria-labelledby='timeline-title']")?.textContent,
    ).toContain("Generated plan v2 - 2 blocks");
  });

  it("renders the documented canonical initial day with accurate times and summary values", async () => {
    routeParams = new BehaviorSubject(
      convertToParamMap({ date: canonicalDate }),
    );
    plannerApi.result = workspaceData({
      selectedDate: canonicalDate,
      fixedEvents: canonicalFixedEvents,
      tasks: canonicalTasks,
      snapshot: canonicalInitialSnapshot,
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const blocks = timelineBlocks(fixture);

    expect(plannerApi.loadedDates).toEqual([canonicalDate]);
    expect(dayHeaderText(fixture)).toContain("June 22, 2026");
    expect(
      query(fixture, "[aria-labelledby='timeline-title']")?.textContent,
    ).toContain("Day bounds 08:00-18:00");
    expect(dayHeaderSummaryText(fixture)).toContain("Snapshot");
    expect(dayHeaderSummaryText(fixture)).toContain("Initial plan v1");
    expect(dayHeaderSummaryText(fixture)).toContain("Scheduled work");
    expect(dayHeaderSummaryText(fixture)).toContain("4 hr 15 min");
    expect(dayHeaderSummaryText(fixture)).toContain("Free time");
    expect(dayHeaderSummaryText(fixture)).toContain("2 hr");
    expect(dayHeaderSummaryText(fixture)).toContain("Deferred work");
    expect(dayHeaderSummaryText(fixture)).toContain("0");
    expect(timeRulerText(fixture)).toContain("08:00");
    expect(timeRulerText(fixture)).toContain("18:00");
    expect(
      blocks.map((block) => [block.kind, block.top, block.height]),
    ).toEqual([
      ["task", 0, 45],
      ["buffer", 45, 10],
      ["fixed_event", 60, 60],
      ["task", 120, 90],
      ["buffer", 210, 10],
      ["fixed_event", 240, 60],
      ["task", 300, 90],
      ["buffer", 390, 10],
      ["task", 400, 30],
      ["buffer", 430, 10],
      ["fixed_event", 450, 30],
      ["designated_free_time", 480, 120],
    ]);
    expect(blocks.every((block) => block.laneCount === 1)).toBe(true);
    expect(text(fixture)).toContain("Designated Free Time");
    expect(text(fixture)).toContain(
      "A remaining useful window was kept as free time.",
    );

    scheduleBlockById(fixture, "canonical-free-item").dispatchEvent(
      new FocusEvent("focus", { bubbles: true }),
    );
    fixture.detectChanges();

    expect(selectedBlockDetailText(fixture)).toContain("Designated Free Time");
    expect(selectedBlockDetailText(fixture)).toContain("2 hr");
    expect(selectedBlockDetailText(fixture)).toContain(
      expectedTimeRange(
        "2026-06-22T16:00:00+02:00",
        "2026-06-22T18:00:00+02:00",
        "Europe/Brussels",
      ),
    );
    expect(selectedBlockDetailText(fixture)).toContain(
      "A remaining useful window was kept as free time.",
    );
  });

  it("renders the documented canonical revised day with moved, completed, and free-time states", async () => {
    routeParams = new BehaviorSubject(
      convertToParamMap({ date: canonicalDate }),
    );
    plannerApi.result = workspaceData({
      selectedDate: canonicalDate,
      fixedEvents: canonicalFixedEvents,
      tasks: canonicalTasks.map((candidate) =>
        candidate.id === "canonical-study"
          ? {
              ...candidate,
              completed_minutes: 60,
              remaining_minutes: 30,
            }
          : candidate,
      ),
      progress: [canonicalStudyProgress],
      snapshot: canonicalRevisedSnapshot,
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const blocks = timelineBlocks(fixture);

    expect(dayHeaderText(fixture)).toContain("June 22, 2026");
    expect(dayHeaderText(fixture)).toContain("Revised plan v2");
    expect(dayHeaderSummaryText(fixture)).toContain("Scheduled work");
    expect(dayHeaderSummaryText(fixture)).toContain("2 hr");
    expect(dayHeaderSummaryText(fixture)).toContain("Free time");
    expect(dayHeaderSummaryText(fixture)).toContain("40 min");
    expect(dayHeaderSummaryText(fixture)).toContain("Completed work");
    expect(dayHeaderSummaryText(fixture)).toContain("1 hr");
    expect(
      blocks.map((block) => [block.kind, block.top, block.height]),
    ).toEqual([
      ["task", 300, 60],
      ["interruption", 360, 75],
      ["fixed_event", 450, 30],
      ["task", 480, 30],
      ["buffer", 510, 10],
      ["task", 520, 30],
      ["buffer", 550, 10],
      ["designated_free_time", 560, 40],
    ]);
    expect(text(fixture)).toContain("Moved work");
    expect(text(fixture)).toContain(
      "Study notes was moved after reported unavailable time.",
    );
    expect(text(fixture)).toContain(
      "Buy groceries was moved after reported unavailable time.",
    );
    expect(text(fixture)).toContain("Completed history");
    expect(text(fixture)).toContain("Study notes - 1 hr recorded at");
    expect(
      scheduleBlockById(fixture, "canonical-study-completed-item").getAttribute(
        "data-recovery",
      ),
    ).toBeNull();
    expect(
      scheduleBlockById(fixture, "canonical-study-completed-item").getAttribute(
        "data-completion",
      ),
    ).toBe("Done");
    expect(
      scheduleBlockById(fixture, "canonical-study-completed-item").getAttribute(
        "aria-label",
      ),
    ).toContain("Done");
    expect(
      scheduleBlockById(fixture, "canonical-study-moved-item").getAttribute(
        "data-recovery",
      ),
    ).toBe("Moved");
    expect(
      scheduleBlockById(fixture, "canonical-study-moved-item").getAttribute(
        "data-recovery-state",
      ),
    ).toBe("moved");
    expect(
      scheduleBlockById(fixture, "canonical-study-moved-item").getAttribute(
        "data-completion",
      ),
    ).toBeNull();
    expect(
      scheduleBlockById(fixture, "canonical-groceries-moved-item").getAttribute(
        "data-recovery",
      ),
    ).toBe("Moved");
    expect(
      scheduleBlockById(fixture, "canonical-groceries-moved-item").getAttribute(
        "aria-label",
      ),
    ).toContain("Moved");
    expect(
      scheduleBlockById(fixture, "canonical-interruption-item").getAttribute(
        "aria-label",
      ),
    ).toContain("Interruption");

    scheduleBlockById(fixture, "canonical-study-completed-item").dispatchEvent(
      new FocusEvent("focus", { bubbles: true }),
    );
    fixture.detectChanges();

    expect(selectedBlockDetailText(fixture)).toContain("Study notes");
    expect(selectedBlockDetailText(fixture)).toContain("Done");
    expect(selectedBlockDetailText(fixture)).toContain(
      "Scheduled from the persisted snapshot.",
    );
    expect(selectedBlockDetailText(fixture)).not.toContain(
      "Study notes was moved after reported unavailable time.",
    );

    scheduleBlockById(fixture, "canonical-groceries-moved-item").dispatchEvent(
      new FocusEvent("focus", { bubbles: true }),
    );
    fixture.detectChanges();

    expect(selectedBlockDetailText(fixture)).toContain("Buy groceries");
    expect(selectedBlockDetailText(fixture)).toContain("Task");
    expect(selectedBlockDetailText(fixture)).toContain("Moved");
    expect(selectedBlockDetailText(fixture)).toContain("30 min");
    expect(selectedBlockDetailText(fixture)).toContain(
      expectedTimeRange(
        "2026-06-22T16:40:00+02:00",
        "2026-06-22T17:10:00+02:00",
        "Europe/Brussels",
      ),
    );
    expect(selectedBlockDetailText(fixture)).toContain(
      "Buy groceries was moved after reported unavailable time.",
    );

    scheduleBlockById(fixture, "canonical-revised-free-item").dispatchEvent(
      new FocusEvent("focus", { bubbles: true }),
    );
    fixture.detectChanges();

    expect(selectedBlockDetailText(fixture)).toContain("Designated Free Time");
    expect(selectedBlockDetailText(fixture)).toContain("40 min");
    expect(selectedBlockDetailText(fixture)).toContain(
      "A remaining useful window was kept as free time.",
    );
  });

  it("shows split task state from scheduler decisions without relying on color alone", async () => {
    const splitSnapshot: ScheduleSnapshot = {
      ...snapshot,
      id: "split-snapshot",
      version: 2,
      items: [
        {
          id: "split-study-morning",
          kind: "task",
          task_id: "task-study",
          fixed_event_id: null,
          interruption_id: null,
          start_at: "2026-07-04T10:00:00+02:00",
          end_at: "2026-07-04T10:45:00+02:00",
        },
        {
          id: "split-study-afternoon",
          kind: "task",
          task_id: "task-study",
          fixed_event_id: null,
          interruption_id: null,
          start_at: "2026-07-04T13:00:00+02:00",
          end_at: "2026-07-04T13:45:00+02:00",
        },
      ],
      decisions: [
        {
          id: "split-study-decision",
          task_id: "task-study",
          reason_code: "split_across_available_windows",
          details: {},
        },
      ],
    };
    plannerApi.result = workspaceData({
      tasks: [task, studyTask],
      snapshot: splitSnapshot,
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    for (const itemId of ["split-study-morning", "split-study-afternoon"]) {
      const block = scheduleBlockById(fixture, itemId);
      expect(block.getAttribute("data-recovery")).toBe("Split");
      expect(block.getAttribute("data-recovery-state")).toBe("split");
      expect(block.getAttribute("aria-label")).toContain("Split");
    }

    expect(
      query(
        fixture,
        "pdf-status-chip span[aria-label='Split: Split across available windows']",
      ),
    ).not.toBeNull();
    expect(
      query(
        fixture,
        "pdf-status-chip span[aria-label='Split: Moved after interruption']",
      ),
    ).toBeNull();
    expect(
      query(fixture, "[data-testid='daily-timeline']")?.textContent,
    ).toContain("Split");

    scheduleBlockById(fixture, "split-study-afternoon").dispatchEvent(
      new FocusEvent("focus", { bubbles: true }),
    );
    fixture.detectChanges();

    expect(selectedBlockDetailText(fixture)).toContain("Split");
    expect(selectedBlockDetailText(fixture)).toContain(
      "Study notes was split across available windows.",
    );
  });

  it("shows read-only details and scheduler reasons for the focused schedule block", async () => {
    plannerApi.result = workspaceData({ snapshot: canonicalSnapshot });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    expect(selectedBlockDetailText(fixture)).toContain("Team meeting");
    expect(selectedBlockDetailText(fixture)).toContain("Fixed Event");
    expect(selectedBlockDetailText(fixture)).toContain(
      "Fixed events reserve this time.",
    );
    expect(
      scheduleBlockByKind(fixture, "fixed_event").getAttribute("aria-pressed"),
    ).toBe("true");

    scheduleBlockByKind(fixture, "task").dispatchEvent(
      new FocusEvent("focus", { bubbles: true }),
    );
    fixture.detectChanges();

    expect(selectedBlockDetailText(fixture)).toContain("Write report");
    expect(selectedBlockDetailText(fixture)).toContain("Task");
    expect(selectedBlockDetailText(fixture)).toContain("1 hr 30 min");
    expect(selectedBlockDetailText(fixture)).toContain(
      "Write report was placed in the earliest valid window.",
    );
    expect(
      scheduleBlockByKind(fixture, "task").getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("renders a helpful empty state for a selected date without saved day data", async () => {
    plannerApi.result = workspaceData({
      day: null,
      fixedEvents: [],
      tasks: [],
      snapshot: null,
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    expect(dayHeaderText(fixture)).toContain("July 4, 2026");
    expect(dayHeaderText(fixture)).toContain("Today");
    expect(inputValue(fixture, "#planner-date")).toBe(selectedDate);
    expect(text(fixture)).toContain("No saved planning day for this date.");
    expect(text(fixture)).toContain("No fixed events are saved for this day.");
    expect(text(fixture)).toContain("No active flexible tasks are saved yet.");
  });

  it("renders saved inputs clearly when a planning day has no schedule snapshot", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    expect(dayHeaderText(fixture)).toContain("July 4, 2026");
    expect(dayHeaderText(fixture)).toContain("Today");
    expect(inputValue(fixture, "#planner-date")).toBe(selectedDate);
    expect(text(fixture)).toContain("No schedule snapshot yet.");
    expect(text(fixture)).toContain(
      "Saved inputs are still shown below so the day remains easy to review.",
    );
    expect(text(fixture)).toContain("Team meeting");
    expect(text(fixture)).toContain("Write report");
    expect(text(fixture)).toContain("Snapshot");
    expect(text(fixture)).toContain("None");
    expect(announcement(fixture)).toContain("Planner workspace loaded");
  });

  it("opens contextual editors, cancels without saving, and returns focus", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const addTaskButton = buttonByText(fixture, "Add task", "Flexible tasks");

    addTaskButton.focus();
    addTaskButton.click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(query(fixture, "[role='dialog']")).not.toBeNull();
    expect(text(fixture)).toContain("Add flexible task");
    setInput(fixture, "#task-title", "Unsaved task");
    buttonByText(fixture, "Cancel", "Flexible tasks").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(query(fixture, "#task-title")).toBeNull();
    expect(plannerApi.createdTasks).toEqual([]);
    expect(document.activeElement).toBe(addTaskButton);

    await openNewFixedEventEditor(fixture);
    expect(query(fixture, "[aria-modal='true']")).not.toBeNull();
    expect(text(fixture)).toContain("Add fixed event");
    buttonByText(fixture, "Close", "Fixed events").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(query(fixture, "#fixed-event-title")).toBeNull();
    expect(plannerApi.savedFixedEvents).toEqual([]);
  });

  it("opens create choices from calendar slots and preloads fixed-event details", async () => {
    plannerApi.result = workspaceData({
      selectedDate: canonicalDate,
      fixedEvents: canonicalFixedEvents,
      tasks: canonicalTasks,
      snapshot: canonicalInitialSnapshot,
    });
    routeParams.next(convertToParamMap({ date: canonicalDate }));
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const slot = calendarSlot(fixture, `slot-${canonicalDate}-16:00`);

    expect(slot.className).toContain("min-h-10");
    expect(slot.className).toContain("border-dashed");
    expect(slot.className).toContain("border-meadow-500");
    expect(slot.className).not.toContain("text-transparent");
    slot.focus();
    slot.click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain("Create from calendar");
    expect(text(fixture)).toContain("Fixed event");
    expect(text(fixture)).toContain("Flexible task");
    buttonByText(fixture, "Fixed event", "Calendar create").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain("Add fixed event");
    expect(inputValue(fixture, "#fixed-event-start")).toBe(
      `${canonicalDate}T16:00`,
    );
    expect(inputValue(fixture, "#fixed-event-end")).toBe(
      `${canonicalDate}T16:30`,
    );
    expect(inputValue(fixture, "#fixed-event-time-zone")).toBe(
      "Europe/Brussels",
    );
    buttonByText(fixture, "Cancel", "Fixed events").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(document.activeElement).toBe(slot);
  });

  it("preloads flexible-task details from a keyboard calendar slot", async () => {
    plannerApi.result = workspaceData({
      selectedDate: canonicalDate,
      fixedEvents: canonicalFixedEvents,
      tasks: canonicalTasks,
      snapshot: canonicalInitialSnapshot,
    });
    routeParams.next(convertToParamMap({ date: canonicalDate }));
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const slot = calendarSlot(fixture, `slot-${canonicalDate}-16:30`);

    slot.focus();
    slot.dispatchEvent(keyboardEvent("keydown", "Enter"));
    slot.click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();
    buttonByText(fixture, "Flexible task", "Calendar create").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain("Add flexible task");
    expect(inputValue(fixture, "#task-estimate")).toBe("30");
    expect(inputValue(fixture, "#task-due-date")).toBe(canonicalDate);
    expect(inputValue(fixture, "#task-earliest")).toBe(
      `${canonicalDate}T16:30`,
    );
    expect(inputValue(fixture, "#task-earliest-zone")).toBe("Europe/Brussels");
  });

  it("saves flexible calendar-slot input without sending final placement fields", async () => {
    plannerApi.result = workspaceData({
      selectedDate: canonicalDate,
      fixedEvents: canonicalFixedEvents,
      tasks: canonicalTasks,
      snapshot: canonicalInitialSnapshot,
    });
    routeParams.next(convertToParamMap({ date: canonicalDate }));
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const slot = calendarSlot(fixture, `slot-${canonicalDate}-16:30`);

    slot.click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();
    buttonByText(fixture, "Flexible task", "Calendar create").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    setInput(fixture, "#task-title", "Calendar-created task");
    formByLabel(fixture, "Flexible task details").dispatchEvent(submitEvent());
    await settleEditorMutation(fixture);

    expect(plannerApi.createdTasks).toEqual([
      {
        title: "Calendar-created task",
        estimated_minutes: 30,
        priority: 3,
        due_date: canonicalDate,
        earliest_start_at: "2026-06-22T16:30:00+02:00",
        splitting_allowed: false,
        min_segment_minutes: null,
      },
    ]);
    expect(
      Object.prototype.hasOwnProperty.call(
        plannerApi.createdTasks[0] as Record<string, unknown>,
        "start_at",
      ),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(
        plannerApi.createdTasks[0] as Record<string, unknown>,
        "end_at",
      ),
    ).toBe(false);
    expect(plannerApi.loadedDates).toEqual([canonicalDate, canonicalDate]);
  });

  it("keeps calendar-prefilled flexible-task details after validation errors", async () => {
    plannerApi.result = workspaceData({
      selectedDate: canonicalDate,
      fixedEvents: canonicalFixedEvents,
      tasks: canonicalTasks,
      snapshot: canonicalInitialSnapshot,
    });
    routeParams.next(convertToParamMap({ date: canonicalDate }));
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    calendarSlot(fixture, `slot-${canonicalDate}-16:30`).click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();
    buttonByText(fixture, "Flexible task", "Calendar create").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    setInput(fixture, "#task-title", "Preserved calendar task");
    setInput(fixture, "#task-estimate", "0");
    formByLabel(fixture, "Flexible task details").dispatchEvent(submitEvent());
    fixture.detectChanges();

    expect(text(fixture)).toContain("Estimate must be at least 1 minute.");
    expect(inputValue(fixture, "#task-title")).toBe("Preserved calendar task");
    expect(inputValue(fixture, "#task-estimate")).toBe("0");
    expect(inputValue(fixture, "#task-due-date")).toBe(canonicalDate);
    expect(inputValue(fixture, "#task-earliest")).toBe(
      `${canonicalDate}T16:30`,
    );
    expect(inputValue(fixture, "#task-earliest-zone")).toBe("Europe/Brussels");
    expect(plannerApi.createdTasks).toEqual([]);
  });

  it("keeps calendar-prefilled fixed-event details after validation errors", async () => {
    plannerApi.result = workspaceData({
      selectedDate: canonicalDate,
      fixedEvents: canonicalFixedEvents,
      tasks: canonicalTasks,
      snapshot: canonicalInitialSnapshot,
    });
    routeParams.next(convertToParamMap({ date: canonicalDate }));
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    calendarSlot(fixture, `slot-${canonicalDate}-16:00`).click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();
    buttonByText(fixture, "Fixed event", "Calendar create").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    formByLabel(fixture, "Fixed event details").dispatchEvent(submitEvent());
    fixture.detectChanges();

    expect(text(fixture)).toContain("Enter an event title.");
    expect(inputValue(fixture, "#fixed-event-start")).toBe(
      `${canonicalDate}T16:00`,
    );
    expect(inputValue(fixture, "#fixed-event-end")).toBe(
      `${canonicalDate}T16:30`,
    );
    expect(inputValue(fixture, "#fixed-event-time-zone")).toBe(
      "Europe/Brussels",
    );
    expect(plannerApi.savedFixedEvents).toEqual([]);
  });

  it("prefills interruption details from selected task and fixed-event blocks", async () => {
    plannerApi.result = workspaceData({
      selectedDate: canonicalDate,
      fixedEvents: canonicalFixedEvents,
      tasks: canonicalTasks,
      snapshot: canonicalInitialSnapshot,
    });
    routeParams.next(convertToParamMap({ date: canonicalDate }));
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    buttonsByText(
      query(fixture, "[data-testid='selected-block-detail']"),
      "Report interruption",
    )[0].click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(inputValue(fixture, "#interruption-start")).toBe(
      `${canonicalDate}T08:00`,
    );
    expect(inputValue(fixture, "#interruption-end")).toBe(
      `${canonicalDate}T08:45`,
    );
    expect(inputValue(fixture, "#interruption-zone")).toBe("Europe/Brussels");
    expect(text(fixture)).toContain(
      "Unavailable time is ready from Reply to inbox.",
    );
    expect(document.activeElement?.id).toBe("interruption-start");

    scheduleBlockById(fixture, "canonical-team-meeting-item").dispatchEvent(
      new FocusEvent("focus", { bubbles: true }),
    );
    fixture.detectChanges();
    buttonsByText(
      query(fixture, "[data-testid='selected-block-detail']"),
      "Report interruption",
    )[0].click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(inputValue(fixture, "#interruption-start")).toBe(
      `${canonicalDate}T09:00`,
    );
    expect(inputValue(fixture, "#interruption-end")).toBe(
      `${canonicalDate}T10:00`,
    );
    expect(text(fixture)).toContain(
      "Unavailable time is ready from Team meeting.",
    );
  });

  it("reports an interruption from an empty selected calendar range", async () => {
    plannerApi.result = workspaceData({
      selectedDate: canonicalDate,
      fixedEvents: canonicalFixedEvents,
      tasks: canonicalTasks,
      snapshot: canonicalInitialSnapshot,
    });
    plannerApi.interruptionResponse = of(canonicalRevisedSnapshot);
    routeParams.next(convertToParamMap({ date: canonicalDate }));
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    calendarSlot(fixture, `slot-${canonicalDate}-16:00`).click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();
    buttonByText(fixture, "Report interruption", "Calendar create").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(inputValue(fixture, "#interruption-start")).toBe(
      `${canonicalDate}T16:00`,
    );
    expect(inputValue(fixture, "#interruption-end")).toBe(
      `${canonicalDate}T16:30`,
    );
    expect(text(fixture)).toContain(
      "Unavailable time is ready from the selected range.",
    );
    expect(document.activeElement?.id).toBe("interruption-start");

    formByLabel(fixture, "Report interruption").dispatchEvent(submitEvent());
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(plannerApi.reportedInterruptions).toEqual([
      {
        planningDayId: "day-1",
        request: {
          start_at: "2026-06-22T16:00:00+02:00",
          end_at: "2026-06-22T16:30:00+02:00",
          time_zone: "Europe/Brussels",
          reported_at: expect.stringMatching(
            /^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/,
          ),
        },
      },
    ]);
    expect(text(fixture)).toContain(
      "Revised schedule snapshot v2 is now shown.",
    );
  });

  it("uses the selected day for calendar slots when the snapshot has no items", async () => {
    const emptySnapshot: ScheduleSnapshot = {
      ...canonicalInitialSnapshot,
      items: [],
      decisions: [],
    };
    plannerApi.result = workspaceData({
      selectedDate: canonicalDate,
      snapshot: emptySnapshot,
    });
    routeParams.next(convertToParamMap({ date: canonicalDate }));
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const slot = calendarSlot(fixture, `slot-${canonicalDate}-08:00`);

    slot.click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();
    buttonByText(fixture, "Fixed event", "Calendar create").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(inputValue(fixture, "#fixed-event-start")).toBe(
      `${canonicalDate}T08:00`,
    );
    expect(inputValue(fixture, "#fixed-event-end")).toBe(
      `${canonicalDate}T08:30`,
    );
  });

  it("offers day-grid create slots without a schedule snapshot and excludes saved fixed events", async () => {
    plannerApi.result = workspaceData({
      fixedEvents: [fixedEvent],
      snapshot: null,
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    expect(calendarSlot(fixture, `slot-${selectedDate}-08:00`)).not.toBeNull();
    expect(
      query(fixture, `[data-calendar-slot='slot-${selectedDate}-09:00']`),
    ).toBeNull();
    expect(
      query(fixture, `[data-calendar-slot='slot-${selectedDate}-09:30']`),
    ).toBeNull();
    expect(calendarSlot(fixture, `slot-${selectedDate}-10:00`)).not.toBeNull();
    expect(text(fixture)).toContain("No schedule snapshot yet.");
  });

  it("opens fixed-event creation from a no-saved-day calendar slot", async () => {
    const expectedTimeZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    plannerApi.result = workspaceData({
      planningDays: [],
      day: null,
      fixedEvents: [],
      tasks: [],
      snapshot: null,
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const slot = calendarSlot(fixture, `slot-${selectedDate}-08:00`);

    expect(text(fixture)).toContain("No saved planning day for this date.");
    expect(slot.className).toContain("min-h-10");
    expect(slot.className).toContain("border-meadow-500");
    slot.click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();
    buttonByText(fixture, "Fixed event", "Calendar create").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain("Add fixed event");
    expect(inputValue(fixture, "#fixed-event-start")).toBe(
      `${selectedDate}T08:00`,
    );
    expect(inputValue(fixture, "#fixed-event-end")).toBe(
      `${selectedDate}T08:30`,
    );
    expect(inputValue(fixture, "#fixed-event-time-zone")).toBe(
      expectedTimeZone,
    );
  });

  it("opens flexible-task creation from a no-saved-day calendar slot", async () => {
    const expectedTimeZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    plannerApi.result = workspaceData({
      planningDays: [],
      day: null,
      fixedEvents: [],
      tasks: [],
      snapshot: null,
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const slot = calendarSlot(fixture, `slot-${selectedDate}-08:30`);

    slot.click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();
    buttonByText(fixture, "Flexible task", "Calendar create").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain("Add flexible task");
    expect(inputValue(fixture, "#task-estimate")).toBe("30");
    expect(inputValue(fixture, "#task-due-date")).toBe(selectedDate);
    expect(inputValue(fixture, "#task-earliest")).toBe(`${selectedDate}T08:30`);
    expect(inputValue(fixture, "#task-earliest-zone")).toBe(expectedTimeZone);
  });

  it("opens a prefilled calendar create choice from week route query intent", async () => {
    plannerApi.result = workspaceData({
      selectedDate: canonicalDate,
      snapshot: null,
    });
    routeParams.next(
      convertToParamMap({
        date: canonicalDate,
        create: "slot",
        start: "11:00",
      }),
    );

    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    expect(text(fixture)).toContain("Create from calendar");
    buttonByText(fixture, "Flexible task", "Calendar create").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(inputValue(fixture, "#task-estimate")).toBe("30");
    expect(inputValue(fixture, "#task-due-date")).toBe(canonicalDate);
    expect(inputValue(fixture, "#task-earliest")).toBe(
      `${canonicalDate}T11:00`,
    );
  });

  it("returns focus to the day calendar slot after canceling a week route create intent", async () => {
    plannerApi.result = workspaceData({
      selectedDate: canonicalDate,
      snapshot: null,
    });
    routeParams.next(
      convertToParamMap({
        date: canonicalDate,
        create: "slot",
        start: "11:00",
      }),
    );
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    buttonByText(fixture, "Flexible task", "Calendar create").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();
    buttonByText(fixture, "Cancel", "Flexible tasks").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(document.activeElement).toBe(
      calendarSlot(fixture, `slot-${canonicalDate}-11:00`),
    );
    expect(router.navigations[0]?.queryParams).toMatchObject({
      create: null,
      start: null,
      editTask: null,
      editFixedEvent: null,
    });
  });

  it("returns focus to a stable planner control when a route create slot is missing", async () => {
    plannerApi.result = workspaceData({
      selectedDate: canonicalDate,
      snapshot: canonicalInitialSnapshot,
    });
    routeParams.next(
      convertToParamMap({
        date: canonicalDate,
        create: "slot",
        start: "11:00",
      }),
    );
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    expect(
      query(fixture, `[data-calendar-slot='slot-${canonicalDate}-11:00']`),
    ).toBeNull();

    buttonByText(fixture, "Flexible task", "Calendar create").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();
    buttonByText(fixture, "Cancel", "Flexible tasks").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(document.activeElement).toBe(
      query(fixture, '[data-editor-trigger="fixed-event-add"]'),
    );
  });

  it("clears consumed route create intent params during normal date navigation", async () => {
    plannerApi.result = workspaceData({
      selectedDate: canonicalDate,
      snapshot: null,
    });
    routeParams.next(
      convertToParamMap({
        date: canonicalDate,
        create: "slot",
        start: "11:00",
      }),
    );
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const dateInput = query(fixture, "#planner-date") as HTMLInputElement;

    buttonByText(fixture, "Cancel", "Calendar create").click();
    fixture.detectChanges();
    dateInput.value = "2026-06-23";
    dateInput.dispatchEvent(new Event("input", { bubbles: true }));
    fixture.detectChanges();
    (query(fixture, "form") as HTMLFormElement).dispatchEvent(
      new SubmitEvent("submit", { bubbles: true }),
    );

    expect(router.navigations.at(-1)).toEqual({
      queryParams: {
        date: "2026-06-23",
        create: null,
        start: null,
        editTask: null,
        editFixedEvent: null,
      },
    });
  });

  it("opens existing task and fixed-event editors from timeline blocks", async () => {
    plannerApi.result = workspaceData({
      fixedEvents: [fixedEvent],
      tasks: [task],
      snapshot: canonicalSnapshot,
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    scheduleBlockById(fixture, "task-item").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain("Edit flexible task");
    expect(inputValue(fixture, "#task-title")).toBe("Write report");
    buttonByText(fixture, "Cancel", "Flexible tasks").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    scheduleBlockById(fixture, "fixed-item").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain("Edit fixed event");
    expect(inputValue(fixture, "#fixed-event-title")).toBe("Team meeting");
  });

  it("prefills interruption details from clicked task and fixed-event editors", async () => {
    plannerApi.result = workspaceData({
      fixedEvents: [fixedEvent],
      tasks: [task],
      snapshot: canonicalSnapshot,
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    scheduleBlockById(fixture, "task-item").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    buttonByText(fixture, "Report interruption", "Flexible tasks").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(query(fixture, "#task-editor-dialog")).toBeNull();
    expect(inputValue(fixture, "#interruption-start")).toBe("2026-07-04T10:00");
    expect(inputValue(fixture, "#interruption-end")).toBe("2026-07-04T11:30");
    expect(text(fixture)).toContain(
      "Unavailable time is ready from Write report.",
    );

    scheduleBlockById(fixture, "fixed-item").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    buttonByText(fixture, "Report interruption", "Fixed events").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(query(fixture, "#fixed-event-editor-dialog")).toBeNull();
    expect(inputValue(fixture, "#interruption-start")).toBe("2026-07-04T09:00");
    expect(inputValue(fixture, "#interruption-end")).toBe("2026-07-04T10:00");
    expect(text(fixture)).toContain(
      "Unavailable time is ready from Team meeting.",
    );
  });

  it("returns focus to recreated planning controls after successful editor mutations", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    await openNewTaskEditor(fixture);
    setInput(fixture, "#task-title", "Draft outline");
    setInput(fixture, "#task-estimate", "30");
    setInput(fixture, "#task-priority", "3");
    formByLabel(fixture, "Flexible task details").dispatchEvent(submitEvent());
    await settleEditorMutation(fixture);

    expect(document.activeElement).toBe(
      query(fixture, '[data-editor-trigger="task-add"]'),
    );

    await openExistingTaskEditor(fixture);
    formByLabel(fixture, "Flexible task details").dispatchEvent(submitEvent());
    await settleEditorMutation(fixture);

    expect(document.activeElement).toBe(
      query(
        fixture,
        '[data-editor-trigger="task-edit"][data-item-id="task-1"]',
      ),
    );

    await openExistingTaskEditor(fixture);
    buttonByText(fixture, "Delete task", "Flexible tasks").click();
    await settleEditorMutation(fixture);

    expect(document.activeElement).toBe(
      query(fixture, '[data-editor-trigger="task-add"]'),
    );

    await openNewFixedEventEditor(fixture);
    setInput(fixture, "#fixed-event-title", "Planning review");
    setInput(fixture, "#fixed-event-start", "2026-07-04T11:00");
    setInput(fixture, "#fixed-event-end", "2026-07-04T12:00");
    setInput(fixture, "#fixed-event-time-zone", "Europe/Brussels");
    formByLabel(fixture, "Fixed event details").dispatchEvent(submitEvent());
    await settleEditorMutation(fixture);

    expect(document.activeElement).toBe(
      query(fixture, '[data-editor-trigger="fixed-event-add"]'),
    );

    await openExistingFixedEventEditor(fixture);
    formByLabel(fixture, "Fixed event details").dispatchEvent(submitEvent());
    await settleEditorMutation(fixture);

    expect(document.activeElement).toBe(
      query(
        fixture,
        '[data-editor-trigger="fixed-event-edit"][data-item-id="event-1"]',
      ),
    );

    await openExistingFixedEventEditor(fixture);
    buttonByText(fixture, "Delete event", "Fixed events").click();
    await settleEditorMutation(fixture);

    expect(document.activeElement).toBe(
      query(fixture, '[data-editor-trigger="fixed-event-add"]'),
    );
    confirm.mockRestore();
  });

  it("closes contextual editors with Escape and returns focus to the opener", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const addTaskButton = buttonByText(fixture, "Add task", "Flexible tasks");

    addTaskButton.focus();
    addTaskButton.click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(document.activeElement).toBe(query(fixture, "#task-title"));
    query(fixture, "#task-title")?.dispatchEvent(
      keyboardEvent("keydown", "Escape"),
    );
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(query(fixture, "#task-editor-dialog")).toBeNull();
    expect(document.activeElement).toBe(addTaskButton);
    expect(plannerApi.createdTasks).toEqual([]);

    const addEventButton = buttonByText(fixture, "Add event", "Fixed events");
    addEventButton.focus();
    addEventButton.click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(document.activeElement).toBe(query(fixture, "#fixed-event-title"));
    query(fixture, "#fixed-event-title")?.dispatchEvent(
      keyboardEvent("keydown", "Escape"),
    );
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(query(fixture, "#fixed-event-editor-dialog")).toBeNull();
    expect(document.activeElement).toBe(addEventButton);
    expect(plannerApi.savedFixedEvents).toEqual([]);
  });

  it("traps Tab focus inside each contextual editor", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const offsetParentDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetParent",
    );
    Object.defineProperty(HTMLElement.prototype, "offsetParent", {
      configurable: true,
      get: () => document.body,
    });

    try {
      await openNewTaskEditor(fixture);
      const taskClose = query(
        fixture,
        "button[aria-label='Close task editor']",
      ) as HTMLButtonElement;
      const taskCancel = buttonByText(fixture, "Cancel", "Flexible tasks");

      taskClose.focus();
      const taskShiftTab = keyboardEvent("keydown", "Tab", {
        shiftKey: true,
      });
      taskClose.dispatchEvent(taskShiftTab);
      fixture.detectChanges();

      expect(taskShiftTab.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(taskCancel);

      taskCancel.focus();
      const taskTab = keyboardEvent("keydown", "Tab");
      taskCancel.dispatchEvent(taskTab);
      fixture.detectChanges();

      expect(taskTab.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(taskClose);

      buttonByText(fixture, "Cancel", "Flexible tasks").click();
      fixture.detectChanges();
      await nextMicrotask();
      fixture.detectChanges();

      await openNewFixedEventEditor(fixture);
      const eventClose = query(
        fixture,
        "button[aria-label='Close fixed event editor']",
      ) as HTMLButtonElement;
      const eventCancel = buttonByText(fixture, "Cancel", "Fixed events");

      eventClose.focus();
      const eventShiftTab = keyboardEvent("keydown", "Tab", {
        shiftKey: true,
      });
      eventClose.dispatchEvent(eventShiftTab);
      fixture.detectChanges();

      expect(eventShiftTab.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(eventCancel);

      eventCancel.focus();
      const eventTab = keyboardEvent("keydown", "Tab");
      eventCancel.dispatchEvent(eventTab);
      fixture.detectChanges();

      expect(eventTab.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(eventClose);
    } finally {
      if (offsetParentDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetParent",
          offsetParentDescriptor,
        );
      } else {
        delete (HTMLElement.prototype as { offsetParent?: unknown })
          .offsetParent;
      }
    }
  });

  it("shows a task suggestion and applies it only into editable fields", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const suggestionResponse = new Subject<unknown>();
    plannerApi.taskSuggestionResponse = suggestionResponse;
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    await openNewTaskEditor(fixture);
    setInput(fixture, "#task-ai-text", "Write final report for 45 minutes");
    buttonByText(fixture, "Suggest details", "Flexible tasks").click();
    fixture.detectChanges();

    expect(text(fixture)).toContain("Looking for editable task details.");
    expect(
      buttonByText(fixture, "Suggest details", "Flexible tasks").disabled,
    ).toBe(true);
    expect(inputValue(fixture, "#task-title")).toBe("");
    expect(plannerApi.createdTasks).toEqual([]);

    suggestionResponse.next({
      status: "suggested",
      confidence: 0.8,
      proposed_fields: {
        title: "Write final report",
        estimated_minutes: 45,
        priority: 4,
        due_date: "2026-07-04",
        earliest_start_at: null,
        splitting_allowed: null,
        min_segment_minutes: null,
      },
      fallback_reason: null,
      error_code: null,
    });
    suggestionResponse.complete();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain("Suggestion ready");
    expect(inputValue(fixture, "#task-title")).toBe("");
    expect(plannerApi.createdTasks).toEqual([]);
    buttonByText(fixture, "Apply to form", "Flexible tasks").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(inputValue(fixture, "#task-title")).toBe("Write final report");
    expect(inputValue(fixture, "#task-estimate")).toBe("45");
    expect(inputValue(fixture, "#task-priority")).toBe("4");
    expect(plannerApi.createdTasks).toEqual([]);
  });

  it("ignores stale task suggestions after reopening the task editor", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const staleSuggestionResponse = new Subject<unknown>();
    const currentSuggestionResponse = new Subject<unknown>();
    plannerApi.taskSuggestionResponse = staleSuggestionResponse;
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    await openNewTaskEditor(fixture);
    setInput(fixture, "#task-ai-text", "Stale task for 20 minutes");
    buttonByText(fixture, "Suggest details", "Flexible tasks").click();
    fixture.detectChanges();

    buttonByText(fixture, "Cancel", "Flexible tasks").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    plannerApi.taskSuggestionResponse = currentSuggestionResponse;
    await openNewTaskEditor(fixture);
    setInput(fixture, "#task-ai-text", "Current task for 45 minutes");
    buttonByText(fixture, "Suggest details", "Flexible tasks").click();
    fixture.detectChanges();

    staleSuggestionResponse.next({
      status: "suggested",
      confidence: 0.8,
      proposed_fields: {
        title: "Stale task",
        estimated_minutes: 20,
        priority: 2,
        due_date: null,
        earliest_start_at: null,
        splitting_allowed: null,
        min_segment_minutes: null,
      },
      fallback_reason: null,
      error_code: null,
    });
    staleSuggestionResponse.complete();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain("Looking for editable task details.");
    expect(text(fixture)).not.toContain("Suggestion ready");
    expect(inputValue(fixture, "#task-title")).toBe("");
    expect(
      buttonByText(fixture, "Suggest details", "Flexible tasks").disabled,
    ).toBe(true);

    currentSuggestionResponse.next({
      status: "suggested",
      confidence: 0.8,
      proposed_fields: {
        title: "Current task",
        estimated_minutes: 45,
        priority: 4,
        due_date: null,
        earliest_start_at: null,
        splitting_allowed: null,
        min_segment_minutes: null,
      },
      fallback_reason: null,
      error_code: null,
    });
    currentSuggestionResponse.complete();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    buttonByText(fixture, "Apply to form", "Flexible tasks").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(inputValue(fixture, "#task-title")).toBe("Current task");
    expect(inputValue(fixture, "#task-estimate")).toBe("45");
    expect(inputValue(fixture, "#task-priority")).toBe("4");
  });

  it("shows task fallback without changing editable fields", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    plannerApi.taskSuggestionResponse = of({
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
      fallback_reason: "ai_disabled",
      error_code: "ai_disabled",
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    await openNewTaskEditor(fixture);
    setInput(fixture, "#task-ai-text", "something");
    buttonByText(fixture, "Suggest details", "Flexible tasks").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain("Suggestions are off");
    expect(inputValue(fixture, "#task-title")).toBe("");
  });

  it("applies interruption suggestions into the interruption form only", async () => {
    plannerApi.result = workspaceData({ snapshot: canonicalSnapshot });
    const suggestionResponse = new Subject<unknown>();
    plannerApi.interruptionSuggestionResponse = suggestionResponse;
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    setInput(fixture, "#interruption-ai-text", "appointment from 13 to 14");
    buttonByText(fixture, "Suggest details", "Report interruption").click();
    fixture.detectChanges();

    expect(text(fixture)).toContain("Looking for editable unavailable time.");
    expect(
      buttonByText(fixture, "Suggest details", "Report interruption").disabled,
    ).toBe(true);
    expect(inputValue(fixture, "#interruption-start")).toBe("");
    expect(plannerApi.reportedInterruptions).toEqual([]);

    suggestionResponse.next({
      status: "suggested",
      confidence: 0.7,
      proposed_fields: {
        start_at: "2026-07-04T13:00:00+02:00",
        end_at: "2026-07-04T14:00:00+02:00",
        time_zone: "Europe/Brussels",
        reported_at: "2026-07-04T13:00:00+02:00",
      },
      fallback_reason: null,
      error_code: null,
    });
    suggestionResponse.complete();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain("Suggestion ready");
    expect(inputValue(fixture, "#interruption-start")).toBe("");
    expect(plannerApi.reportedInterruptions).toEqual([]);
    buttonByText(fixture, "Apply to form", "Report interruption").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(inputValue(fixture, "#interruption-start")).toBe("2026-07-04T13:00");
    expect(inputValue(fixture, "#interruption-end")).toBe("2026-07-04T14:00");
    expect(plannerApi.reportedInterruptions).toEqual([]);
  });

  it("shows interruption fallback without changing editable fields", async () => {
    plannerApi.result = workspaceData({ snapshot: canonicalSnapshot });
    plannerApi.interruptionSuggestionResponse = of({
      status: "fallback",
      confidence: 0,
      proposed_fields: {
        start_at: null,
        end_at: null,
        time_zone: null,
        reported_at: null,
      },
      fallback_reason: "ai_disabled",
      error_code: "ai_disabled",
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    setInput(fixture, "#interruption-ai-text", "appointment");
    buttonByText(fixture, "Suggest details", "Report interruption").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain("Suggestions are off");
    expect(inputValue(fixture, "#interruption-start")).toBe("");
    expect(inputValue(fixture, "#interruption-end")).toBe("");
    expect(plannerApi.reportedInterruptions).toEqual([]);
  });

  it("focuses the manual interruption form from the daily recovery action area", async () => {
    plannerApi.result = workspaceData({ snapshot: canonicalSnapshot });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    buttonByText(fixture, "Report interruption", "Generate schedule").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(document.activeElement?.id).toBe("interruption-start");
    expect(text(fixture)).toContain(
      "Add the unavailable time, then submit when the details are right.",
    );
  });

  it("records partial study progress and replaces the visible plan after an interruption", async () => {
    plannerApi.result = workspaceData({
      tasks: [task, studyTask],
      snapshot: canonicalSnapshot,
    });
    plannerApi.interruptionResponse = of(revisedStudySnapshot);
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    setInput(fixture, "#progress-minutes", "60");
    setInput(fixture, "#progress-recorded", "2026-07-04T14:00");
    setInput(fixture, "#progress-time-zone", "Europe/Brussels");
    const progressTask = query(fixture, "#progress-task") as HTMLSelectElement;
    progressTask.value = "task-study";
    progressTask.dispatchEvent(new Event("change", { bubbles: true }));
    formByLabel(fixture, "Record task progress").dispatchEvent(submitEvent());
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(plannerApi.recordedProgress).toEqual([
      {
        planningDayId: "day-1",
        request: {
          task_id: "task-study",
          completed_minutes: 60,
          recorded_at: "2026-07-04T14:00:00+02:00",
        },
      },
    ]);
    expect(text(fixture)).toContain("Study notes");
    expect(text(fixture)).toContain("1 hr completed");
    expect(text(fixture)).toContain("30 min remaining");

    setInput(fixture, "#interruption-start", "2026-07-04T14:00");
    setInput(fixture, "#interruption-end", "2026-07-04T15:15");
    setInput(fixture, "#interruption-zone", "Europe/Brussels");
    setInput(fixture, "#interruption-reported", "2026-07-04T14:00");
    formByLabel(fixture, "Report interruption").dispatchEvent(submitEvent());
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(plannerApi.reportedInterruptions).toEqual([
      {
        planningDayId: "day-1",
        request: {
          start_at: "2026-07-04T14:00:00+02:00",
          end_at: "2026-07-04T15:15:00+02:00",
          time_zone: "Europe/Brussels",
          reported_at: "2026-07-04T14:00:00+02:00",
        },
      },
    ]);
    expect(plannerApi.loadedDates).toEqual([selectedDate]);
    expect(text(fixture)).toContain("Moved work");
    expect(text(fixture)).toContain(
      "Study notes was moved after reported unavailable time.",
    );
    expect(text(fixture)).toContain(
      "Revised schedule snapshot v3 is now shown.",
    );
    expect(text(fixture)).toContain("v3");
    expect(
      query(fixture, "[data-testid='daily-timeline']")?.textContent,
    ).toContain("Done");
    expect(
      scheduleBlockById(fixture, "study-before-interruption").getAttribute(
        "data-recovery",
      ),
    ).toBeNull();
    expect(
      scheduleBlockById(fixture, "study-before-interruption").getAttribute(
        "data-completion",
      ),
    ).toBe("Done");
    expect(
      scheduleBlockById(fixture, "study-after-interruption").getAttribute(
        "data-recovery",
      ),
    ).toBe("Moved");
    expect(
      scheduleBlockById(fixture, "study-after-interruption").getAttribute(
        "data-completion",
      ),
    ).toBeNull();
    expect(
      scheduleBlockById(fixture, "study-before-interruption").getAttribute(
        "aria-label",
      ),
    ).toContain("Done");
    scheduleBlockById(fixture, "study-before-interruption").dispatchEvent(
      new FocusEvent("focus", { bubbles: true }),
    );
    fixture.detectChanges();
    expect(selectedBlockDetailText(fixture)).toContain("Done");
    expect(selectedBlockDetailText(fixture)).toContain(
      "Scheduled from the persisted snapshot.",
    );
    expect(selectedBlockDetailText(fixture)).not.toContain(
      "Study notes was moved after reported unavailable time.",
    );
    expect(timelineBlocks(fixture).map((block) => block.kind)).toEqual([
      "task",
      "interruption",
      "task",
    ]);
    expect(announcement(fixture)).toContain(
      "Revised schedule snapshot v3 is now shown.",
    );
  });

  it("keeps progress details available for retry when saving progress fails", async () => {
    plannerApi.result = workspaceData({
      tasks: [task, studyTask],
      snapshot: canonicalSnapshot,
    });
    plannerApi.progressError = new HttpErrorResponse({ status: 503 });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    setInput(fixture, "#progress-minutes", "60");
    setInput(fixture, "#progress-recorded", "2026-07-04T14:00");
    setInput(fixture, "#progress-time-zone", "Europe/Brussels");
    const progressTask = query(fixture, "#progress-task") as HTMLSelectElement;
    progressTask.value = "task-study";
    progressTask.dispatchEvent(new Event("change", { bubbles: true }));
    formByLabel(fixture, "Record task progress").dispatchEvent(submitEvent());
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain(
      "We could not save progress. Your details are still here; try again when the API is available.",
    );
    expect(announcement(fixture)).toContain(
      "We could not save progress. Your details are still here; try again when the API is available.",
    );
    expect((query(fixture, "#progress-task") as HTMLSelectElement).value).toBe(
      "task-study",
    );
    expect(inputValue(fixture, "#progress-minutes")).toBe("60");
    expect(inputValue(fixture, "#progress-recorded")).toBe("2026-07-04T14:00");
    expect(inputValue(fixture, "#progress-time-zone")).toBe("Europe/Brussels");

    plannerApi.progressError = null;
    formByLabel(fixture, "Record task progress").dispatchEvent(submitEvent());
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(plannerApi.recordedProgress).toEqual([
      {
        planningDayId: "day-1",
        request: {
          task_id: "task-study",
          completed_minutes: 60,
          recorded_at: "2026-07-04T14:00:00+02:00",
        },
      },
      {
        planningDayId: "day-1",
        request: {
          task_id: "task-study",
          completed_minutes: 60,
          recorded_at: "2026-07-04T14:00:00+02:00",
        },
      },
    ]);
    expect(text(fixture)).toContain("Progress saved.");
    expect(announcement(fixture)).toContain("Progress saved.");
  });

  it("keeps interruption details available for retry when rescheduling fails", async () => {
    plannerApi.result = workspaceData({ snapshot: canonicalSnapshot });
    plannerApi.interruptionError = new HttpErrorResponse({ status: 503 });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    setInput(fixture, "#interruption-start", "2026-07-04T14:00");
    setInput(fixture, "#interruption-end", "2026-07-04T15:15");
    setInput(fixture, "#interruption-zone", "Europe/Brussels");
    setInput(fixture, "#interruption-reported", "2026-07-04T14:00");
    formByLabel(fixture, "Report interruption").dispatchEvent(submitEvent());
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain(
      "The scheduler is unavailable right now. Saved progress is unchanged; try again when scheduling is available.",
    );
    expect(announcement(fixture)).toContain(
      "The scheduler is unavailable right now. Saved progress is unchanged; try again when scheduling is available.",
    );
    expect(inputValue(fixture, "#interruption-start")).toBe("2026-07-04T14:00");
    expect(inputValue(fixture, "#interruption-end")).toBe("2026-07-04T15:15");
    expect(inputValue(fixture, "#interruption-zone")).toBe("Europe/Brussels");
    expect(inputValue(fixture, "#interruption-reported")).toBe(
      "2026-07-04T14:00",
    );

    plannerApi.interruptionError = null;
    plannerApi.interruptionResponse = of(revisedStudySnapshot);
    formByLabel(fixture, "Report interruption").dispatchEvent(submitEvent());
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(plannerApi.reportedInterruptions).toEqual([
      {
        planningDayId: "day-1",
        request: {
          start_at: "2026-07-04T14:00:00+02:00",
          end_at: "2026-07-04T15:15:00+02:00",
          time_zone: "Europe/Brussels",
          reported_at: "2026-07-04T14:00:00+02:00",
        },
      },
      {
        planningDayId: "day-1",
        request: {
          start_at: "2026-07-04T14:00:00+02:00",
          end_at: "2026-07-04T15:15:00+02:00",
          time_zone: "Europe/Brussels",
          reported_at: "2026-07-04T14:00:00+02:00",
        },
      },
    ]);
    expect(text(fixture)).toContain(
      "Revised schedule snapshot v3 is now shown.",
    );
    expect(announcement(fixture)).toContain(
      "Revised schedule snapshot v3 is now shown.",
    );
  });

  it("marks unfinished work complete and removes it from progress choices", async () => {
    plannerApi.result = workspaceData({ snapshot: canonicalSnapshot });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    buttonByText(fixture, "Mark complete", "Flexible tasks").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(plannerApi.recordedProgress).toEqual([
      {
        planningDayId: "day-1",
        request: {
          task_id: "task-1",
          completed_minutes: 90,
          recorded_at: expect.stringMatching(
            /^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/,
          ),
        },
      },
    ]);
    const progressTask = query(fixture, "#progress-task") as HTMLSelectElement;
    expect(text(fixture)).toContain("Progress saved");
    expect(text(fixture)).toContain("Completed history");
    expect(text(fixture)).toContain("1 hr 30 min completed");
    expect(text(fixture)).toContain("0 min remaining");
    expect(progressTask.textContent).not.toContain("Write report");
    expect(() =>
      buttonByText(fixture, "Mark complete", "Flexible tasks"),
    ).toThrow();
  });

  it("blocks invalid interruption intervals before requesting recovery", async () => {
    plannerApi.result = workspaceData({ snapshot: canonicalSnapshot });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    setInput(fixture, "#interruption-start", "2026-07-04T15:15");
    setInput(fixture, "#interruption-end", "2026-07-04T14:00");
    setInput(fixture, "#interruption-zone", "Europe/Brussels");
    setInput(fixture, "#interruption-reported", "2026-07-04T15:15");
    formByLabel(fixture, "Report interruption").dispatchEvent(submitEvent());
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(plannerApi.reportedInterruptions).toEqual([]);
    expect(text(fixture)).toContain(
      "Review the interruption details before submitting.",
    );
    expect(text(fixture)).toContain("End time must be after start time.");
    expect(inputAriaInvalid(fixture, "#interruption-end")).toBe("true");
  });

  it("shows completed history without offering completed work for more progress", async () => {
    plannerApi.result = workspaceData({
      tasks: [{ ...task, completed_minutes: 90, remaining_minutes: 0 }],
      progress: [{ ...progressRecord, completed_minutes: 90 }],
      snapshot: canonicalSnapshot,
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const progressTask = query(fixture, "#progress-task") as HTMLSelectElement;

    expect(text(fixture)).toContain("Completed history");
    expect(text(fixture)).toContain("Write report");
    expect(text(fixture)).toContain("Completed");
    expect(progressTask.textContent).not.toContain("Write report");
    expect(() =>
      buttonByText(fixture, "Mark complete", "Flexible tasks"),
    ).toThrow();
  });

  it("does not offer work completed on another planning day", async () => {
    plannerApi.result = workspaceData({
      tasks: [{ ...task, completed_minutes: 90, remaining_minutes: 0 }],
      progress: [],
      snapshot: canonicalSnapshot,
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const progressTask = query(fixture, "#progress-task") as HTMLSelectElement;

    expect(text(fixture)).toContain("1 hr 30 min completed");
    expect(text(fixture)).toContain("0 min remaining");
    expect(text(fixture)).toContain("Completed");
    expect(text(fixture)).not.toContain("Completed history");
    expect(progressTask.textContent).not.toContain("Write report");
  });

  it("renders schedule and fixed-event times in their retained IANA zones", async () => {
    const tokyoEvent: FixedEvent = {
      ...fixedEvent,
      id: "event-tokyo",
      title: "Tokyo call",
      start_at: "2026-07-04T00:00:00Z",
      end_at: "2026-07-04T01:00:00Z",
      time_zone: "Asia/Tokyo",
    };
    const newYorkSnapshot: ScheduleSnapshot = {
      ...snapshot,
      items: [
        {
          ...snapshot.items[0],
          start_at: "2026-07-04T13:00:00Z",
          end_at: "2026-07-04T14:00:00Z",
        },
      ],
    };
    plannerApi.result = workspaceData({
      day: {
        id: "day-1",
        local_date: selectedDate,
        time_zone: "America/New_York",
        current_snapshot_id: "snapshot-1",
        created_at: "2026-07-03T08:00:00Z",
      },
      fixedEvents: [tokyoEvent],
      snapshot: newYorkSnapshot,
    });

    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const timelineText =
      query(fixture, "[aria-labelledby='timeline-title']")?.textContent ?? "";
    const fixedEventsText =
      query(fixture, "[aria-labelledby='fixed-events-title']")?.textContent ??
      "";
    const newYorkRange = expectedTimeRange(
      "2026-07-04T13:00:00Z",
      "2026-07-04T14:00:00Z",
      "America/New_York",
    );
    const tokyoRange = expectedTimeRange(
      "2026-07-04T00:00:00Z",
      "2026-07-04T01:00:00Z",
      "Asia/Tokyo",
    );
    const brusselsScheduleRange = expectedTimeRange(
      "2026-07-04T13:00:00Z",
      "2026-07-04T14:00:00Z",
      "Europe/Brussels",
    );
    const brusselsFixedEventRange = expectedTimeRange(
      "2026-07-04T00:00:00Z",
      "2026-07-04T01:00:00Z",
      "Europe/Brussels",
    );

    expect(timelineText).toContain("Write report");
    expect(timelineText).toContain(newYorkRange);
    expect(timelineText).not.toContain(brusselsScheduleRange);
    expect(fixedEventsText).toContain("Tokyo call");
    expect(fixedEventsText).toContain(tokyoRange);
    expect(fixedEventsText).not.toContain(brusselsFixedEventRange);
  });

  it("preserves selected-date context in the accessible loading state", async () => {
    const pendingLoad = new Subject<PlannerWorkspaceData>();
    plannerApi.responses.set(selectedDate, pendingLoad);

    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const liveAnnouncement = announcement(fixture).trim();

    expect(dayHeaderText(fixture)).toContain("July 4, 2026");
    expect(dayHeaderText(fixture)).toContain("Today");
    expect(inputValue(fixture, "#planner-date")).toBe(selectedDate);
    expect(text(fixture)).toContain("Loading");
    expect(text(fixture)).toContain("Keeping your selected day in view");
    expect(liveAnnouncement).toContain("Loading planner workspace for");
    expect(liveAnnouncement).toContain("July 4, 2026");
    expect(
      fixture.nativeElement.querySelector("[aria-busy='true']"),
    ).not.toBeNull();
    expect(text(fixture)).not.toContain("Write report");

    pendingLoad.next(workspaceData({ snapshot: null }));
    pendingLoad.complete();
  });

  it("keeps workspace regions on responsive desktop and narrow-width grids", async () => {
    plannerApi.result = workspaceData({ snapshot: canonicalSnapshot });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const timeline = query(fixture, "[aria-labelledby='timeline-title']");
    const fixedEvents = query(
      fixture,
      "[aria-labelledby='fixed-events-title']",
    );
    const dateControlGroup = query(fixture, "#planner-date")?.parentElement;

    expect(
      query(fixture, "[data-testid='day-workspace-header']")?.className,
    ).toContain("rounded-lg");
    expect(query(fixture, "form")?.className).toContain("space-y-3");
    expect(
      query(fixture, "[data-testid='day-header-summary']")?.className,
    ).toContain("lg:grid-cols-5");
    expect(timeline?.parentElement?.className).toContain("lg:grid-cols");
    expect(fixedEvents?.parentElement?.className).toContain("lg:grid-cols-2");
    expect(query(fixture, "#planner-date")?.className).toContain("w-full");
    expect(dateControlGroup?.className).toContain("sm:flex-row");
    expect(
      query(fixture, "[data-testid='daily-timeline']")?.className,
    ).toContain("min-h");
    expect(text(fixture)).toContain("Day timeline");
    expect(text(fixture)).toContain("Planning inputs");
  });

  it("positions timeline blocks from item times without overlap", async () => {
    plannerApi.result = workspaceData({ snapshot: canonicalSnapshot });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const blocks = timelineBlocks(fixture);

    expect(blocks.length).toBe(5);
    for (let index = 1; index < blocks.length; index += 1) {
      const previous = blocks[index - 1];
      const current = blocks[index];
      expect(current.top).toBeGreaterThanOrEqual(
        previous.top + previous.height,
      );
    }
    expect(blocks[0]).toMatchObject({
      kind: "fixed_event",
      top: 60,
      height: 60,
    });
    expect(blocks[1]).toMatchObject({ kind: "task", top: 120, height: 90 });
  });

  it("keeps short timeline block status details visible without changing real durations", async () => {
    plannerApi.result = workspaceData({ snapshot: shortStatusSnapshot });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const blocks = timelineBlocks(fixture);
    const detailList = query(fixture, "[data-testid='timeline-detail-list']");
    const compactElements = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        "[data-testid='daily-timeline'] article",
      ),
    );
    const compactLabels = compactElements
      .map((element) => element.getAttribute("aria-label") ?? "")
      .join(" ");

    expect(blocks.map((block) => block.kind)).toEqual([
      "fixed_event",
      "task",
      "buffer",
      "interruption",
      "designated_free_time",
    ]);
    expect(blocks.every((block) => block.height === 10)).toBe(true);
    expect(blocks.every((block) => block.compact)).toBe(true);
    expect(
      compactElements.every(
        (element) =>
          element.className.includes("overflow-hidden") &&
          !element.className.includes("min-h-14") &&
          !element.className.includes("overflow-visible"),
      ),
    ).toBe(true);
    expect(compactLabels).toContain("Team meeting");
    expect(compactLabels).toContain("Write report");
    expect(compactLabels).toContain("10 min");
    expect(detailList?.textContent).toContain("Team meeting");
    expect(detailList?.textContent).toContain("Write report");
    expect(detailList?.textContent).toContain("Buffer");
    expect(detailList?.textContent).toContain("Unavailable");
    expect(detailList?.textContent).toContain("Designated Free Time");
    expect(detailList?.textContent).toContain("Fixed");
    expect(detailList?.textContent).toContain("Work");
    expect(detailList?.textContent).toContain("Free");
    expect(detailList?.textContent).toContain("10 min");
  });

  it("renders overlapping locked snapshot blocks in separate timeline lanes", async () => {
    plannerApi.result = workspaceData({ snapshot: overlappingLockedSnapshot });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const blocks = timelineBlocks(fixture);

    expect(blocks).toEqual([
      {
        kind: "fixed_event",
        top: 60,
        height: 60,
        compact: false,
        laneIndex: 0,
        laneCount: 2,
        left: 0,
        width: 50,
      },
      {
        kind: "interruption",
        top: 90,
        height: 60,
        compact: false,
        laneIndex: 1,
        laneCount: 2,
        left: 50,
        width: 50,
      },
      {
        kind: "task",
        top: 150,
        height: 60,
        compact: false,
        laneIndex: 0,
        laneCount: 1,
        left: 0,
        width: 100,
      },
    ]);
    expect(blocks[1].top).toBeLessThan(blocks[0].top + blocks[0].height);
    expect(blocks[1].left).toBeGreaterThanOrEqual(
      blocks[0].left + blocks[0].width,
    );
  });

  it("generates a plan, shows pending state, and displays the returned snapshot", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const generated = {
      ...canonicalSnapshot,
      id: "snapshot-generated",
      version: 4,
    };
    const generateResponse = new Subject<ScheduleSnapshot>();
    plannerApi.generateResponse = generateResponse;
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    buttonByText(fixture, "Generate plan", "Generate schedule").click();
    fixture.detectChanges();

    expect(plannerApi.generatedPlanningDayIds).toEqual(["day-1"]);
    expect(text(fixture)).toContain(
      "Generating a schedule from the saved planning inputs.",
    );
    expect(query(fixture, "button[aria-busy='true']")?.textContent).toContain(
      "Generating",
    );

    generateResponse.next(generated);
    generateResponse.complete();
    fixture.detectChanges();

    expect(text(fixture)).toContain("Generated schedule snapshot v4.");
    expect(text(fixture)).toContain("Write report");
    expect(text(fixture)).toContain("v4");
  });

  it("replaces an older displayed snapshot with the generated latest snapshot", async () => {
    plannerApi.result = workspaceData({ snapshot });
    const generated = {
      ...canonicalSnapshot,
      id: "snapshot-generated",
      version: 4,
    };
    plannerApi.generateResponse = of(generated);
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    expect(text(fixture)).toContain("v2");
    expect(timelineBlocks(fixture).map((block) => block.kind)).toEqual([
      "task",
      "designated_free_time",
    ]);

    buttonByText(fixture, "Generate plan", "Generate schedule").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(plannerApi.generatedPlanningDayIds).toEqual(["day-1"]);
    expect(text(fixture)).toContain("Generated schedule snapshot v4.");
    expect(text(fixture)).toContain("v4");
    expect(timelineBlocks(fixture).map((block) => block.kind)).toEqual([
      "fixed_event",
      "task",
      "buffer",
      "interruption",
      "designated_free_time",
    ]);
  });

  it("does not apply a generated snapshot after the user changes days", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const generated = {
      ...canonicalSnapshot,
      id: "snapshot-generated",
      version: 4,
    };
    const generateResponse = new Subject<ScheduleSnapshot>();
    plannerApi.generateResponse = generateResponse;
    plannerApi.responses.set(
      "2026-07-05",
      of(
        workspaceData({
          selectedDate: "2026-07-05",
          planningDays: [
            {
              id: "day-2",
              local_date: "2026-07-05",
              time_zone: "Europe/Brussels",
              current_snapshot_id: null,
              created_at: "2026-07-03T08:00:00Z",
            },
          ],
          day: {
            id: "day-2",
            local_date: "2026-07-05",
            time_zone: "Europe/Brussels",
            current_snapshot_id: null,
            created_at: "2026-07-03T08:00:00Z",
          },
          fixedEvents: [],
          snapshot: null,
        }),
      ),
    );
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    buttonByText(fixture, "Generate plan", "Generate schedule").click();
    fixture.detectChanges();
    routeParams.next(convertToParamMap({ date: "2026-07-05" }));
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();
    generateResponse.next(generated);
    generateResponse.complete();
    fixture.detectChanges();

    expect(plannerApi.generatedPlanningDayIds).toEqual(["day-1"]);
    expect(text(fixture)).toContain("July 5, 2026");
    expect(text(fixture)).not.toContain("Generated schedule snapshot v4.");
    expect(query(fixture, "[data-testid='daily-timeline']")).not.toBeNull();
    expect(text(fixture)).toContain("No schedule snapshot yet.");
  });

  it("does not show a generate-plan error after the user changes days", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const generateResponse = new Subject<ScheduleSnapshot>();
    plannerApi.generateResponse = generateResponse;
    plannerApi.responses.set(
      "2026-07-05",
      of(
        workspaceData({
          selectedDate: "2026-07-05",
          planningDays: [
            {
              id: "day-2",
              local_date: "2026-07-05",
              time_zone: "Europe/Brussels",
              current_snapshot_id: null,
              created_at: "2026-07-03T08:00:00Z",
            },
          ],
          day: {
            id: "day-2",
            local_date: "2026-07-05",
            time_zone: "Europe/Brussels",
            current_snapshot_id: null,
            created_at: "2026-07-03T08:00:00Z",
          },
          fixedEvents: [],
          snapshot: null,
        }),
      ),
    );
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    buttonByText(fixture, "Generate plan", "Generate schedule").click();
    fixture.detectChanges();
    routeParams.next(convertToParamMap({ date: "2026-07-05" }));
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();
    generateResponse.error(new HttpErrorResponse({ status: 503 }));
    fixture.detectChanges();

    expect(plannerApi.generatedPlanningDayIds).toEqual(["day-1"]);
    expect(text(fixture)).toContain("July 5, 2026");
    expect(text(fixture)).not.toContain("scheduler is unavailable");
    expect(text(fixture)).not.toContain("We could not generate the schedule");
  });

  it("requires a saved planning day before generating a plan", async () => {
    plannerApi.result = workspaceData({
      day: null,
      fixedEvents: [],
      tasks: [],
      snapshot: null,
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    (
      fixture.componentInstance as unknown as { generatePlan(): void }
    ).generatePlan();
    fixture.detectChanges();

    expect(text(fixture)).toContain("Save a planning day before generating");
    expect(plannerApi.generatedPlanningDayIds).toEqual([]);
  });

  it.each([
    [
      422,
      "The saved planning inputs could not produce a schedule. Review fixed events and task constraints, then try again.",
    ],
    [
      503,
      "The scheduler is unavailable right now. Saved inputs are unchanged; try again when scheduling is available.",
    ],
    [403, "Your session cannot generate this schedule."],
    [404, "That planning day is no longer available."],
    [500, "We could not generate the schedule."],
  ])("shows generate-plan error state for HTTP %s", async (status, message) => {
    plannerApi.result = workspaceData({ snapshot: null });
    plannerApi.generateError = new HttpErrorResponse({ status });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    buttonByText(fixture, "Generate plan", "Generate schedule").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain(message);
  });

  it("presents no-fit decisions as deferred work with scheduler-code wording", async () => {
    plannerApi.result = workspaceData({
      tasks: [task, taskThatDoesNotFit],
      snapshot: noFitSnapshot,
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    expect(text(fixture)).toContain("Deferred work");
    expect(text(fixture)).toContain("1");
    expect(text(fixture)).toContain("Deferred or unscheduled work");
    expect(text(fixture)).toContain("Prepare workshop");
    expect(text(fixture)).toContain(
      "Prepare workshop was not scheduled because there is not enough remaining time in the day.",
    );
    expect(text(fixture)).toContain("insufficient_remaining_day_time");
    expect(text(fixture)).toContain("Scheduler reason out_of_contract_reason.");
  });

  it("shows optional AI explanation without replacing scheduler wording", async () => {
    plannerApi.result = workspaceData({
      tasks: [task, studyTask],
      snapshot: revisedStudySnapshot,
    });
    plannerApi.explanationResponse = of({
      status: "explained",
      confidence: 0.7,
      explanation:
        "Study notes moved because the reported interruption reserved the earlier window.",
      deterministic_reason:
        "Study notes was moved after reported unavailable time.",
      reason_code: "moved_after_interruption",
      fallback_reason: null,
      error_code: null,
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    buttonByText(fixture, "Explain with AI", "Schedule reasons").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(plannerApi.explainedDecisions).toEqual([
      { planningDayId: "day-1", decisionId: "decision-moved-study" },
    ]);
    expect(text(fixture)).toContain(
      "Study notes was moved after reported unavailable time.",
    );
    expect(text(fixture)).toContain("moved_after_interruption");
    expect(text(fixture)).toContain("Optional AI explanation");
    expect(text(fixture)).toContain("Optional AI explanation ready.");
    expect(text(fixture)).toContain(
      "Study notes moved because the reported interruption reserved the earlier window.",
    );
  });

  it("keeps scheduler wording visible when AI explanation falls back", async () => {
    plannerApi.result = workspaceData({
      tasks: [task, studyTask],
      snapshot: revisedStudySnapshot,
    });
    plannerApi.explanationResponse = of({
      status: "fallback",
      confidence: 0,
      explanation: null,
      deterministic_reason:
        "Study notes was moved after reported unavailable time.",
      reason_code: "moved_after_interruption",
      fallback_reason: "timeout",
      error_code: "ai_service_timeout",
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    buttonByText(fixture, "Explain with AI", "Schedule reasons").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain(
      "Study notes was moved after reported unavailable time.",
    );
    expect(text(fixture)).toContain("moved_after_interruption");
    expect(text(fixture)).toContain("Optional AI explanation took too long.");
    expect(text(fixture)).toContain("timeout");
  });

  it("keeps scheduler wording visible when AI explanation request errors", async () => {
    plannerApi.result = workspaceData({
      tasks: [task, studyTask],
      snapshot: revisedStudySnapshot,
    });
    plannerApi.explanationError = new HttpErrorResponse({ status: 503 });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    buttonByText(fixture, "Explain with AI", "Schedule reasons").click();
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain(
      "Study notes was moved after reported unavailable time.",
    );
    expect(text(fixture)).toContain(
      "Optional AI explanation is unavailable. The scheduler reason remains available.",
    );
    expect(text(fixture)).toContain("service_unavailable");
  });

  it("preserves selected-date context when the API fails", async () => {
    plannerApi.error = new HttpErrorResponse({
      status: 503,
      statusText: "Service Unavailable",
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    expect(dayHeaderText(fixture)).toContain("July 4, 2026");
    expect(dayHeaderText(fixture)).toContain("Today");
    expect(inputValue(fixture, "#planner-date")).toBe(selectedDate);
    expect(text(fixture)).toContain("Planner data did not load");
    expect(text(fixture)).toContain("Your selected date is still here");
    expect(announcement(fixture)).toContain(
      "We could not load this planning day",
    );
  });

  it("announces permission failures without rendering another user's data", async () => {
    plannerApi.error = new HttpErrorResponse({
      status: 403,
      statusText: "Forbidden",
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    expect(dayHeaderText(fixture)).toContain("July 4, 2026");
    expect(dayHeaderText(fixture)).toContain("Today");
    expect(inputValue(fixture, "#planner-date")).toBe(selectedDate);
    expect(text(fixture)).toContain("We cannot open");
    expect(text(fixture)).toContain(
      "Your session cannot open this planning day",
    );
    expect(linkByText(fixture, "Sign in again")?.getAttribute("href")).toBe(
      "/sign-in?returnUrl=%2Fplanner%3Fdate%3D2026-07-04",
    );
    expect(text(fixture)).not.toContain("Team meeting");
  });

  it("updates the route when the user chooses a different day", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const dateInput = fixture.nativeElement.querySelector(
      "#planner-date",
    ) as HTMLInputElement;

    dateInput.value = "2026-07-05";
    dateInput.dispatchEvent(new Event("input", { bubbles: true }));
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector("form") as HTMLFormElement
    ).dispatchEvent(new SubmitEvent("submit", { bubbles: true }));

    expect(router.navigations).toEqual([
      {
        queryParams: {
          date: "2026-07-05",
          create: null,
          start: null,
          editTask: null,
          editFixedEvent: null,
        },
      },
    ]);
  });

  it("keeps the latest route date when an older load resolves after it", async () => {
    const firstLoad = new Subject<PlannerWorkspaceData>();
    const secondLoad = new Subject<PlannerWorkspaceData>();
    plannerApi.responses.set("2026-07-04", firstLoad);
    plannerApi.responses.set("2026-07-05", secondLoad);

    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    routeParams.next(convertToParamMap({ date: "2026-07-05" }));
    fixture.detectChanges();

    firstLoad.next(
      workspaceData({
        selectedDate: "2026-07-04",
        tasks: [{ ...task, title: "Stale task" }],
      }),
    );
    firstLoad.complete();
    fixture.detectChanges();

    expect(text(fixture)).toContain("Loading");
    expect(text(fixture)).not.toContain("Stale task");

    secondLoad.next(
      workspaceData({
        selectedDate: "2026-07-05",
        tasks: [{ ...task, title: "Current task" }],
      }),
    );
    secondLoad.complete();
    fixture.detectChanges();

    expect(plannerApi.loadedDates).toEqual(["2026-07-04", "2026-07-05"]);
    expect(text(fixture)).toContain("Current task");
    expect(text(fixture)).not.toContain("Stale task");
    expect(announcement(fixture)).toContain("July 5, 2026");
  });

  it("falls back to today when a route date has an impossible calendar day", async () => {
    routeParams = new BehaviorSubject(
      convertToParamMap({ date: "2026-02-31" }),
    );
    plannerApi.result = workspaceData({ snapshot: null });

    const fixture = await renderWorkspace(routeParams, plannerApi, router);
    const today = todayLocalDate();

    expect(plannerApi.loadedDates).toEqual([today]);
    expect(
      (query(fixture, "#planner-date") as HTMLInputElement | null)?.value,
    ).toBe(today);
  });

  it("blocks invalid task split settings before calling the API", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    await openNewTaskEditor(fixture);
    setInput(fixture, "#task-title", "Draft outline");
    setInput(fixture, "#task-estimate", "30");
    setInput(fixture, "#task-priority", "3");
    setCheckbox(fixture, "#task-splitting", true);
    formByLabel(fixture, "Flexible task details").dispatchEvent(submitEvent());
    fixture.detectChanges();

    expect(text(fixture)).toContain("Enter the minimum split segment.");
    expect(inputAriaDescribedBy(fixture, "#task-min-segment")).toBe(
      "task-min-segment-error",
    );
    expect(plannerApi.createdTasks).toEqual([]);
  });

  it("blocks invalid task priorities before calling the API", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    await openNewTaskEditor(fixture);
    setInput(fixture, "#task-title", "Draft outline");
    setInput(fixture, "#task-estimate", "30");
    setInput(fixture, "#task-priority", "6");
    formByLabel(fixture, "Flexible task details").dispatchEvent(submitEvent());
    fixture.detectChanges();

    expect(text(fixture)).toContain("Priority must be from 1 to 5.");
    expect(inputAriaDescribedBy(fixture, "#task-priority")).toBe(
      "task-priority-error",
    );
    expect(plannerApi.createdTasks).toEqual([]);
  });

  it("associates task estimate and time-zone validation errors with their fields", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    await openNewTaskEditor(fixture);
    setInput(fixture, "#task-title", "Draft outline");
    setInput(fixture, "#task-estimate", "0");
    setInput(fixture, "#task-priority", "3");
    updateTaskFormForTest(fixture, {
      earliestStartLocal: "2026-07-04T09:00",
      earliestStartTimeZone: "Not/AZone",
    });
    formByLabel(fixture, "Flexible task details").dispatchEvent(submitEvent());
    fixture.detectChanges();

    expect(text(fixture)).toContain("Estimate must be at least 1 minute.");
    expect(text(fixture)).toContain("Use a valid IANA time zone.");
    expect(inputAriaDescribedBy(fixture, "#task-estimate")).toBe(
      "task-estimate-error",
    );
    expect(inputAriaDescribedBy(fixture, "#task-earliest-zone")).toBe(
      "task-earliest-zone-error",
    );
    expect(plannerApi.createdTasks).toEqual([]);
  });

  it("renders invalid task due date and earliest start errors inline", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    await openNewTaskEditor(fixture);
    setInput(fixture, "#task-title", "Draft outline");
    setInput(fixture, "#task-estimate", "30");
    setInput(fixture, "#task-priority", "3");
    updateTaskFormForTest(fixture, {
      dueDate: "2026-02-31",
      earliestStartLocal: "2026-02-31T09:00",
    });
    formByLabel(fixture, "Flexible task details").dispatchEvent(submitEvent());
    fixture.detectChanges();

    expect(text(fixture)).toContain("Use a valid due date.");
    expect(text(fixture)).toContain("Use a valid earliest start time.");
    expect(inputAriaInvalid(fixture, "#task-due-date")).toBe("true");
    expect(inputAriaInvalid(fixture, "#task-earliest")).toBe("true");
    expect(plannerApi.createdTasks).toEqual([]);
  });

  it("maps task API 422 validation details to inline field errors", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    plannerApi.taskMutationError = new HttpErrorResponse({
      status: 422,
      statusText: "Unprocessable Entity",
      error: {
        detail: [
          {
            loc: ["body", "title"],
            msg: "String should have at most 200 characters",
          },
          {
            loc: ["body", "due_date"],
            msg: "Value error, due_date must be a date without a time",
          },
        ],
      },
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    await openNewTaskEditor(fixture);
    setInput(fixture, "#task-title", "Server rejected task");
    setInput(fixture, "#task-estimate", "30");
    setInput(fixture, "#task-priority", "3");
    formByLabel(fixture, "Flexible task details").dispatchEvent(submitEvent());
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain(
      "The API could not accept those details. Review the form and try again.",
    );
    expect(text(fixture)).toContain("Use 200 characters or fewer.");
    expect(text(fixture)).toContain("Use a date without a time.");
    expect(inputAriaInvalid(fixture, "#task-title")).toBe("true");
    expect(inputAriaInvalid(fixture, "#task-due-date")).toBe("true");
    expect(inputAriaDescribedBy(fixture, "#task-title")).toBe(
      "task-title-error",
    );
    expect(inputValue(fixture, "#task-title")).toBe("Server rejected task");
    expect(inputValue(fixture, "#task-estimate")).toBe("30");
    expect(inputValue(fixture, "#task-priority")).toBe("3");
  });

  it("defaults a new fixed event to the selected planning day's time zone", async () => {
    plannerApi.result = workspaceData({
      day: {
        id: "day-1",
        local_date: selectedDate,
        time_zone: "America/New_York",
        current_snapshot_id: null,
        created_at: "2026-07-03T08:00:00Z",
      },
      fixedEvents: [],
      snapshot: null,
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    await openNewFixedEventEditor(fixture);
    expect(inputValue(fixture, "#fixed-event-time-zone")).toBe(
      "America/New_York",
    );
  });

  it("trims fixed-event time zones before converting and submitting", async () => {
    plannerApi.result = workspaceData({ fixedEvents: [], snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    await openNewFixedEventEditor(fixture);
    setInput(fixture, "#fixed-event-title", "Trimmed event");
    setInput(fixture, "#fixed-event-start", "2026-07-04T09:00");
    setInput(fixture, "#fixed-event-end", "2026-07-04T10:00");
    setInput(fixture, "#fixed-event-time-zone", " Europe/Brussels ");
    formByLabel(fixture, "Fixed event details").dispatchEvent(submitEvent());
    fixture.detectChanges();
    await nextMicrotask();

    expect(plannerApi.savedFixedEvents).toEqual([
      {
        selectedDateValue: selectedDate,
        existingDay: workspaceData({ fixedEvents: [], snapshot: null }).day,
        request: {
          title: "Trimmed event",
          start_at: "2026-07-04T09:00:00+02:00",
          end_at: "2026-07-04T10:00:00+02:00",
          time_zone: "Europe/Brussels",
        },
      },
    ]);
  });

  it("blocks invalid fixed-event intervals before calling the API", async () => {
    plannerApi.result = workspaceData({ fixedEvents: [], snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    await openNewFixedEventEditor(fixture);
    setInput(fixture, "#fixed-event-title", "Backwards event");
    setInput(fixture, "#fixed-event-start", "2026-07-04T10:00");
    setInput(fixture, "#fixed-event-end", "2026-07-04T09:00");
    setInput(fixture, "#fixed-event-time-zone", "Europe/Brussels");
    formByLabel(fixture, "Fixed event details").dispatchEvent(submitEvent());
    fixture.detectChanges();

    expect(text(fixture)).toContain("End time must be after start time.");
    expect(inputAriaDescribedBy(fixture, "#fixed-event-end")).toBe(
      "fixed-event-end-error",
    );
    expect(plannerApi.savedFixedEvents).toEqual([]);
  });

  it("associates fixed-event start and time-zone validation errors with their fields", async () => {
    plannerApi.result = workspaceData({ fixedEvents: [], snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    await openNewFixedEventEditor(fixture);
    setInput(fixture, "#fixed-event-title", "Invalid event");
    setInput(fixture, "#fixed-event-start", "");
    setInput(fixture, "#fixed-event-end", "2026-07-04T10:00");
    setInput(fixture, "#fixed-event-time-zone", "Not/AZone");
    formByLabel(fixture, "Fixed event details").dispatchEvent(submitEvent());
    fixture.detectChanges();

    expect(text(fixture)).toContain("Enter a valid start time.");
    expect(text(fixture)).toContain("Use a valid IANA time zone.");
    expect(inputAriaDescribedBy(fixture, "#fixed-event-start")).toBe(
      "fixed-event-start-error",
    );
    expect(inputAriaDescribedBy(fixture, "#fixed-event-time-zone")).toBe(
      "fixed-event-time-zone-error",
    );
    expect(plannerApi.savedFixedEvents).toEqual([]);
  });

  it("edits a task, refreshes the workspace, and keeps user IDs out of payloads", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    await openExistingTaskEditor(fixture);
    setInput(fixture, "#task-title", "Write final report");
    setInput(fixture, "#task-estimate", "75");
    setInput(fixture, "#task-priority", "4");
    formByLabel(fixture, "Flexible task details").dispatchEvent(submitEvent());
    await settleEditorMutation(fixture);

    expect(plannerApi.updatedTasks).toEqual([
      {
        id: "task-1",
        request: {
          title: "Write final report",
          estimated_minutes: 75,
          priority: 4,
          due_date: null,
          earliest_start_at: null,
          splitting_allowed: false,
          min_segment_minutes: null,
        },
      },
    ]);
    expect(JSON.stringify(plannerApi.updatedTasks)).not.toContain("user-1");
    expect(plannerApi.loadedDates).toEqual([selectedDate, selectedDate]);
  });

  it("edits a fixed event, refreshes the workspace, and keeps user IDs out of payloads", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    await openExistingFixedEventEditor(fixture);
    setInput(fixture, "#fixed-event-title", "Planning review");
    setInput(fixture, "#fixed-event-start", "2026-07-04T11:00");
    setInput(fixture, "#fixed-event-end", "2026-07-04T12:00");
    formByLabel(fixture, "Fixed event details").dispatchEvent(submitEvent());
    await settleEditorMutation(fixture);

    expect(plannerApi.updatedFixedEvents).toEqual([
      {
        planningDayId: "day-1",
        fixedEventId: "event-1",
        request: {
          title: "Planning review",
          start_at: "2026-07-04T11:00:00+02:00",
          end_at: "2026-07-04T12:00:00+02:00",
          time_zone: "Europe/Brussels",
        },
      },
    ]);
    expect(JSON.stringify(plannerApi.updatedFixedEvents)).not.toContain(
      "user-1",
    );
    expect(plannerApi.loadedDates).toEqual([selectedDate, selectedDate]);
  });

  it("confirms deletion before removing a task and refreshing", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    await openExistingTaskEditor(fixture);
    buttonByText(fixture, "Delete task", "Flexible tasks").click();
    await settleEditorMutation(fixture);

    expect(confirm).toHaveBeenCalledWith(
      'Delete "Write report" from active flexible tasks?',
    );
    expect(plannerApi.deletedTasks).toEqual(["task-1"]);
    expect(plannerApi.loadedDates).toEqual([selectedDate, selectedDate]);
    confirm.mockRestore();
  });

  it("keeps a cancelled fixed-event deletion local", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    await openExistingFixedEventEditor(fixture);
    buttonByText(fixture, "Delete event", "Fixed events").click();

    expect(plannerApi.deletedFixedEvents).toEqual([]);
    expect(plannerApi.loadedDates).toEqual([selectedDate]);
    confirm.mockRestore();
  });

  it("confirms deletion before removing a fixed event and refreshing", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    await openExistingFixedEventEditor(fixture);
    buttonByText(fixture, "Delete event", "Fixed events").click();
    await settleEditorMutation(fixture);

    expect(confirm).toHaveBeenCalledWith(
      'Delete "Team meeting" from this planning day?',
    );
    expect(plannerApi.deletedFixedEvents).toEqual([
      { planningDayId: "day-1", fixedEventId: "event-1" },
    ]);
    expect(plannerApi.loadedDates).toEqual([selectedDate, selectedDate]);
    confirm.mockRestore();
  });

  it("surfaces fixed-event API conflicts inline without reloading", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    plannerApi.fixedEventMutationError = new HttpErrorResponse({
      status: 409,
      statusText: "Conflict",
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    await openExistingFixedEventEditor(fixture);
    setInput(fixture, "#fixed-event-title", "Overlap");
    formByLabel(fixture, "Fixed event details").dispatchEvent(submitEvent());
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain(
      "That change conflicts with another saved event for the day.",
    );
    expect(plannerApi.loadedDates).toEqual([selectedDate]);
  });

  it("maps fixed-event API 422 validation details to inline field errors", async () => {
    plannerApi.result = workspaceData({ snapshot: null });
    plannerApi.fixedEventMutationError = new HttpErrorResponse({
      status: 422,
      statusText: "Unprocessable Entity",
      error: {
        detail: [
          {
            loc: ["body", "time_zone"],
            msg: "String should have at most 64 characters",
          },
          {
            loc: ["body", "end_at"],
            msg: "Value error, end_at must be after start_at",
          },
        ],
      },
    });
    const fixture = await renderWorkspace(routeParams, plannerApi, router);

    await openExistingFixedEventEditor(fixture);
    setInput(fixture, "#fixed-event-title", "Server rejected event");
    formByLabel(fixture, "Fixed event details").dispatchEvent(submitEvent());
    fixture.detectChanges();
    await nextMicrotask();
    fixture.detectChanges();

    expect(text(fixture)).toContain(
      "The API could not accept those details. Review the form and try again.",
    );
    expect(text(fixture)).toContain("Use 64 characters or fewer.");
    expect(text(fixture)).toContain("End time must be after start time.");
    expect(inputAriaInvalid(fixture, "#fixed-event-time-zone")).toBe("true");
    expect(inputAriaInvalid(fixture, "#fixed-event-end")).toBe("true");
    expect(inputAriaDescribedBy(fixture, "#fixed-event-time-zone")).toBe(
      "fixed-event-time-zone-error",
    );
    expect(inputAriaDescribedBy(fixture, "#fixed-event-end")).toBe(
      "fixed-event-end-error",
    );
    expect(inputValue(fixture, "#fixed-event-title")).toBe(
      "Server rejected event",
    );
    expect(inputValue(fixture, "#fixed-event-start")).toBe("2026-07-04T09:00");
    expect(inputValue(fixture, "#fixed-event-end")).toBe("2026-07-04T10:00");
  });
});

class FakeApiClient {
  readonly responses = new Map<string, unknown>();
  readonly gets: string[] = [];
  readonly posts: Array<{ path: string; body: unknown }> = [];
  readonly puts: Array<{ path: string; body: unknown }> = [];
  readonly deletes: string[] = [];

  getJson<TResponse>(path: string): Observable<TResponse> {
    this.gets.push(path);

    if (!this.responses.has(path)) {
      throw new Error(`Unexpected GET ${path}`);
    }

    return of(this.responses.get(path) as TResponse);
  }

  postJson<TRequest, TResponse>(
    path: string,
    body: TRequest,
  ): Observable<TResponse> {
    this.posts.push({ path, body });

    if (!this.responses.has(path)) {
      throw new Error(`Unexpected POST ${path}`);
    }

    return of(this.responses.get(path) as TResponse);
  }

  postEmpty<TResponse>(path: string): Observable<TResponse> {
    this.posts.push({ path, body: null });

    if (!this.responses.has(path)) {
      throw new Error(`Unexpected POST ${path}`);
    }

    return of(this.responses.get(path) as TResponse);
  }

  putJson<TRequest, TResponse>(
    path: string,
    body: TRequest,
  ): Observable<TResponse> {
    this.puts.push({ path, body });

    if (!this.responses.has(path)) {
      throw new Error(`Unexpected PUT ${path}`);
    }

    return of(this.responses.get(path) as TResponse);
  }

  deleteEmpty(path: string): Observable<void> {
    this.deletes.push(path);
    const key = `DELETE ${path}`;

    if (!this.responses.has(key)) {
      throw new Error(`Unexpected DELETE ${path}`);
    }

    return of(this.responses.get(key) as void);
  }
}

class FakePlannerApi {
  result: PlannerWorkspaceData = workspaceData({ snapshot: null });
  error: unknown = null;
  readonly responses = new Map<string, Observable<PlannerWorkspaceData>>();
  readonly loadedDates: string[] = [];
  readonly createdTasks: unknown[] = [];
  readonly updatedTasks: unknown[] = [];
  readonly deletedTasks: string[] = [];
  readonly savedFixedEvents: unknown[] = [];
  readonly updatedFixedEvents: unknown[] = [];
  readonly deletedFixedEvents: unknown[] = [];
  readonly generatedPlanningDayIds: string[] = [];
  readonly recordedProgress: unknown[] = [];
  readonly reportedInterruptions: unknown[] = [];
  readonly parsedTasks: unknown[] = [];
  readonly parsedInterruptions: unknown[] = [];
  readonly explainedDecisions: unknown[] = [];
  taskMutationError: unknown = null;
  fixedEventMutationError: unknown = null;
  generateError: unknown = null;
  generateResponse: Observable<ScheduleSnapshot> | null = null;
  progressError: unknown = null;
  interruptionError: unknown = null;
  interruptionResponse: Observable<ScheduleSnapshot> | null = null;
  taskSuggestionResponse: Observable<unknown> | null = null;
  interruptionSuggestionResponse: Observable<unknown> | null = null;
  explanationResponse: Observable<unknown> | null = null;
  explanationError: unknown = null;

  loadWorkspaceDate(date: string): Observable<PlannerWorkspaceData> {
    this.loadedDates.push(date);

    const response = this.responses.get(date);
    if (response) {
      return response;
    }

    if (this.error !== null) {
      return throwError(() => this.error);
    }

    return of({ ...this.result, selectedDate: date });
  }

  createTask(request: unknown): Observable<Task> {
    this.createdTasks.push(request);
    if (this.taskMutationError !== null) {
      return throwError(() => this.taskMutationError);
    }
    return of({ ...task, ...(request as Partial<Task>) });
  }

  updateTask(id: string, request: unknown): Observable<Task> {
    this.updatedTasks.push({ id, request });
    if (this.taskMutationError !== null) {
      return throwError(() => this.taskMutationError);
    }
    return of({ ...task, id, ...(request as Partial<Task>) });
  }

  deleteTask(id: string): Observable<void> {
    this.deletedTasks.push(id);
    return of(undefined);
  }

  saveFixedEventForDate(
    selectedDateValue: string,
    existingDay: unknown,
    request: unknown,
  ): Observable<FixedEvent> {
    this.savedFixedEvents.push({ selectedDateValue, existingDay, request });
    if (this.fixedEventMutationError !== null) {
      return throwError(() => this.fixedEventMutationError);
    }
    return of({ ...fixedEvent, ...(request as Partial<FixedEvent>) });
  }

  updateFixedEvent(
    planningDayId: string,
    fixedEventId: string,
    request: unknown,
  ): Observable<FixedEvent> {
    this.updatedFixedEvents.push({ planningDayId, fixedEventId, request });
    if (this.fixedEventMutationError !== null) {
      return throwError(() => this.fixedEventMutationError);
    }
    return of({
      ...fixedEvent,
      id: fixedEventId,
      ...(request as Partial<FixedEvent>),
    });
  }

  deleteFixedEvent(
    planningDayId: string,
    fixedEventId: string,
  ): Observable<void> {
    this.deletedFixedEvents.push({ planningDayId, fixedEventId });
    return of(undefined);
  }

  generatePlan(planningDayId: string): Observable<ScheduleSnapshot> {
    this.generatedPlanningDayIds.push(planningDayId);
    if (this.generateResponse !== null) {
      return this.generateResponse;
    }
    if (this.generateError !== null) {
      return throwError(() => this.generateError);
    }
    return of(snapshot);
  }

  recordTaskProgress(
    planningDayId: string,
    request: unknown,
  ): Observable<TaskProgress> {
    this.recordedProgress.push({ planningDayId, request });
    if (this.progressError !== null) {
      return throwError(() => this.progressError);
    }
    return of({
      ...progressRecord,
      id: `progress-${this.recordedProgress.length}`,
      planning_day_id: planningDayId,
      ...(request as Partial<TaskProgress>),
    });
  }

  reportInterruption(
    planningDayId: string,
    request: unknown,
  ): Observable<ScheduleSnapshot> {
    this.reportedInterruptions.push({ planningDayId, request });
    if (this.interruptionResponse !== null) {
      return this.interruptionResponse;
    }
    if (this.interruptionError !== null) {
      return throwError(() => this.interruptionError);
    }
    return of({ ...canonicalSnapshot, id: "snapshot-revised", version: 3 });
  }

  parseTask(request: unknown): Observable<unknown> {
    this.parsedTasks.push(request);
    return (
      this.taskSuggestionResponse ??
      of({
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
        fallback_reason: "ai_disabled",
        error_code: "ai_disabled",
      })
    );
  }

  parseInterruption(request: unknown): Observable<unknown> {
    this.parsedInterruptions.push(request);
    return (
      this.interruptionSuggestionResponse ??
      of({
        status: "fallback",
        confidence: 0,
        proposed_fields: {
          start_at: null,
          end_at: null,
          time_zone: null,
          reported_at: null,
        },
        fallback_reason: "ai_disabled",
        error_code: "ai_disabled",
      })
    );
  }

  explainScheduleDecision(
    planningDayId: string,
    decisionId: string,
  ): Observable<unknown> {
    this.explainedDecisions.push({ planningDayId, decisionId });
    if (this.explanationError !== null) {
      return throwError(() => this.explanationError);
    }
    return (
      this.explanationResponse ??
      of({
        status: "fallback",
        confidence: 0,
        explanation: null,
        deterministic_reason: "Scheduler reason remains available.",
        reason_code: "placed_in_earliest_valid_window",
        fallback_reason: "ai_disabled",
        error_code: "ai_disabled",
      })
    );
  }
}

class FakeRouter {
  readonly navigations: Array<{
    queryParams: Record<string, string | null>;
  }> = [];

  navigate(
    _commands: unknown[],
    options: { queryParams: Record<string, string | null> },
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

async function renderWorkspace(
  queryParamMap: BehaviorSubject<ReturnType<typeof convertToParamMap>>,
  plannerApi: FakePlannerApi,
  router: FakeRouter,
): Promise<ComponentFixture<PlannerWorkspacePage>> {
  await TestBed.configureTestingModule({
    imports: [PlannerWorkspacePage],
    providers: [
      { provide: PlannerApiService, useValue: plannerApi },
      { provide: AuthSessionService, useValue: new FakeAuthSession() },
      {
        provide: ActivatedRoute,
        useValue: { queryParamMap },
      },
      { provide: Router, useValue: router },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(PlannerWorkspacePage);
  fixture.detectChanges();
  await Promise.resolve();
  fixture.detectChanges();

  return fixture;
}

function workspaceData(
  overrides: Partial<PlannerWorkspaceData>,
): PlannerWorkspaceData {
  const localDate = overrides.selectedDate ?? selectedDate;

  return {
    selectedDate: localDate,
    planningDays: [
      {
        id: "day-1",
        local_date: localDate,
        time_zone: "Europe/Brussels",
        current_snapshot_id: overrides.snapshot ? "snapshot-1" : null,
        created_at: "2026-07-03T08:00:00Z",
      },
    ],
    day: {
      id: "day-1",
      local_date: localDate,
      time_zone: "Europe/Brussels",
      current_snapshot_id: overrides.snapshot ? "snapshot-1" : null,
      created_at: "2026-07-03T08:00:00Z",
    },
    fixedEvents: [fixedEvent],
    tasks: [task],
    progress: [],
    snapshot: null,
    ...overrides,
  };
}

class FakeAuthSession {
  readonly currentUser = signalLike<AuthUser | null>(sampleUser);
}

function signalLike<T>(initialValue: T): (() => T) & { set(value: T): void } {
  let value = initialValue;
  const read = (() => value) as (() => T) & { set(value: T): void };
  read.set = (nextValue: T) => {
    value = nextValue;
  };

  return read;
}

function text<T>(fixture: ComponentFixture<T>): string {
  return fixture.nativeElement.textContent;
}

function announcement<T>(fixture: ComponentFixture<T>): string {
  return (
    fixture.nativeElement.querySelector(
      '[data-testid="planner-announcement"]',
    ) as HTMLElement
  ).textContent;
}

function query<T>(
  fixture: ComponentFixture<T>,
  selector: string,
): Element | null {
  return fixture.nativeElement.querySelector(selector);
}

function dayHeaderText<T>(fixture: ComponentFixture<T>): string {
  return (
    query(fixture, "[data-testid='day-workspace-header']")?.textContent ?? ""
  );
}

function dayHeaderSummaryText<T>(fixture: ComponentFixture<T>): string {
  return (
    query(fixture, "[data-testid='day-header-summary']")?.textContent ?? ""
  );
}

function timeRulerText<T>(fixture: ComponentFixture<T>): string {
  return query(fixture, "[data-testid='time-ruler']")?.textContent ?? "";
}

function selectedBlockDetailText<T>(fixture: ComponentFixture<T>): string {
  return (
    query(fixture, "[data-testid='selected-block-detail']")?.textContent ?? ""
  );
}

function scheduleBlockByKind<T>(
  fixture: ComponentFixture<T>,
  kind: string,
): HTMLElement {
  const block = query(
    fixture,
    `[data-testid='daily-timeline'] article[data-kind='${kind}']`,
  );

  if (block === null) {
    throw new Error(`Could not find schedule block with kind ${kind}`);
  }

  return block as HTMLElement;
}

function scheduleBlockById<T>(
  fixture: ComponentFixture<T>,
  itemId: string,
): HTMLElement {
  const block = query(
    fixture,
    `[data-testid='daily-timeline'] article[data-item-id='${itemId}']`,
  );

  if (block === null) {
    throw new Error(`Could not find schedule block with id ${itemId}`);
  }

  return block as HTMLElement;
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

function setInput<T>(
  fixture: ComponentFixture<T>,
  selector: string,
  value: string,
): void {
  const control = query(fixture, selector) as HTMLInputElement;
  control.value = value;
  control.dispatchEvent(new Event("input", { bubbles: true }));
  fixture.detectChanges();
}

function inputValue<T>(fixture: ComponentFixture<T>, selector: string): string {
  return (query(fixture, selector) as HTMLInputElement).value;
}

function inputAriaInvalid<T>(
  fixture: ComponentFixture<T>,
  selector: string,
): string | null {
  return (query(fixture, selector) as HTMLInputElement).getAttribute(
    "aria-invalid",
  );
}

function inputAriaDescribedBy<T>(
  fixture: ComponentFixture<T>,
  selector: string,
): string | null {
  return (query(fixture, selector) as HTMLInputElement).getAttribute(
    "aria-describedby",
  );
}

function updateTaskFormForTest(
  fixture: ComponentFixture<PlannerWorkspacePage>,
  patch: Record<string, unknown>,
): void {
  (
    fixture.componentInstance as unknown as {
      updateTaskForm(patch: Record<string, unknown>): void;
    }
  ).updateTaskForm(patch);
  fixture.detectChanges();
}

function setCheckbox<T>(
  fixture: ComponentFixture<T>,
  selector: string,
  checked: boolean,
): void {
  const control = query(fixture, selector) as HTMLInputElement;
  control.checked = checked;
  control.dispatchEvent(new Event("change", { bubbles: true }));
  fixture.detectChanges();
}

function formByLabel<T>(
  fixture: ComponentFixture<T>,
  label: string,
): HTMLFormElement {
  return query(fixture, `form[aria-label="${label}"]`) as HTMLFormElement;
}

function buttonByText<T>(
  fixture: ComponentFixture<T>,
  buttonText: string,
  regionLabel: string,
): HTMLButtonElement {
  const region = query(
    fixture,
    `[aria-labelledby="${regionIdForLabel(regionLabel)}"]`,
  );
  const buttons = Array.from(region?.querySelectorAll("button") ?? []);
  const button = buttons.find((candidate) =>
    candidate.textContent?.includes(buttonText),
  );

  if (!button) {
    throw new Error(`Could not find ${buttonText} button in ${regionLabel}`);
  }

  return button as HTMLButtonElement;
}

async function openNewTaskEditor(
  fixture: ComponentFixture<PlannerWorkspacePage>,
): Promise<void> {
  buttonByText(fixture, "Add task", "Flexible tasks").click();
  fixture.detectChanges();
  await nextMicrotask();
  fixture.detectChanges();
}

async function openNewFixedEventEditor(
  fixture: ComponentFixture<PlannerWorkspacePage>,
): Promise<void> {
  buttonByText(fixture, "Add event", "Fixed events").click();
  fixture.detectChanges();
  await nextMicrotask();
  fixture.detectChanges();
}

async function openExistingTaskEditor(
  fixture: ComponentFixture<PlannerWorkspacePage>,
): Promise<void> {
  buttonByText(fixture, "Edit", "Flexible tasks").click();
  fixture.detectChanges();
  await nextMicrotask();
  fixture.detectChanges();
}

async function openExistingFixedEventEditor(
  fixture: ComponentFixture<PlannerWorkspacePage>,
): Promise<void> {
  buttonByText(fixture, "Edit", "Fixed events").click();
  fixture.detectChanges();
  await nextMicrotask();
  fixture.detectChanges();
}

async function settleEditorMutation(
  fixture: ComponentFixture<PlannerWorkspacePage>,
): Promise<void> {
  fixture.detectChanges();
  await nextMicrotask();
  fixture.detectChanges();
  await nextMicrotask();
  fixture.detectChanges();
}

function buttonsByText(
  region: Element | null,
  buttonText: string,
): HTMLButtonElement[] {
  return Array.from(region?.querySelectorAll("button") ?? []).filter(
    (candidate): candidate is HTMLButtonElement =>
      candidate.textContent?.includes(buttonText) ?? false,
  );
}

function regionIdForLabel(regionLabel: string): string {
  switch (regionLabel) {
    case "Flexible tasks":
      return "tasks-title";
    case "Fixed events":
      return "fixed-events-title";
    case "Generate schedule":
      return "recovery-title";
    case "Schedule reasons":
      return "decisions-title";
    case "Work progress":
      return "progress-title";
    case "Report interruption":
      return "interruption-title";
    case "Calendar create":
      return "calendar-create-title";
    default:
      throw new Error(`Unknown region label ${regionLabel}`);
  }
}

function calendarSlot<T>(
  fixture: ComponentFixture<T>,
  slotId: string,
): HTMLButtonElement {
  const slot = query(
    fixture,
    `[data-calendar-slot='${slotId}']`,
  ) as HTMLButtonElement | null;

  if (slot === null) {
    throw new Error(`Could not find calendar slot ${slotId}`);
  }

  return slot;
}

function timelineBlocks<T>(fixture: ComponentFixture<T>): Array<{
  readonly kind: string;
  readonly top: number;
  readonly height: number;
  readonly compact: boolean;
  readonly laneIndex: number;
  readonly laneCount: number;
  readonly left: number;
  readonly width: number;
}> {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll(
      "[data-testid='daily-timeline'] article",
    ),
  ).map((element) => ({
    kind: element.getAttribute("data-kind") ?? "",
    top: Number(element.getAttribute("data-top-minutes") ?? "0"),
    height: Number(element.getAttribute("data-height-minutes") ?? "0"),
    compact: element.getAttribute("data-compact") === "true",
    laneIndex: Number(element.getAttribute("data-lane-index") ?? "0"),
    laneCount: Number(element.getAttribute("data-lane-count") ?? "1"),
    left: Number(element.getAttribute("data-left-percent") ?? "0"),
    width: Number(element.getAttribute("data-width-percent") ?? "100"),
  }));
}

function submitEvent(): SubmitEvent {
  return new SubmitEvent("submit", { bubbles: true, cancelable: true });
}

function keyboardEvent(
  type: string,
  key: string,
  options: KeyboardEventInit = {},
): KeyboardEvent {
  return new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    key,
    ...options,
  });
}

function todayLocalDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function expectedTimeRange(
  startAt: string,
  endAt: string,
  timeZone: string,
): string {
  return `${expectedTime(startAt, timeZone)}-${expectedTime(endAt, timeZone)}`;
}

function expectedTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

async function firstValue<T>(observable: Observable<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    observable.subscribe({ next: resolve, error: reject });
  });
}

async function nextMicrotask(): Promise<void> {
  await Promise.resolve();
}
