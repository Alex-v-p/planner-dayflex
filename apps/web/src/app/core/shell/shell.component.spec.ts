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
const routesSource = readFileSync(join(appDirectory, "app.routes.ts"), "utf8");

describe("ShellComponent", () => {
  it("keeps primary navigation aligned with configured application routes", () => {
    const routePaths = [...routesSource.matchAll(/path:\s*"([^"]*)"/g)]
      .map((match) => match[1])
      .filter((path) => path !== "**")
      .map((path) => `/${path}`)
      .map((path) => (path === "/" ? path : path.replace(/\/$/, "")));

    expect(SHELL_NAV_ITEMS.map((item) => item.path)).toEqual(routePaths);
    expect(SHELL_NAV_ITEMS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: expect.any(String),
          ariaLabel: expect.stringContaining("Open"),
        }),
      ]),
    );
  });

  it("exposes keyboard and screen reader navigation landmarks", () => {
    expect(shellTemplate).toContain('href="#main-content"');
    expect(shellTemplate).toContain('id="main-content"');
    expect(shellTemplate).toContain('aria-label="Primary navigation"');
    expect(shellTemplate).toContain('ariaCurrentWhenActive="page"');
  });

  it("uses responsive layout primitives for narrow and wider viewports", () => {
    expect(shellTemplate).toContain("flex-col");
    expect(shellTemplate).toContain("md:flex-row");
    expect(shellTemplate).toContain("flex-wrap");
    expect(shellTemplate).toContain("max-w-6xl");
  });
});
