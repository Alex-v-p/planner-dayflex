import "@angular/compiler";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const authDirectory = dirname(fileURLToPath(import.meta.url));
const signInTemplate = readFileSync(
  join(authDirectory, "sign-in.page.html"),
  "utf8",
);
const signInSource = readFileSync(
  join(authDirectory, "sign-in.page.ts"),
  "utf8",
);
const registerTemplate = readFileSync(
  join(authDirectory, "register.page.html"),
  "utf8",
);
const registerSource = readFileSync(
  join(authDirectory, "register.page.ts"),
  "utf8",
);

describe("authentication pages", () => {
  it("uses accessible labels, error announcements, autocomplete, and keyboard form submission", () => {
    for (const template of [signInTemplate, registerTemplate]) {
      expect(template).toContain("<form");
      expect(template).toContain("(ngSubmit)=");
      expect(template).toContain("aria-labelledby=");
      expect(template).toContain('role="alert"');
      expect(template).toMatch(/<label\s+for="/);
      expect(template).toContain('type="password"');
      expect(template).toContain('autocomplete="username"');
      expect(template).toContain("[attr.aria-invalid]");
      expect(template).toContain("[attr.aria-describedby]");
    }

    expect(signInTemplate).toContain('autocomplete="current-password"');
    expect(registerTemplate).toContain('autocomplete="new-password"');
  });

  it("matches API username and password rules on the client", () => {
    for (const source of [signInSource, registerSource]) {
      expect(source).toContain("USERNAME_PATTERN");
      expect(source).toContain("Validators.minLength(3)");
      expect(source).toContain("Validators.maxLength(32)");
      expect(source).toContain("Validators.minLength(12)");
      expect(source).toContain("Validators.maxLength(128)");
    }
  });

  it("focuses the username field on entry and first invalid field on failed submit", () => {
    for (const source of [signInSource, registerSource]) {
      expect(source).toContain("ngAfterViewInit");
      expect(source).toContain("nativeElement.focus()");
      expect(source).toContain("focusFirstInvalidField");
    }
  });

  it("clears password controls after API attempts and avoids credential logging or storage", () => {
    for (const source of [signInSource, registerSource]) {
      expect(source).toContain("const credentials = this.form.getRawValue();");
      expect(source).toContain("this.form.controls.password.reset");
      expect(source).not.toContain("console.");
      expect(source).not.toContain("localStorage");
      expect(source).not.toContain("sessionStorage");
    }
  });

  it("submits auth forms through the session service before navigation", () => {
    expect(signInSource).toContain(".signIn(credentials)");
    expect(signInSource).toContain(
      "this.router.navigateByUrl(this.safeReturnUrl())",
    );
    expect(registerSource).toContain(".register(credentials)");
    expect(registerSource).toContain('this.router.navigateByUrl("/planner")');
  });

  it("uses generic non-enumerating failure copy", () => {
    expect(signInSource).toContain(
      "We could not sign you in. Check the username and password and try again.",
    );
    expect(registerSource).toContain(
      "We could not create that account with those details.",
    );
    expect(signInSource).not.toMatch(/unknown username|wrong password/i);
    expect(registerSource).not.toMatch(/already in use|taken/i);
  });

  it("rejects protocol-relative sign-in return URLs", () => {
    expect(signInSource).toContain('requestedUrl.startsWith("//")');
    expect(signInSource).toContain('return "/planner";');
  });

  it("uses submit buttons so keyboard form submission follows the same flow", () => {
    expect(signInTemplate).toContain('label="Sign in"');
    expect(signInTemplate).toContain('type="submit"');
    expect(registerTemplate).toContain('label="Create account"');
    expect(registerTemplate).toContain('type="submit"');
  });

  it("keeps mobile layout constraints on the auth surfaces", () => {
    for (const template of [signInTemplate, registerTemplate]) {
      expect(template).toContain("grid");
      expect(template).toContain("lg:grid-cols");
      expect(template).toContain("sm:flex-row");
      expect(template).toContain("w-full");
    }
  });
});
