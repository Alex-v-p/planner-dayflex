import { describe, expectTypeOf, it } from "vitest";

import { joinApiUrl, type ApiPath } from "./api-url";

describe("ApiPath", () => {
  it("requires browser API calls to use app-relative paths", () => {
    expectTypeOf<"/health">().toMatchTypeOf<ApiPath>();
    expectTypeOf<"health">().not.toMatchTypeOf<ApiPath>();
  });

  it("joins root-relative API bases without creating protocol-relative URLs", () => {
    expect(joinApiUrl("/", "/health")).toBe("/health");
    expect(joinApiUrl("/api", "/health")).toBe("/api/health");
    expect(joinApiUrl("http://127.0.0.1:8000/", "/health")).toBe(
      "http://127.0.0.1:8000/health",
    );
  });

  it("rejects protocol-relative API paths", () => {
    expect(() => joinApiUrl("/", "//example.test/health")).toThrow(
      "API paths must be app-relative and start with a single slash.",
    );
  });
});
