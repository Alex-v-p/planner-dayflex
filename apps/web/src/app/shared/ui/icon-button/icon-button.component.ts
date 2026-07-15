import { Component, EventEmitter, Input, Output } from "@angular/core";

@Component({
  selector: "pdf-icon-button",
  standalone: true,
  templateUrl: "./icon-button.component.html",
})
export class IconButtonComponent {
  @Input({ required: true }) label = "";
  @Input({ required: true }) glyph = "";
  @Input() type: "button" | "submit" = "button";
  @Input() disabled = false;

  @Output() readonly pressed = new EventEmitter<void>();

  protected emitPressed(): void {
    if (!this.disabled) {
      this.pressed.emit();
    }
  }
}
