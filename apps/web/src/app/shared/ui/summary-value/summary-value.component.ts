import { Component, Input } from "@angular/core";

@Component({
  selector: "pdf-summary-value",
  standalone: true,
  templateUrl: "./summary-value.component.html",
})
export class SummaryValueComponent {
  @Input({ required: true }) label = "";
  @Input({ required: true }) value = "";
  @Input() note = "";
}
