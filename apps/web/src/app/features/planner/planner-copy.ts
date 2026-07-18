export interface PlannerCopyDecision {
  readonly reason_code: string;
  readonly task_id: string | null;
}

export interface PlannerCopySnapshot {
  readonly version: number;
  readonly items: readonly { readonly kind: string }[];
  readonly decisions: readonly PlannerCopyDecision[];
}

export interface PlannerCopyPlanSource {
  readonly snapshot_id: string | null;
  readonly snapshot_version: number | null;
  readonly snapshot_created_at?: string | null;
}

export function planStateLabel(snapshot: PlannerCopySnapshot | null): string {
  if (snapshot === null) {
    return "No plan yet";
  }

  return hasRecoveryEvidence(snapshot) ? "Revised plan" : "Plan ready";
}

export function compactPlanStateLabel(source: PlannerCopyPlanSource): string {
  return source.snapshot_id === null || source.snapshot_version === null
    ? "No plan yet"
    : "Plan ready";
}

export function planSourceLabel(
  source: PlannerCopyPlanSource,
  formatCreatedAt: (value: string) => string,
): string {
  if (source.snapshot_id === null || source.snapshot_version === null) {
    return "No plan yet";
  }

  return source.snapshot_created_at
    ? `Current plan, saved ${formatCreatedAt(source.snapshot_created_at)}`
    : "Current plan";
}

export function decisionReasonText(
  reasonCode: string,
  subject = "This plan",
): string {
  switch (reasonCode) {
    case "placed_in_earliest_valid_window":
      return `${subject} fits in the first available time.`;
    case "moved_after_interruption":
      return `${subject} moved later after unavailable time was added.`;
    case "split_across_available_windows":
      return `${subject} was split around available time.`;
    case "blocked_by_fixed_event":
      return `${subject} could not fit because fixed events reserve that time.`;
    case "blocked_by_interruption":
      return `${subject} could not fit because unavailable time reserves that part of the day.`;
    case "missed_before_current_time":
      return `${subject} could not stay in time that has already passed.`;
    case "insufficient_time_before_deadline":
      return `${subject} has no room before its deadline.`;
    case "insufficient_remaining_day_time":
      return `${subject} has no room left today.`;
    case "designated_free_time":
      return "Useful free time remains in the plan.";
    case "locked_time_overlap_merged":
      return "Overlapping reserved time was counted once.";
    default:
      return reasonCode.startsWith("warning:")
        ? "A planning note is available for this result."
        : "This saved planning result has an explanation available.";
  }
}

export function decisionReasonLabel(reasonCode: string): string {
  switch (reasonCode) {
    case "placed_in_earliest_valid_window":
      return "Placed";
    case "moved_after_interruption":
      return "Moved later";
    case "split_across_available_windows":
      return "Split around time";
    case "blocked_by_fixed_event":
      return "Fixed event reserved time";
    case "blocked_by_interruption":
      return "Unavailable time";
    case "missed_before_current_time":
      return "Time already passed";
    case "insufficient_time_before_deadline":
      return "No room before deadline";
    case "insufficient_remaining_day_time":
      return "No room left today";
    case "designated_free_time":
      return "Useful free time";
    case "locked_time_overlap_merged":
      return "Reserved time combined";
    default:
      return reasonCode.startsWith("warning:") ? "Planning note" : "Saved note";
  }
}

export function scheduleKindFallbackReason(kind: string): string {
  switch (kind) {
    case "task":
      return "This work is included in the current plan.";
    case "fixed_event":
      return "Fixed events reserve this time.";
    case "interruption":
      return "Reported unavailable time reserves this time.";
    case "buffer":
      return "Buffer time was preserved between scheduled blocks.";
    case "designated_free_time":
      return "A remaining useful window was kept as free time.";
    default:
      return "This block is included in the current plan.";
  }
}

function hasRecoveryEvidence(snapshot: PlannerCopySnapshot): boolean {
  return (
    snapshot.version > 1 &&
    (snapshot.items.some((item) => item.kind === "interruption") ||
      snapshot.decisions.some(
        (decision) =>
          decision.reason_code === "blocked_by_interruption" ||
          decision.reason_code === "moved_after_interruption",
      ))
  );
}
