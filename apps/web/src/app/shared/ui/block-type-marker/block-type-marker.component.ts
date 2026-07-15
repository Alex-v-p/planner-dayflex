import { Component, Input } from "@angular/core";

import {
  PlannerStatusTreatment,
  statusTreatmentFor,
} from "../status-treatment";

@Component({
  selector: "pdf-block-type-marker",
  standalone: true,
  templateUrl: "./block-type-marker.component.html",
})
export class BlockTypeMarkerComponent {
  @Input({ required: true }) status: PlannerStatusTreatment | string = "empty";
  @Input() label = "";

  protected get treatment() {
    return statusTreatmentFor(this.status);
  }

  protected get displayLabel(): string {
    return this.label || this.treatment.label;
  }
}
