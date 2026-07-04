export interface AuthCredentials {
  readonly username: string;
  readonly password: string;
}

export interface AuthUser {
  readonly id: string;
  readonly username: string;
  readonly created_at: string;
  readonly password_changed_at: string | null;
}

export interface AuthenticatedUserResponse {
  readonly user: AuthUser;
}

export const USERNAME_PATTERN = /^[a-z0-9_-]{3,32}$/;
export const USERNAME_RULE_MESSAGE =
  "Use 3 to 32 lowercase letters, numbers, underscores, or hyphens.";
export const PASSWORD_RULE_MESSAGE = "Use 12 to 128 characters.";
