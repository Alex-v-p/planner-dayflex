import { Component, EventEmitter, Input, Output } from "@angular/core";

export interface SegmentedControlOption {
  readonly label: string;
  readonly value: string;
  readonly ariaLabel?: string;
}

@Component({
  selector: "pdf-segmented-control",
  standalone: true,
  templateUrl: "./segmented-control.component.html",
})
export class SegmentedControlComponent {
  @Input({ required: true }) options: readonly SegmentedControlOption[] = [];
  @Input({ required: true }) selected = "";
  @Input() ariaLabel = "View switcher";

  @Output() readonly selectedChange = new EventEmitter<string>();

  protected choose(value: string): void {
    if (value !== this.selected) {
      this.selectedChange.emit(value);
    }
  }
}
