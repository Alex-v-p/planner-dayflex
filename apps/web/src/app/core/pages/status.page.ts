import { Component, inject } from "@angular/core";

import { AppConfigService } from "../config/app-config.service";

@Component({
  selector: "pdf-status",
  standalone: true,
  templateUrl: "./status.page.html",
})
export class StatusPage {
  private readonly config = inject(AppConfigService);

  protected get apiBaseUrl(): string {
    return this.config.apiBaseUrl;
  }
}
