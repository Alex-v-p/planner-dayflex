import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Type } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { BlockTypeMarkerComponent } from "./block-type-marker/block-type-marker.component";
import { IconButtonComponent } from "./icon-button/icon-button.component";
import { SegmentedControlComponent } from "./segmented-control/segmented-control.component";
import { StatusChipComponent } from "./status-chip/status-chip.component";
import { SummaryValueComponent } from "./summary-value/summary-value.component";
import { PLANNER_STATUS_TREATMENTS } from "./status-treatment";

const uiRoot = dirname(fileURLToPath(import.meta.url));

describe("shared UI primitives", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        BlockTypeMarkerComponent,
        IconButtonComponent,
        SegmentedControlComponent,
        StatusChipComponent,
        SummaryValueComponent,
      ],
    }).compileComponents();
  });

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

  it("documents non-color planner status treatments with labels and cues", () => {
    const source = readFileSync(join(uiRoot, "status-treatment.ts"), "utf8");

    for (const status of [
      "task",
      "fixed_event",
      "interruption",
      "buffer",
      "designated_free_time",
      "completed",
      "moved",
      "deferred",
    ]) {
      expect(source).toContain(`${status}:`);
    }
    expect(source).toContain("cue:");
    expect(source).toContain("description:");

    for (const [status, treatment] of Object.entries(
      PLANNER_STATUS_TREATMENTS,
    )) {
      expect(status).toBeTruthy();
      expect(treatment.label).toBeTruthy();
      expect(treatment.cue).toBeTruthy();
      expect(treatment.description).toBeTruthy();
      expect(treatment.chipClass).toContain("border-");
      expect(treatment.markerClass).toContain("border-");
    }
  });

  it("keeps segmented controls and icon buttons accessible", () => {
    const segmentedTemplate = readTemplate(
      "segmented-control/segmented-control.component.html",
    );
    const iconTemplate = readTemplate("icon-button/icon-button.component.html");

    expect(segmentedTemplate).toContain('role="group"');
    expect(segmentedTemplate).toContain("[attr.aria-pressed]");
    expect(segmentedTemplate).toContain('(click)="choose(option.value)"');
    expect(iconTemplate).toContain('[attr.aria-label]="label"');
    expect(iconTemplate).toContain('[title]="label"');
  });

  it("renders status chips and block markers with text cues", async () => {
    const chip = await render(StatusChipComponent, {
      status: "interruption",
      label: "Unavailable",
    });
    const marker = await render(BlockTypeMarkerComponent, {
      status: "designated_free_time",
    });

    expect(text(chip)).toContain("!");
    expect(text(chip)).toContain("Unavailable");
    expect(element(chip, "span")?.getAttribute("aria-label")).toContain(
      "Reported unavailable time",
    );
    expect(text(marker)).toContain("O");
    expect(text(marker)).toContain("Free");
    expect(element(marker, "span")?.getAttribute("aria-label")).toContain(
      "Designated free time",
    );
  });

  it("renders compact summary values with optional notes", async () => {
    const fixture = await render(SummaryValueComponent, {
      label: "Free time",
      value: "1 hr",
      note: "After 3:00 PM",
    });

    expect(text(fixture)).toContain("Free time");
    expect(text(fixture)).toContain("1 hr");
    expect(text(fixture)).toContain("After 3:00 PM");
  });

  it("emits segmented control and icon button actions from user input", async () => {
    const segmented = await render(SegmentedControlComponent, {
      options: [
        { label: "Day", value: "day" },
        { label: "Week", value: "week" },
      ],
      selected: "day",
      ariaLabel: "Planner view",
    });
    const selectedValues: string[] = [];
    segmented.componentInstance.selectedChange.subscribe((value) =>
      selectedValues.push(value),
    );

    buttons(segmented)
      .find((button) => button.textContent?.includes("Week"))
      ?.click();

    const icon = await render(IconButtonComponent, {
      label: "Next day",
      glyph: ">",
    });
    let presses = 0;
    icon.componentInstance.pressed.subscribe(() => {
      presses += 1;
    });
    button(icon).click();

    expect(selectedValues).toEqual(["week"]);
    expect(presses).toBe(1);
    expect(button(icon).getAttribute("aria-label")).toBe("Next day");
    expect(button(icon).getAttribute("title")).toBe("Next day");
  });
});

function readTemplate(relativePath: string): string {
  return readFileSync(join(uiRoot, relativePath), "utf8");
}

async function render<T>(
  component: Type<T>,
  inputs: Record<string, unknown>,
): Promise<ComponentFixture<T>> {
  const fixture = TestBed.createComponent(component);

  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  fixture.detectChanges();

  return fixture;
}

function text<T>(fixture: ComponentFixture<T>): string {
  return fixture.nativeElement.textContent;
}

function element<T>(
  fixture: ComponentFixture<T>,
  selector: string,
): Element | null {
  return fixture.nativeElement.querySelector(selector);
}

function buttons<T>(fixture: ComponentFixture<T>): HTMLButtonElement[] {
  return Array.from(
    fixture.nativeElement.querySelectorAll("button"),
  ) as HTMLButtonElement[];
}

function button<T>(fixture: ComponentFixture<T>): HTMLButtonElement {
  return buttons(fixture)[0];
}
