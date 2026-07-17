import { Component, Input } from "@angular/core";

import {
  PlannerStatusTreatment,
  statusTreatmentFor,
} from "../status-treatment";

@Component({
  selector: "pdf-status-chip",
  standalone: true,
  host: {
    class: "inline-flex max-w-full align-top",
  },
  templateUrl: "./status-chip.component.html",
})
export class StatusChipComponent {
  @Input({ required: true }) status: PlannerStatusTreatment | string = "empty";
  @Input() label = "";

  protected get treatment() {
    return statusTreatmentFor(this.status);
  }

  protected get displayLabel(): string {
    return this.label || this.treatment.label;
  }
}
