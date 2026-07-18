import { Component } from "@angular/core";

@Component({
  selector: "pdf-status",
  standalone: true,
  templateUrl: "./status.page.html",
})
export class StatusPage {
  protected readonly plannerStatus = "Ready";
  protected readonly connectionStatus = "Ready to load saved days";
}
