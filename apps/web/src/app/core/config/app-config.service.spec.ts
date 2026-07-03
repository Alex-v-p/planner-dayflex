import { describe, expect, it } from "vitest";

import { normalizeAppConfig } from "./app-config.service";

describe("normalizeAppConfig", () => {
  it("trims trailing slashes from configured API URLs", () => {
    expect(
      normalizeAppConfig({ apiBaseUrl: "http://127.0.0.1:8000///" }),
    ).toEqual({
      apiBaseUrl: "http://127.0.0.1:8000",
    });
  });

  it("keeps the root relative API path intact", () => {
    expect(normalizeAppConfig({ apiBaseUrl: "/" })).toEqual({
      apiBaseUrl: "/",
    });
  });

  it("rejects missing API configuration", () => {
    expect(() => normalizeAppConfig({})).toThrow(
      "App configuration requires apiBaseUrl.",
    );
  });
});
