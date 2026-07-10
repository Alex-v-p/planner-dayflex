import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { ApiClientService } from "../../core/api/api-client.service";

export interface FreeTimeWindow {
  readonly local_date: string;
  readonly planning_day_id: string;
  readonly time_zone: string;
  readonly snapshot_id: string;
  readonly snapshot_version: number;
  readonly snapshot_created_at: string;
  readonly schedule_item_id: string;
  readonly start_at: string;
  readonly end_at: string;
  readonly duration_minutes: number;
}

export interface FreeTimeDay {
  readonly local_date: string;
  readonly planning_day_id: string | null;
  readonly time_zone: string | null;
  readonly status:
    | "no_generated_plan"
    | "no_useful_free_time"
    | "has_free_time";
  readonly snapshot_id: string | null;
  readonly snapshot_version: number | null;
  readonly snapshot_created_at: string | null;
  readonly windows: readonly FreeTimeWindow[];
}

export interface FreeTimeRange {
  readonly start_date: string;
  readonly end_date: string;
  readonly minimum_minutes: number;
  readonly days: readonly FreeTimeDay[];
}

@Injectable({ providedIn: "root" })
export class FreeTimesApiService {
  private readonly api = inject(ApiClientService);

  findFreeTimes(
    startDate: string,
    endDate: string,
    minimumMinutes: number,
  ): Observable<FreeTimeRange> {
    const query = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      minimum_minutes: String(minimumMinutes),
    });
    return this.api.getJson<FreeTimeRange>(`/planning/free-times?${query}`);
  }
}
