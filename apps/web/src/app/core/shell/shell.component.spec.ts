import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Component } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { of } from "rxjs";
import { describe, expect, it } from "vitest";

import { AuthSessionService } from "../auth/auth-session.service";
import { SHELL_NAV_ITEMS } from "./nav-item";
import { ShellComponent } from "./shell.component";

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

  it("marks the active planner route in desktop and mobile navigation", async () => {
    await TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [
        provideRouter([
          { path: "planner", component: RouteStubComponent },
          { path: "planner/week", component: RouteStubComponent },
          { path: "planner/month", component: RouteStubComponent },
          { path: "free-times", component: RouteStubComponent },
          { path: "status", component: RouteStubComponent },
          { path: "", component: RouteStubComponent },
        ]),
        { provide: AuthSessionService, useValue: new FakeAuthSession() },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();

    await TestBed.inject(Router).navigateByUrl("/planner/week");
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      navLink(
        fixture,
        "Primary navigation",
        "Open planner week overview",
      )?.getAttribute("aria-current"),
    ).toBe("page");
    expect(
      navLink(
        fixture,
        "Mobile planner navigation",
        "Open planner week overview",
      )?.getAttribute("aria-current"),
    ).toBe("page");
    expect(
      navLink(
        fixture,
        "Primary navigation",
        "Open planner workspace",
      )?.getAttribute("aria-current"),
    ).toBeNull();
  });
});

@Component({
  standalone: true,
  template: "<p>Route content</p>",
})
class RouteStubComponent {}

class FakeAuthSession {
  readonly currentUser = () => null;

  restoreSession() {
    return of(null);
  }

  signOut() {
    return of(undefined);
  }
}

function navLink(
  fixture: ComponentFixture<ShellComponent>,
  navLabel: string,
  linkLabel: string,
): HTMLAnchorElement | null {
  return fixture.nativeElement.querySelector(
    `nav[aria-label="${navLabel}"] a[aria-label="${linkLabel}"]`,
  );
}
