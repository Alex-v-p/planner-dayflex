import { Component } from "@angular/core";

import { ShellComponent } from "./core/shell/shell.component";

@Component({
  selector: "pdf-root",
  standalone: true,
  imports: [ShellComponent],
  template: "<pdf-shell />",
})
export class AppComponent {}
