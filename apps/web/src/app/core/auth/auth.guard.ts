import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { map } from "rxjs";

import { AuthSessionService } from "./auth-session.service";

export const requireAuthenticatedUser: CanActivateFn = (_route, state) => {
  const auth = inject(AuthSessionService);
  const router = inject(Router);

  return auth.restoreSession().pipe(
    map((user) =>
      user
        ? true
        : router.createUrlTree(["/sign-in"], {
            queryParams: { returnUrl: state.url },
          }),
    ),
  );
};

export const redirectSignedInUser: CanActivateFn = () => {
  const auth = inject(AuthSessionService);
  const router = inject(Router);

  return auth
    .restoreSession()
    .pipe(map((user) => (user ? router.createUrlTree(["/planner"]) : true)));
};
