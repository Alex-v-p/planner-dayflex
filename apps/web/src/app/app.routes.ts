import { Routes } from "@angular/router";

import {
  redirectSignedInUser,
  requireAuthenticatedUser,
} from "./core/auth/auth.guard";
import { FoundationHomePage } from "./core/pages/foundation-home.page";
import { NotFoundPage } from "./core/pages/not-found.page";
import { StatusPage } from "./core/pages/status.page";
import { SignInPage } from "./features/auth/sign-in.page";
import { RegisterPage } from "./features/auth/register.page";
import { FreeTimesPage } from "./features/free-times/free-times.page";
import { PlannerOverviewPage } from "./features/planner/planner-overview.page";
import { PlannerWorkspacePage } from "./features/planner/planner-workspace.page";

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
    title: "Planner status",
  },
  {
    path: "sign-in",
    component: SignInPage,
    canActivate: [redirectSignedInUser],
    title: "Sign in",
  },
  {
    path: "register",
    component: RegisterPage,
    canActivate: [redirectSignedInUser],
    title: "Create account",
  },
  {
    path: "planner/week",
    component: PlannerOverviewPage,
    canActivate: [requireAuthenticatedUser],
    title: "Planner week overview",
    data: { overviewMode: "week" },
  },
  {
    path: "planner/month",
    component: PlannerOverviewPage,
    canActivate: [requireAuthenticatedUser],
    title: "Planner month overview",
    data: { overviewMode: "month" },
  },
  {
    path: "free-times",
    component: FreeTimesPage,
    canActivate: [requireAuthenticatedUser],
    title: "Free-time finder",
  },
  {
    path: "planner",
    component: PlannerWorkspacePage,
    canActivate: [requireAuthenticatedUser],
    title: "Planner workspace",
  },
  {
    path: "**",
    component: NotFoundPage,
    title: "Page not found",
  },
];
