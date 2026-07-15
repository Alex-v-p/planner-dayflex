import {
  AfterViewInit,
  Component,
  ElementRef,
  ViewChild,
  inject,
} from "@angular/core";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { finalize } from "rxjs";

import {
  PASSWORD_RULE_MESSAGE,
  USERNAME_PATTERN,
  USERNAME_RULE_MESSAGE,
} from "../../core/auth/auth-contracts";
import { AuthSessionService } from "../../core/auth/auth-session.service";
import { ActionButtonComponent } from "../../shared/ui/action-button/action-button.component";
import { passwordError, usernameError } from "./auth-form-messages";

@Component({
  selector: "pdf-register-page",
  standalone: true,
  imports: [ActionButtonComponent, ReactiveFormsModule, RouterLink],
  templateUrl: "./register.page.html",
})
export class RegisterPage implements AfterViewInit {
  @ViewChild("usernameInput") private readonly usernameInput?:
    | ElementRef<HTMLInputElement>
    | undefined;

  private readonly auth = inject(AuthSessionService);
  private readonly router = inject(Router);

  protected readonly usernameHelper = USERNAME_RULE_MESSAGE;
  protected readonly passwordHelper = PASSWORD_RULE_MESSAGE;
  protected readonly form = new FormGroup({
    username: new FormControl("", {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(32),
        Validators.pattern(USERNAME_PATTERN),
      ],
    }),
    password: new FormControl("", {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(12),
        Validators.maxLength(128),
      ],
    }),
  });
  protected errorMessage = "";
  protected isSubmitting = false;

  ngAfterViewInit(): void {
    queueMicrotask(() => this.usernameInput?.nativeElement.focus());
  }

  protected usernameError(): string {
    return usernameError(this.form.controls.username);
  }

  protected passwordError(): string {
    return passwordError(this.form.controls.password);
  }

  protected submit(): void {
    this.errorMessage = "";
    this.form.markAllAsTouched();

    if (this.form.invalid || this.isSubmitting) {
      this.focusFirstInvalidField();
      return;
    }

    const credentials = this.form.getRawValue();
    this.isSubmitting = true;
    this.auth
      .register(credentials)
      .pipe(
        finalize(() => {
          this.form.controls.password.reset("", { emitEvent: false });
          this.isSubmitting = false;
        }),
      )
      .subscribe({
        next: () => {
          void this.router.navigateByUrl("/planner");
        },
        error: () => {
          this.errorMessage =
            "We could not create that account with those details. Check the username and password rules and try again.";
        },
      });
  }

  private focusFirstInvalidField(): void {
    if (this.form.controls.username.invalid) {
      this.usernameInput?.nativeElement.focus();
      return;
    }

    const passwordInput = document.getElementById("register-password");
    passwordInput?.focus();
  }
}
