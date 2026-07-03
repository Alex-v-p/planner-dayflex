import { Component } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";

import { SHELL_NAV_ITEMS } from "./nav-item";

@Component({
  selector: "pdf-shell",
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: "./shell.component.html",
})
export class ShellComponent {
  protected readonly navItems = SHELL_NAV_ITEMS;
}
