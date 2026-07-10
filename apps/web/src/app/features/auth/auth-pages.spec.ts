import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, provideRouter } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { NEVER, Observable, of, throwError } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { routes } from "../../app.routes";
import { AuthCredentials, AuthUser } from "../../core/auth/auth-contracts";
import { AuthSessionService } from "../../core/auth/auth-session.service";
import { ShellComponent } from "../../core/shell/shell.component";
import { PlannerApiService } from "../planner/planner-api.service";
import { RegisterPage } from "./register.page";
import { SignInPage } from "./sign-in.page";

const sampleUser: AuthUser = {
  id: "user-1",
  username: "daily_user",
  created_at: "2026-07-03T08:00:00Z",
  password_changed_at: null,
};

describe("rendered authentication pages", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("renders accessible sign-in labels, focus, keyboard submission, generic failure, and password clearing", async () => {
    const auth = new FakeAuthSession();
    const router = new FakeRouter();
    auth.failSignIn = true;

    const fixture = await renderSignInPage(auth, router, "/planner");
    await nextMicrotask();

    expect(document.activeElement).toBe(input(fixture, "#sign-in-username"));
    expect(labelText(fixture, 'label[for="sign-in-username"]')).toBe(
      "Username",
    );
    expect(labelText(fixture, 'label[for="sign-in-password"]')).toBe(
      "Password",
    );
    expect(form(fixture).className).toContain("rounded-lg");
    expect(fixture.nativeElement.textContent).toContain(
      "Your session is restored from the secure cookie",
    );

    setInput(fixture, "#sign-in-username", "daily_user");
    setInput(fixture, "#sign-in-password", "a-long-passphrase");
    form(fixture).dispatchEvent(submitEvent());
    fixture.detectChanges();

    expect(auth.signInCalls).toEqual([
      { username: "daily_user", password: "a-long-passphrase" },
    ]);
    expect(router.navigatedUrls).toEqual([]);
    expect(passwordInput(fixture, "#sign-in-password").value).toBe("");
    expect(fixture.nativeElement.textContent).toContain(
      "We could not sign you in. Check the username and password and try again.",
    );
    expect(fixture.nativeElement.textContent).not.toMatch(
      /unknown username|wrong password/i,
    );
    expect(storageDump()).not.toContain("a-long-passphrase");
  });

  it("signs in through the rendered form and navigates to a safe return URL without browser credential storage", async () => {
    const auth = new FakeAuthSession();
    const router = new FakeRouter();
    const consoleLog = vi.spyOn(console, "log");
    const consoleError = vi.spyOn(console, "error");

    const fixture = await renderSignInPage(auth, router, "/planner");
    setInput(fixture, "#sign-in-username", "daily_user");
    setInput(fixture, "#sign-in-password", "a-long-passphrase");
    form(fixture).dispatchEvent(submitEvent());
    fixture.detectChanges();

    expect(auth.signInCalls).toEqual([
      { username: "daily_user", password: "a-long-passphrase" },
    ]);
    expect(router.navigatedUrls).toEqual(["/planner"]);
    expect(passwordInput(fixture, "#sign-in-password").value).toBe("");
    expect(storageDump()).not.toContain("a-long-passphrase");
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();

    consoleLog.mockRestore();
    consoleError.mockRestore();
  });

  it("rejects unsafe sign-in return URLs after a rendered successful submit", async () => {
    const auth = new FakeAuthSession();
    const router = new FakeRouter();
    const fixture = await renderSignInPage(auth, router, "//example.test");

    setInput(fixture, "#sign-in-username", "daily_user");
    setInput(fixture, "#sign-in-password", "a-long-passphrase");
    form(fixture).dispatchEvent(submitEvent());

    expect(router.navigatedUrls).toEqual(["/planner"]);
  });

  it("focuses the first invalid rendered sign-in field on keyboard submit", async () => {
    const fixture = await renderSignInPage(
      new FakeAuthSession(),
      new FakeRouter(),
      "/planner",
    );
    input(fixture, "#sign-in-username").blur();

    form(fixture).dispatchEvent(submitEvent());
    fixture.detectChanges();

    expect(document.activeElement).toBe(input(fixture, "#sign-in-username"));
    expect(fixture.nativeElement.textContent).toContain("Enter a username.");
  });

  it("registers through the rendered form, clears the password, and navigates to the planner", async () => {
    const auth = new FakeAuthSession();
    const router = new FakeRouter();
    const fixture = await renderRegisterPage(auth, router);
    await nextMicrotask();

    expect(document.activeElement).toBe(input(fixture, "#register-username"));
    expect(labelText(fixture, 'label[for="register-username"]')).toBe(
      "Username",
    );
    expect(labelText(fixture, 'label[for="register-password"]')).toBe(
      "Password",
    );
    expect(form(fixture).className).toContain("rounded-lg");
    expect(fixture.nativeElement.textContent).toContain(
      "The API stores your session in a secure cookie",
    );

    setInput(fixture, "#register-username", "daily_user");
    setInput(fixture, "#register-password", "a-long-passphrase");
    form(fixture).dispatchEvent(submitEvent());
    fixture.detectChanges();

    expect(auth.registerCalls).toEqual([
      { username: "daily_user", password: "a-long-passphrase" },
    ]);
    expect(router.navigatedUrls).toEqual(["/planner"]);
    expect(passwordInput(fixture, "#register-password").value).toBe("");
    expect(storageDump()).not.toContain("a-long-passphrase");
  });

  it("announces a generic rendered registration error without account-enumeration copy", async () => {
    const auth = new FakeAuthSession();
    auth.failRegister = true;
    const fixture = await renderRegisterPage(auth, new FakeRouter());

    setInput(fixture, "#register-username", "daily_user");
    setInput(fixture, "#register-password", "a-long-passphrase");
    form(fixture).dispatchEvent(submitEvent());
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      "We could not create that account with those details.",
    );
    expect(fixture.nativeElement.textContent).not.toMatch(
      /already in use|taken/i,
    );
    expect(passwordInput(fixture, "#register-password").value).toBe("");
  });
});

describe("rendered shell authentication flow", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("restores the secure-cookie session, renders signed-in state, and signs out without credential storage", async () => {
    const auth = new FakeAuthSession();
    auth.currentUser.set(sampleUser);
    const router = new FakeRouter();
    const fixture = await renderShell(auth, router);

    fixture.detectChanges();

    expect(auth.restoreCalls).toBe(1);
    expect(fixture.nativeElement.textContent).toContain(
      "Signed in as daily_user",
    );
    expect(query(fixture, "nav")?.getAttribute("aria-label")).toBe(
      "Primary navigation",
    );
    expect(query(fixture, 'a[href="#main-content"]')?.textContent).toContain(
      "Skip to content",
    );
    expect(fixture.nativeElement.innerHTML).not.toContain("a-long-passphrase");

    buttonByText(fixture, "Sign out").click();
    fixture.detectChanges();

    expect(auth.signOutCalls).toBe(1);
    expect(auth.currentUser()).toBeNull();
    expect(router.navigatedUrls).toEqual(["/sign-in"]);
    expect(storageDump()).not.toContain("a-long-passphrase");
  });
});

describe("rendered protected route authentication flow", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("redirects unauthenticated planner visits to sign-in with a return URL", async () => {
    const auth = new FakeAuthSession();
    await configureRouterFlowTestingModule(auth);
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl("/planner");

    expect(TestBed.inject(Router).url).toBe("/sign-in?returnUrl=%2Fplanner");
    expect(harness.routeNativeElement?.textContent).toContain("Sign in");
    expect(auth.restoreCalls).toBeGreaterThanOrEqual(1);
  });

  it("restores an authenticated cookie session before rendering the protected planner workspace", async () => {
    const auth = new FakeAuthSession();
    auth.currentUser.set(sampleUser);
    await configureRouterFlowTestingModule(auth);
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl("/planner");

    expect(TestBed.inject(Router).url).toBe("/planner");
    expect(harness.routeNativeElement?.textContent).toContain("Daily planner");
    expect(harness.routeNativeElement?.textContent).toContain(
      "Signed in as daily_user",
    );
    expect(storageDump()).not.toContain("a-long-passphrase");
  });
});

class FakeAuthSession {
  readonly signInCalls: AuthCredentials[] = [];
  readonly registerCalls: AuthCredentials[] = [];
  readonly currentUser = signalLike<AuthUser | null>(null);
  failSignIn = false;
  failRegister = false;
  restoreCalls = 0;
  signOutCalls = 0;

  restoreSession(): Observable<AuthUser | null> {
    this.restoreCalls += 1;
    return of(this.currentUser());
  }

  signIn(credentials: AuthCredentials): Observable<AuthUser> {
    this.signInCalls.push(credentials);
    if (this.failSignIn) {
      return throwError(() => new Error("generic sign-in failure"));
    }

    this.currentUser.set(sampleUser);
    return of(sampleUser);
  }

  register(credentials: AuthCredentials): Observable<AuthUser> {
    this.registerCalls.push(credentials);
    if (this.failRegister) {
      return throwError(() => new Error("generic registration failure"));
    }

    this.currentUser.set(sampleUser);
    return of(sampleUser);
  }

  signOut(): Observable<void> {
    this.signOutCalls += 1;
    this.currentUser.set(null);
    return of(undefined);
  }
}

class FakeRouter {
  readonly events = NEVER;
  readonly navigatedUrls: string[] = [];

  navigateByUrl(url: string): Promise<boolean> {
    this.navigatedUrls.push(url);
    return Promise.resolve(true);
  }

  createUrlTree(commands: string[]): string {
    return commands.join("/");
  }

  serializeUrl(url: string): string {
    return url;
  }

  isActive(): boolean {
    return false;
  }
}

function signalLike<T>(initialValue: T): (() => T) & { set(value: T): void } {
  let value = initialValue;
  const read = (() => value) as (() => T) & { set(value: T): void };
  read.set = (nextValue: T) => {
    value = nextValue;
  };

  return read;
}

async function renderSignInPage(
  auth: FakeAuthSession,
  router: FakeRouter,
  returnUrl: string | null,
): Promise<ComponentFixture<SignInPage>> {
  await configureAuthPageTestingModule(auth, router, returnUrl, SignInPage);
  const fixture = TestBed.createComponent(SignInPage);
  fixture.detectChanges();

  return fixture;
}

async function renderRegisterPage(
  auth: FakeAuthSession,
  router: FakeRouter,
): Promise<ComponentFixture<RegisterPage>> {
  await configureAuthPageTestingModule(auth, router, null, RegisterPage);
  const fixture = TestBed.createComponent(RegisterPage);
  fixture.detectChanges();

  return fixture;
}

async function renderShell(
  auth: FakeAuthSession,
  router: FakeRouter,
): Promise<ComponentFixture<ShellComponent>> {
  await configureAuthPageTestingModule(auth, router, null, ShellComponent);
  const fixture = TestBed.createComponent(ShellComponent);
  fixture.detectChanges();

  return fixture;
}

async function configureAuthPageTestingModule(
  auth: FakeAuthSession,
  router: FakeRouter,
  returnUrl: string | null,
  component: typeof SignInPage | typeof RegisterPage | typeof ShellComponent,
): Promise<void> {
  await TestBed.configureTestingModule({
    imports: [component],
    providers: [
      { provide: AuthSessionService, useValue: auth },
      { provide: Router, useValue: router },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: {
              get: (key: string) => (key === "returnUrl" ? returnUrl : null),
            },
          },
        },
      },
    ],
  }).compileComponents();
}

async function configureRouterFlowTestingModule(
  auth: FakeAuthSession,
): Promise<void> {
  await TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      { provide: AuthSessionService, useValue: auth },
      { provide: PlannerApiService, useValue: new FakePlannerApi() },
    ],
  }).compileComponents();
}

class FakePlannerApi {
  loadWorkspaceDate() {
    return of({
      selectedDate: "2026-07-04",
      planningDays: [],
      day: null,
      fixedEvents: [],
      tasks: [],
      progress: [],
      snapshot: null,
    });
  }
}

function setInput<T>(
  fixture: ComponentFixture<T>,
  selector: string,
  value: string,
): void {
  const control = input(fixture, selector);
  control.value = value;
  control.dispatchEvent(new Event("input", { bubbles: true }));
  fixture.detectChanges();
}

function input<T>(
  fixture: ComponentFixture<T>,
  selector: string,
): HTMLInputElement {
  return query(fixture, selector) as HTMLInputElement;
}

function passwordInput<T>(
  fixture: ComponentFixture<T>,
  selector: string,
): HTMLInputElement {
  return input(fixture, selector);
}

function form<T>(fixture: ComponentFixture<T>): HTMLFormElement {
  return query(fixture, "form") as HTMLFormElement;
}

function query<T>(
  fixture: ComponentFixture<T>,
  selector: string,
): Element | null {
  return fixture.nativeElement.querySelector(selector);
}

function labelText<T>(fixture: ComponentFixture<T>, selector: string): string {
  return query(fixture, selector)?.textContent?.trim() ?? "";
}

function buttonByText<T>(
  fixture: ComponentFixture<T>,
  text: string,
): HTMLButtonElement {
  const buttons = Array.from(
    fixture.nativeElement.querySelectorAll("button"),
  ) as HTMLButtonElement[];
  const button = buttons.find((candidate) =>
    candidate.textContent?.includes(text),
  );

  if (!button) {
    throw new Error(`Could not find button with text ${text}`);
  }

  return button;
}

function submitEvent(): SubmitEvent {
  return new SubmitEvent("submit", { bubbles: true, cancelable: true });
}

function storageDump(): string {
  return [storageValues(localStorage), storageValues(sessionStorage)].join(
    "\n",
  );
}

function storageValues(storage: Storage): string {
  return Array.from({ length: storage.length }, (_, index) => {
    const key = storage.key(index);
    return key ? `${key}:${storage.getItem(key)}` : "";
  }).join("\n");
}

async function nextMicrotask(): Promise<void> {
  await Promise.resolve();
}
