import { describe, expect, it } from "vitest";

import {
  compactPlanStateLabel,
  decisionReasonLabel,
  decisionReasonText,
  planSourceLabel,
  planStateLabel,
  scheduleKindFallbackReason,
} from "./planner-copy";

const backendCopyPattern =
  /\b(deterministic|snapshot|scheduler|reason code|reason_code|DTO|version|fallback|error_code)\b/i;

describe("planner copy helpers", () => {
  it("labels current and revised plans without exposing snapshot versions", () => {
    expect(planStateLabel(null)).toBe("No plan yet");
    expect(planStateLabel({ version: 1, items: [], decisions: [] })).toBe(
      "Plan ready",
    );
    expect(
      planStateLabel({
        version: 2,
        items: [{ kind: "interruption" }],
        decisions: [],
      }),
    ).toBe("Revised plan");
    expect(
      planStateLabel({
        version: 2,
        items: [],
        decisions: [
          {
            reason_code: "moved_after_interruption",
            task_id: "task-1",
          },
        ],
      }),
    ).toBe("Revised plan");
    expect(
      compactPlanStateLabel({
        snapshot_id: "snapshot-1",
        snapshot_version: 4,
      }),
    ).toBe("Plan ready");
    expect(
      compactPlanStateLabel({
        snapshot_id: null,
        snapshot_version: null,
      }),
    ).toBe("No plan yet");
  });

  it("maps scheduler reason codes to calm planner text", () => {
    expect(decisionReasonLabel("moved_after_interruption")).toBe("Moved later");
    expect(decisionReasonText("moved_after_interruption", "Study notes")).toBe(
      "Study notes moved later after unavailable time was added.",
    );
    expect(
      decisionReasonText("insufficient_time_before_deadline", "Buy groceries"),
    ).toBe("Buy groceries has no room before its deadline.");
    expect(decisionReasonText("out_of_contract_reason")).toBe(
      "This saved planning result has an explanation available.",
    );
    expect(decisionReasonText("warning:locked_overlap")).toBe(
      "A planning note is available for this result.",
    );
  });

  it("keeps plan source labels user-facing", () => {
    expect(
      planSourceLabel(
        {
          snapshot_id: "snapshot-1",
          snapshot_version: 2,
          snapshot_created_at: "2026-07-01T08:00:00Z",
        },
        () => "Jul 1, 2026, 10:00 AM",
      ),
    ).toBe("Current plan, saved Jul 1, 2026, 10:00 AM");
    expect(
      planSourceLabel(
        {
          snapshot_id: null,
          snapshot_version: null,
          snapshot_created_at: null,
        },
        () => "",
      ),
    ).toBe("No plan yet");
  });

  it("describes block fallbacks without storage wording", () => {
    expect(scheduleKindFallbackReason("task")).toBe(
      "This work is included in the current plan.",
    );
    expect(scheduleKindFallbackReason("fixed_event")).toBe(
      "Fixed events reserve this time.",
    );
    expect(scheduleKindFallbackReason("interruption")).toBe(
      "Reported unavailable time reserves this time.",
    );
    expect(scheduleKindFallbackReason("buffer")).toBe(
      "Buffer time was preserved between scheduled blocks.",
    );
    expect(scheduleKindFallbackReason("designated_free_time")).toBe(
      "A remaining useful window was kept as free time.",
    );
  });

  it("keeps helper output free of backend vocabulary", () => {
    const outputs = [
      planStateLabel(null),
      planStateLabel({ version: 1, items: [], decisions: [] }),
      planStateLabel({
        version: 3,
        items: [],
        decisions: [
          {
            reason_code: "blocked_by_interruption",
            task_id: "task-1",
          },
        ],
      }),
      compactPlanStateLabel({
        snapshot_id: "snapshot-1",
        snapshot_version: 2,
      }),
      planSourceLabel(
        {
          snapshot_id: "snapshot-1",
          snapshot_version: 2,
          snapshot_created_at: "2026-07-01T08:00:00Z",
        },
        () => "Jul 1, 2026, 10:00 AM",
      ),
      decisionReasonLabel("placed_in_earliest_valid_window"),
      decisionReasonLabel("warning:locked_overlap"),
      decisionReasonText("blocked_by_interruption", "Study notes"),
      decisionReasonText("warning:locked_overlap"),
      decisionReasonText("unknown_backend_reason"),
      scheduleKindFallbackReason("designated_free_time"),
      scheduleKindFallbackReason("unknown_backend_kind"),
    ];

    for (const output of outputs) {
      expect(output).not.toMatch(backendCopyPattern);
    }
  });
});
