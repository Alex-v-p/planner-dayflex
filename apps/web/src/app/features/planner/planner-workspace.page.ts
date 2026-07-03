import { Component, inject } from "@angular/core";

import { AuthSessionService } from "../../core/auth/auth-session.service";

@Component({
  selector: "pdf-planner-workspace-page",
  standalone: true,
  templateUrl: "./planner-workspace.page.html",
})
export class PlannerWorkspacePage {
  protected readonly auth = inject(AuthSessionService);
}
