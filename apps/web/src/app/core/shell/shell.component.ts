import { Component, OnInit, inject } from "@angular/core";
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router";

import { AuthSessionService } from "../auth/auth-session.service";
import { SHELL_NAV_ITEMS } from "./nav-item";

@Component({
  selector: "pdf-shell",
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: "./shell.component.html",
})
export class ShellComponent implements OnInit {
  protected readonly auth = inject(AuthSessionService);
  protected readonly plannerNavItems = SHELL_NAV_ITEMS.filter(
    (item) => item.section === "plan",
  );
  protected readonly systemNavItems = SHELL_NAV_ITEMS.filter(
    (item) => item.section === "system",
  );
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.auth.restoreSession().subscribe({
      error: () => {
        // Keep the shell usable if the API is temporarily unavailable.
      },
    });
  }

  protected signOut(): void {
    this.auth.signOut().subscribe({
      next: () => {
        void this.router.navigateByUrl("/sign-in");
      },
    });
  }
}
