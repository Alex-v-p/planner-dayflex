import { AbstractControl } from "@angular/forms";

import {
  PASSWORD_RULE_MESSAGE,
  USERNAME_RULE_MESSAGE,
} from "../../core/auth/auth-contracts";

export function usernameError(control: AbstractControl): string {
  if (!control.touched && !control.dirty) {
    return "";
  }

  if (control.hasError("required")) {
    return "Enter a username.";
  }

  if (
    control.hasError("minlength") ||
    control.hasError("maxlength") ||
    control.hasError("pattern")
  ) {
    return USERNAME_RULE_MESSAGE;
  }

  return "";
}

export function passwordError(control: AbstractControl): string {
  if (!control.touched && !control.dirty) {
    return "";
  }

  if (control.hasError("required")) {
    return "Enter a password.";
  }

  if (control.hasError("minlength") || control.hasError("maxlength")) {
    return PASSWORD_RULE_MESSAGE;
  }

  return "";
}
