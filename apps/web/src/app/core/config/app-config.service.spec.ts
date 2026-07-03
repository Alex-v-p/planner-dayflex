import { afterEach, describe, expect, it, vi } from "vitest";

import { AppConfigService, normalizeAppConfig } from "./app-config.service";

const originalFetch = globalThis.fetch;

describe("normalizeAppConfig", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

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

  it("rejects non-object API configuration payloads", () => {
    expect(() => normalizeAppConfig(null)).toThrow(
      "App configuration must be a JSON object.",
    );
    expect(() => normalizeAppConfig([])).toThrow(
      "App configuration must be a JSON object.",
    );
  });

  it("loads API configuration from the runtime asset without caching", async () => {
    const json = vi.fn().mockResolvedValue({ apiBaseUrl: "/api/" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json,
    } as Partial<Response>);
    globalThis.fetch = fetchMock;

    const service = new AppConfigService();

    await service.load();

    expect(fetchMock).toHaveBeenCalledWith("assets/app-config.json", {
      cache: "no-store",
    });
    expect(json).toHaveBeenCalledOnce();
    expect(service.apiBaseUrl).toBe("/api");
  });

  it("fails startup when the runtime config asset cannot be loaded", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    } as Partial<Response>);

    await expect(new AppConfigService().load()).rejects.toThrow(
      "Unable to load app configuration: 404",
    );
  });
});
