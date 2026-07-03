export interface RuntimeAppConfig {
  readonly apiBaseUrl: string;
}

export const DEFAULT_APP_CONFIG: RuntimeAppConfig = {
  apiBaseUrl: "/api",
};
