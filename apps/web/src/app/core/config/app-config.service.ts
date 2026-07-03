import { Injectable } from "@angular/core";

import { DEFAULT_APP_CONFIG, type RuntimeAppConfig } from "./app-config.model";

@Injectable({ providedIn: "root" })
export class AppConfigService {
  private config: RuntimeAppConfig = DEFAULT_APP_CONFIG;

  get apiBaseUrl(): string {
    return this.config.apiBaseUrl;
  }

  async load(): Promise<void> {
    const response = await fetch("assets/app-config.json", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Unable to load app configuration: ${response.status}`);
    }

    this.config = normalizeAppConfig(await response.json());
  }
}

export function normalizeAppConfig(value: unknown): RuntimeAppConfig {
  if (!isRecord(value)) {
    throw new Error("App configuration must be a JSON object.");
  }

  const apiBaseUrl = value["apiBaseUrl"];
  if (typeof apiBaseUrl !== "string" || apiBaseUrl.trim().length === 0) {
    throw new Error("App configuration requires apiBaseUrl.");
  }

  return {
    apiBaseUrl: trimTrailingSlash(apiBaseUrl.trim()),
  };
}

function trimTrailingSlash(value: string): string {
  if (value === "/") {
    return value;
  }

  return value.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
