import { HttpErrorResponse } from "@angular/common/http";
import { Injectable, computed, inject, signal } from "@angular/core";
import { Observable, catchError, map, of, tap } from "rxjs";

import { ApiClientService } from "../api/api-client.service";
import {
  AuthCredentials,
  AuthUser,
  AuthenticatedUserResponse,
} from "./auth-contracts";

@Injectable({ providedIn: "root" })
export class AuthSessionService {
  private readonly api = inject(ApiClientService);
  private readonly userSignal = signal<AuthUser | null>(null);
  private readonly restoredSignal = signal(false);

  readonly currentUser = this.userSignal.asReadonly();
  readonly isRestored = this.restoredSignal.asReadonly();
  readonly isSignedIn = computed(() => this.userSignal() !== null);

  restoreSession(): Observable<AuthUser | null> {
    if (this.restoredSignal()) {
      return of(this.userSignal());
    }

    return this.api.getJson<AuthenticatedUserResponse>("/auth/me").pipe(
      map((response) => response.user),
      tap((user) => {
        this.userSignal.set(user);
        this.restoredSignal.set(true);
      }),
      catchError((error: unknown) => {
        if (isUnauthorized(error)) {
          this.userSignal.set(null);
          this.restoredSignal.set(true);
          return of(null);
        }

        throw error;
      }),
    );
  }

  register(credentials: AuthCredentials): Observable<AuthUser> {
    return this.api
      .postJson<
        AuthCredentials,
        AuthenticatedUserResponse
      >("/auth/register", credentials)
      .pipe(
        map((response) => response.user),
        tap((user) => {
          this.userSignal.set(user);
          this.restoredSignal.set(true);
        }),
      );
  }

  signIn(credentials: AuthCredentials): Observable<AuthUser> {
    return this.api
      .postJson<
        AuthCredentials,
        AuthenticatedUserResponse
      >("/auth/login", credentials)
      .pipe(
        map((response) => response.user),
        tap((user) => {
          this.userSignal.set(user);
          this.restoredSignal.set(true);
        }),
      );
  }

  signOut(): Observable<void> {
    return this.api.postEmpty<void>("/auth/logout").pipe(
      tap(() => {
        this.userSignal.set(null);
        this.restoredSignal.set(true);
      }),
    );
  }
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 401;
}
