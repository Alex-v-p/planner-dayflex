export interface ShellNavItem {
  readonly label: string;
  readonly path: string;
  readonly ariaLabel: string;
}

export const SHELL_NAV_ITEMS: readonly ShellNavItem[] = [
  {
    label: "Overview",
    path: "/",
    ariaLabel: "Open application overview",
  },
  {
    label: "Status",
    path: "/status",
    ariaLabel: "Open application status",
  },
  {
    label: "Planner",
    path: "/planner",
    ariaLabel: "Open planner workspace",
  },
];
