import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";

import { AppConfigService } from "../config/app-config.service";
import { joinApiUrl, type ApiPath } from "./api-url";

@Injectable({ providedIn: "root" })
export class ApiClientService {
  private readonly config = inject(AppConfigService);
  private readonly http = inject(HttpClient);

  getJson<TResponse>(path: ApiPath) {
    return this.http.get<TResponse>(this.urlFor(path), {
      withCredentials: true,
    });
  }

  postJson<TRequest extends object, TResponse>(path: ApiPath, body: TRequest) {
    return this.http.post<TResponse>(this.urlFor(path), body, {
      withCredentials: true,
    });
  }

  urlFor(path: ApiPath): string {
    return joinApiUrl(this.config.apiBaseUrl, path);
  }
}
