export type ApiPath = `/${string}`;

export function joinApiUrl(baseUrl: string, path: ApiPath): string {
  if (path.startsWith("//")) {
    throw new Error(
      "API paths must be app-relative and start with a single slash.",
    );
  }

  if (baseUrl === "" || baseUrl === "/") {
    return path;
  }

  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}
