export type ApiPath = `/${string}`;

export function joinApiUrl(baseUrl: string, path: ApiPath): string {
  if (baseUrl === "" || baseUrl === "/") {
    return path;
  }

  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}
