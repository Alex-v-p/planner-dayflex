import "@angular/compiler";

import { HttpErrorResponse } from "@angular/common/http";
import { Injector, runInInjectionContext } from "@angular/core";
import { Router } from "@angular/router";
import { lastValueFrom, Observable, of, throwError } from "rxjs";
import { describe, expect, it, beforeEach } from "vitest";

import { ApiClientService } from "../api/api-client.service";
import { AuthUser, AuthenticatedUserResponse } from "./auth-contracts";
import { requireAuthenticatedUser, redirectSignedInUser } from "./auth.guard";
import { AuthSessionService } from "./auth-session.service";

const sampleUser: AuthUser = {
  id: "user-1",
  username: "daily_user",
  created_at: "2026-07-03T08:00:00Z",
  password_changed_at: null,
};

class FakeApiClient {
  nextMe = of<AuthenticatedUserResponse>({ user: sampleUser });
  readonly gets: string[] = [];
  readonly posts: Array<{ path: string; body: object | null }> = [];

  getJson<TResponse>(path: string): Observable<TResponse> {
    this.gets.push(path);

    if (path !== "/auth/me") {
      throw new Error(`Unexpected GET ${path}`);
    }

    return this.nextMe as unknown as Observable<TResponse>;
  }

  postJson<TRequest extends object, TResponse>(
    path: string,
    body: TRequest,
  ): Observable<TResponse> {
    this.posts.push({ path, body });

    if (path === "/auth/logout") {
      return of(undefined) as unknown as Observable<TResponse>;
    }

    return of({ user: sampleUser }) as unknown as Observable<TResponse>;
  }

  postEmpty<TResponse>(path: string): Observable<TResponse> {
    this.posts.push({ path, body: null });
    return of(undefined) as unknown as Observable<TResponse>;
  }
}

class FakeRouter {
  createUrlTree(commands: string[], options?: object): object {
    return { commands, options };
  }
}

describe("authentication browser flow", () => {
  let api: FakeApiClient;
  let injector: Injector;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    api = new FakeApiClient();

    injector = Injector.create({
      providers: [
        AuthSessionService,
        { provide: ApiClientService, useValue: api },
        { provide: Router, useClass: FakeRouter },
      ],
    });
  });

  it("restores an existing secure-cookie session before allowing protected routes", async () => {
    const result = await runInInjectionContext(injector, () =>
      lastValueFrom(
        requireAuthenticatedUser(
          {} as Parameters<typeof requireAuthenticatedUser>[0],
          { url: "/planner" } as Parameters<typeof requireAuthenticatedUser>[1],
        ) as Observable<true | object>,
      ),
    );

    expect(result).toBe(true);
    expect(injector.get(AuthSessionService).currentUser()).toEqual(sampleUser);
  });

  it("does not repeatedly call current-user restoration after the session is restored", async () => {
    const auth = injector.get(AuthSessionService);

    await lastValueFrom(auth.restoreSession());
    await lastValueFrom(auth.restoreSession());

    expect(api.gets).toEqual(["/auth/me"]);
  });

  it("sends unauthenticated protected-route visits to sign-in with a return URL", async () => {
    api.nextMe = throwError(
      () => new HttpErrorResponse({ status: 401, statusText: "Unauthorized" }),
    );

    const result = await runInInjectionContext(injector, () =>
      lastValueFrom(
        requireAuthenticatedUser(
          {} as Parameters<typeof requireAuthenticatedUser>[0],
          { url: "/planner" } as Parameters<typeof requireAuthenticatedUser>[1],
        ) as Observable<true | object>,
      ),
    );

    expect(result).toEqual({
      commands: ["/sign-in"],
      options: { queryParams: { returnUrl: "/planner" } },
    });
  });

  it("redirects signed-in users away from auth pages after session restore", async () => {
    const result = await runInInjectionContext(injector, () =>
      lastValueFrom(
        redirectSignedInUser(
          {} as Parameters<typeof redirectSignedInUser>[0],
          { url: "/sign-in" } as Parameters<typeof redirectSignedInUser>[1],
        ) as Observable<true | object>,
      ),
    );

    expect(result).toEqual({ commands: ["/planner"], options: undefined });
  });

  it("does not place credentials in browser storage during register, login, or logout", async () => {
    const auth = injector.get(AuthSessionService);
    const credentials = {
      username: "daily_user",
      password: "a-long-passphrase",
    };

    await lastValueFrom(auth.register(credentials));
    await lastValueFrom(auth.signIn(credentials));
    await lastValueFrom(auth.signOut());

    expect(api.posts.map((post) => post.path)).toEqual([
      "/auth/register",
      "/auth/login",
      "/auth/logout",
    ]);
    expect(storageValues(localStorage)).not.toContain(credentials.password);
    expect(storageValues(sessionStorage)).not.toContain(credentials.password);
    expect(auth.currentUser()).toBeNull();
  });
});

function storageValues(storage: Storage): string {
  return Array.from({ length: storage.length }, (_, index) => {
    const key = storage.key(index);
    return key ? `${key}:${storage.getItem(key)}` : "";
  }).join("\n");
}
