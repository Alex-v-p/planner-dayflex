import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const uiRoot = dirname(fileURLToPath(import.meta.url));

describe("shared UI primitives", () => {
  it("prevents busy action buttons from double-submitting and announces busy state", () => {
    const template = readTemplate("action-button/action-button.component.html");

    expect(template).toContain('[disabled]="isDisabled"');
    expect(template).toContain('[attr.aria-busy]="busy"');
    expect(template).toContain('aria-hidden="true"');
  });

  it("uses assertive alerts only for error feedback", () => {
    const source = readFileSync(
      join(uiRoot, "feedback-message/feedback-message.component.ts"),
      "utf8",
    );

    expect(source).toContain('this.state === "error" ? "alert" : "status"');
  });

  it("connects text field helper copy with the input when helper text is present", () => {
    const template = readTemplate("text-field/text-field.component.html");

    expect(template).toContain('[for]="fieldId"');
    expect(template).toContain('[id]="fieldId"');
    expect(template).toContain(
      '[attr.aria-describedby]="helperText ? helperId : null"',
    );
    expect(template).toContain('[id]="helperId"');
  });
});

function readTemplate(relativePath: string): string {
  return readFileSync(join(uiRoot, relativePath), "utf8");
}
