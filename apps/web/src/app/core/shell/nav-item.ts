export interface ShellNavItem {
  readonly label: string;
  readonly path: string;
  readonly ariaLabel: string;
  readonly shortLabel: string;
  readonly section: "plan" | "system";
}

export const SHELL_NAV_ITEMS: readonly ShellNavItem[] = [
  {
    label: "Day",
    path: "/planner",
    ariaLabel: "Open planner workspace",
    shortLabel: "Day",
    section: "plan",
  },
  {
    label: "Week",
    path: "/planner/week",
    ariaLabel: "Open planner week overview",
    shortLabel: "Week",
    section: "plan",
  },
  {
    label: "Month",
    path: "/planner/month",
    ariaLabel: "Open planner month overview",
    shortLabel: "Month",
    section: "plan",
  },
  {
    label: "Free time",
    path: "/free-times",
    ariaLabel: "Open free-time finder",
    shortLabel: "Free",
    section: "plan",
  },
  {
    label: "Overview",
    path: "/",
    ariaLabel: "Open application overview",
    shortLabel: "Home",
    section: "system",
  },
  {
    label: "Status",
    path: "/status",
    ariaLabel: "Open application status",
    shortLabel: "Status",
    section: "system",
  },
];
