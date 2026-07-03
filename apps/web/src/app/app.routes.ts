import { Routes } from "@angular/router";

import { FoundationHomePage } from "./core/pages/foundation-home.page";
import { NotFoundPage } from "./core/pages/not-found.page";
import { StatusPage } from "./core/pages/status.page";

export const routes: Routes = [
  {
    path: "",
    pathMatch: "full",
    component: FoundationHomePage,
    title: "Planner Dayflex",
  },
  {
    path: "status",
    component: StatusPage,
    title: "Application status",
  },
  {
    path: "**",
    component: NotFoundPage,
    title: "Page not found",
  },
];
