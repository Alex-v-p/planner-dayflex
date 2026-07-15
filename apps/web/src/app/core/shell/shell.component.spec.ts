import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SHELL_NAV_ITEMS } from "./nav-item";

const shellDirectory = dirname(fileURLToPath(import.meta.url));
const appDirectory = join(shellDirectory, "../..");
const shellTemplate = readFileSync(
  join(shellDirectory, "shell.component.html"),
  "utf8",
);
const shellSource = readFileSync(
  join(shellDirectory, "shell.component.ts"),
  "utf8",
);
const routesSource = readFileSync(join(appDirectory, "app.routes.ts"), "utf8");

describe("ShellComponent", () => {
  it("keeps primary navigation pointed at configured application routes", () => {
    const routePaths = [...routesSource.matchAll(/path:\s*"([^"]*)"/g)]
      .map((match) => match[1])
      .filter((path) => path !== "**")
      .map((path) => `/${path}`)
      .map((path) => (path === "/" ? path : path.replace(/\/$/, "")));

    expect(routePaths).toEqual(
      expect.arrayContaining(SHELL_NAV_ITEMS.map((item) => item.path)),
    );
    expect(SHELL_NAV_ITEMS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Day",
          path: "/planner",
          ariaLabel: expect.stringContaining("Open"),
          shortLabel: expect.any(String),
          section: "plan",
        }),
      ]),
    );
  });

  it("exposes keyboard and screen reader navigation landmarks", () => {
    expect(shellTemplate).toContain('href="#main-content"');
    expect(shellTemplate).toContain('id="main-content"');
    expect(shellTemplate).toContain('aria-label="Primary navigation"');
    expect(shellTemplate).toContain('aria-label="Mobile planner navigation"');
    expect(shellTemplate).toContain('aria-label="Calendar app navigation"');
    expect(shellTemplate).toContain('ariaCurrentWhenActive="page"');
  });

  it("shows authentication actions without rendering password values", () => {
    expect(shellTemplate).toContain("Sign in");
    expect(shellTemplate).toContain("Sign out");
    expect(shellTemplate).toContain('(click)="signOut()"');
    expect(shellTemplate).not.toContain("password");
  });

  it("restores the cookie session once from the app shell startup path", () => {
    expect(shellSource).toContain("implements OnInit");
    expect(shellSource).toContain("ngOnInit(): void");
    expect(shellSource).toContain("this.auth.restoreSession().subscribe");
    expect(shellTemplate).not.toContain("restoreSession");
  });

  it("uses responsive layout primitives for narrow and wider viewports", () => {
    expect(shellTemplate).toContain("md:flex");
    expect(shellTemplate).toContain("md:hidden");
    expect(shellTemplate).toContain("md:pl-64");
    expect(shellTemplate).toContain("max-w-7xl");
  });

  it("keeps the shell free of route-specific planner state", () => {
    expect(shellSource).not.toContain("selectedDate");
    expect(shellSource).not.toContain("PlannerApiService");
    expect(shellSource).not.toContain("FreeTimesApiService");
  });
});
