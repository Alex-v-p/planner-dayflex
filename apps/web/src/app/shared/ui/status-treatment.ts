export type PlannerStatusTreatment =
  | "task"
  | "fixed_event"
  | "interruption"
  | "buffer"
  | "designated_free_time"
  | "completed"
  | "moved"
  | "split"
  | "deferred"
  | "planned"
  | "incomplete"
  | "no_useful_free_time"
  | "empty";

export interface StatusTreatmentDefinition {
  readonly label: string;
  readonly cue: string;
  readonly description: string;
  readonly chipClass: string;
  readonly markerClass: string;
}

export const PLANNER_STATUS_TREATMENTS: Readonly<
  Record<PlannerStatusTreatment, StatusTreatmentDefinition>
> = {
  task: {
    label: "Work",
    cue: "W",
    description: "Flexible task work",
    chipClass: "border-meadow-600 bg-meadow-50 text-meadow-800",
    markerClass: "border-meadow-600 bg-meadow-50 text-meadow-800",
  },
  fixed_event: {
    label: "Fixed",
    cue: "F",
    description: "Fixed event",
    chipClass: "border-signal-600 bg-amber-50 text-signal-700",
    markerClass: "border-signal-600 bg-amber-50 text-signal-700",
  },
  interruption: {
    label: "Interrupted",
    cue: "!",
    description: "Reported unavailable time",
    chipClass: "border-rose-500 bg-rose-50 text-rose-800",
    markerClass: "border-rose-500 bg-rose-50 text-rose-800",
  },
  buffer: {
    label: "Buffer",
    cue: "B",
    description: "Transition buffer",
    chipClass: "border-mist-300 bg-mist-100 text-ink-700",
    markerClass: "border-mist-300 bg-mist-100 text-ink-700",
  },
  designated_free_time: {
    label: "Free",
    cue: "O",
    description: "Designated free time",
    chipClass: "border-sky-500 bg-sky-50 text-sky-800",
    markerClass: "border-sky-500 bg-sky-50 text-sky-800",
  },
  completed: {
    label: "Done",
    cue: "OK",
    description: "Completed work",
    chipClass: "border-teal-600 bg-teal-50 text-teal-800",
    markerClass: "border-teal-600 bg-teal-50 text-teal-800",
  },
  moved: {
    label: "Moved",
    cue: "M",
    description: "Moved after interruption",
    chipClass: "border-indigo-500 bg-indigo-50 text-indigo-800",
    markerClass: "border-indigo-500 bg-indigo-50 text-indigo-800",
  },
  split: {
    label: "Split",
    cue: "S",
    description: "Split across available windows",
    chipClass: "border-sky-600 bg-sky-50 text-sky-800",
    markerClass: "border-sky-600 bg-sky-50 text-sky-800",
  },
  deferred: {
    label: "Deferred",
    cue: "D",
    description: "Deferred or unscheduled work",
    chipClass: "border-signal-600 bg-orange-50 text-signal-700",
    markerClass: "border-signal-600 bg-orange-50 text-signal-700",
  },
  planned: {
    label: "Planned",
    cue: "P",
    description: "Generated schedule snapshot",
    chipClass: "border-meadow-600 bg-meadow-50 text-meadow-800",
    markerClass: "border-meadow-600 bg-meadow-50 text-meadow-800",
  },
  incomplete: {
    label: "Inputs",
    cue: "I",
    description: "Saved inputs without a generated schedule",
    chipClass: "border-signal-600 bg-amber-50 text-signal-700",
    markerClass: "border-signal-600 bg-amber-50 text-signal-700",
  },
  no_useful_free_time: {
    label: "No free time",
    cue: "0",
    description: "Current snapshot without a useful free-time window",
    chipClass: "border-mist-300 bg-mist-100 text-ink-800",
    markerClass: "border-mist-300 bg-mist-100 text-ink-800",
  },
  empty: {
    label: "Empty",
    cue: "-",
    description: "No saved planning day",
    chipClass: "border-mist-300 bg-white text-ink-600",
    markerClass: "border-mist-300 bg-white text-ink-600",
  },
};

export function statusTreatmentFor(status: string): StatusTreatmentDefinition {
  return (
    PLANNER_STATUS_TREATMENTS[status as PlannerStatusTreatment] ??
    PLANNER_STATUS_TREATMENTS.empty
  );
}
