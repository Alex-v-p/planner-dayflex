import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const appRoot = join(webRoot, "src", "app");

const forbiddenBrowserReferences = [
  "api_service",
  "scheduler_core",
  "scheduler_service",
  "sqlalchemy",
  "psycopg",
  "alembic",
  "ollama",
  "openai",
  "anthropic",
  "postgres",
  "sqlite",
];

describe("browser API boundary", () => {
  it("keeps browser source free of direct backend, scheduler, database, and model imports", () => {
    const offenders = sourceFiles(appRoot).flatMap((filePath) => {
      const contents = readFileSync(filePath, "utf8");
      const matchedTerms = forbiddenBrowserReferences.filter((term) =>
        contents.includes(term),
      );

      return matchedTerms.length > 0
        ? [`${relative(webRoot, filePath)}: ${matchedTerms.join(", ")}`]
        : [];
    });

    expect(offenders).toEqual([]);
  });
});

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const entryPath = join(root, entry);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      return sourceFiles(entryPath);
    }

    if (extname(entryPath) === ".ts" && !entryPath.endsWith(".spec.ts")) {
      return [entryPath];
    }

    return [];
  });
}
