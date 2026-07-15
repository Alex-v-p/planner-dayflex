import { Component, EventEmitter, Input, Output } from "@angular/core";

@Component({
  selector: "pdf-action-button",
  standalone: true,
  templateUrl: "./action-button.component.html",
})
export class ActionButtonComponent {
  @Input({ required: true }) label = "";
  @Input() type: "button" | "submit" = "button";
  @Input() disabled = false;
  @Input() busy = false;

  @Output() readonly pressed = new EventEmitter<void>();

  protected get isDisabled(): boolean {
    return this.disabled || this.busy;
  }

  protected emitPressed(): void {
    if (!this.isDisabled) {
      this.pressed.emit();
    }
  }
}
