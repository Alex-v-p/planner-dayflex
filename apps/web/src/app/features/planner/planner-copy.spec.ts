import { describe, expect, it } from "vitest";

import {
  decisionReasonLabel,
  decisionReasonText,
  planSourceLabel,
  planStateLabel,
  scheduleKindFallbackReason,
} from "./planner-copy";

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
    expect(scheduleKindFallbackReason("designated_free_time")).toBe(
      "A remaining useful window was kept as free time.",
    );
  });
});
