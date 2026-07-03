import { Component, Input } from "@angular/core";

@Component({
  selector: "pdf-text-field",
  standalone: true,
  templateUrl: "./text-field.component.html",
})
export class TextFieldComponent {
  @Input({ required: true }) label = "";
  @Input() value = "";
  @Input() helperText = "";
  @Input() placeholder = "";
  @Input() disabled = false;
  @Input() required = false;

  protected readonly fieldId = `pdf-text-field-${crypto.randomUUID()}`;

  protected get helperId(): string {
    return `${this.fieldId}-helper`;
  }
}
