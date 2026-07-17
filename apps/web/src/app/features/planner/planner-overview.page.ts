import { HttpErrorResponse } from "@angular/common/http";
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import {
  Observable,
  catchError,
  combineLatest,
  map,
  of,
  switchMap,
  tap,
} from "rxjs";

import { IconButtonComponent } from "../../shared/ui/icon-button/icon-button.component";
import {
  SegmentedControlComponent,
  SegmentedControlOption,
} from "../../shared/ui/segmented-control/segmented-control.component";
import { StatusChipComponent } from "../../shared/ui/status-chip/status-chip.component";
import { SummaryValueComponent } from "../../shared/ui/summary-value/summary-value.component";
import {
  FixedEvent,
  PlannerApiService,
  PlanningDaySummary,
  PlanningRangeSummary,
  PlanningWeekDayDetail,
  PlanningWeekDetail,
  ScheduleDecision,
  ScheduleItem,
  ScheduleSnapshot,
  Task,
  TaskProgress,
} from "./planner-api.service";

type OverviewMode = "week" | "month";
type TimelineRecoveryState = "moved" | "split";

type OverviewCell =
  | { readonly kind: "padding"; readonly id: string; readonly label: string }
  | { readonly kind: "day"; readonly day: PlanningDaySummary };

interface OverviewTotals {
  readonly plannedMinutes: number;
  readonly fixedEventCount: number;
  readonly interruptionMinutes: number;
  readonly deferredCount: number;
  readonly usefulFreeTimeDays: number;
  readonly savedInputDays: number;
  readonly generatedPlanDays: number;
}

interface WeekBlock {
  readonly item: ScheduleItem;
  readonly day: PlanningWeekDayDetail;
  readonly label: string;
  readonly kindLabel: string;
  readonly marker: string;
  readonly recoveryState: TimelineRecoveryState | null;
  readonly recoveryLabel: string | null;
  readonly completionLabel: string | null;
  readonly minutes: number;
  readonly topPercent: number;
  readonly heightPercent: number;
  readonly topMinutes: number;
  readonly heightMinutes: number;
  readonly laneIndex: number;
  readonly laneCount: number;
  readonly leftPercent: number;
  readonly widthPercent: number;
  readonly isTiny: boolean;
  readonly isCompact: boolean;
  readonly showsDetails: boolean;
}

interface WeekTick {
  readonly label: string;
  readonly topPercent: number;
  readonly labelTopPercent: number | null;
  readonly labelClass: string;
  readonly minutesFromStart: number;
}

interface WeekSlot {
  readonly id: string;
  readonly localDate: string;
  readonly start: string;
  readonly label: string;
  readonly topPercent: number;
  readonly heightPercent: number;
  readonly topMinutes: number;
  readonly heightMinutes: number;
}

interface CurrentTimeIndicator {
  readonly date: string;
  readonly label: string;
  readonly topPercent: number;
}

interface WeekPlaceholderDay {
  readonly localDate: string;
  readonly name: string;
  readonly number: string;
  readonly isSelected: boolean;
}

type OverviewState =
  | { readonly status: "loading"; readonly anchorDate: string }
  | {
      readonly status: "ready";
      readonly anchorDate: string;
      readonly summary: PlanningRangeSummary;
      readonly week: PlanningWeekDetail | null;
    }
  | {
      readonly status: "permission";
      readonly anchorDate: string;
      readonly message: string;
    }
  | {
      readonly status: "error";
      readonly anchorDate: string;
      readonly message: string;
    };

const PLANNER_MODE_OPTIONS: readonly SegmentedControlOption[] = [
  { label: "Day", value: "day", ariaLabel: "Show day planner" },
  { label: "Week", value: "week", ariaLabel: "Show week calendar" },
  { label: "Month", value: "month", ariaLabel: "Show month calendar" },
];

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TINY_WEEK_BLOCK_MINUTES = 20;
const COMPACT_WEEK_BLOCK_MINUTES = 45;
const DETAILED_WEEK_BLOCK_MINUTES = 90;

@Component({
  selector: "pdf-planner-overview-page",
  standalone: true,
  imports: [
    FormsModule,
    IconButtonComponent,
    RouterLink,
    SegmentedControlComponent,
    StatusChipComponent,
    SummaryValueComponent,
  ],
  templateUrl: "./planner-overview.page.html",
})
export class PlannerOverviewPage implements OnInit {
  protected readonly plannerModeOptions = PLANNER_MODE_OPTIONS;
  protected readonly weekdayLabels = WEEKDAY_LABELS;
  protected readonly monthPlaceholderCells = Array.from(
    { length: 35 },
    (_, index) => index,
  );
  protected readonly mode = signal<OverviewMode>("week");
  protected readonly anchorDate = signal(todayLocalDate());
  protected readonly state = signal<OverviewState>({
    status: "loading",
    anchorDate: todayLocalDate(),
  });
  protected readonly title = computed(() =>
    this.mode() === "week" ? "Week calendar" : "Month calendar",
  );
  protected readonly announcement = computed(() => {
    const state = this.state();
    if (state.status === "loading") {
      return `Loading ${this.title().toLowerCase()} for ${formatDateLabel(state.anchorDate)}.`;
    }
    if (state.status === "ready") {
      return `${this.title()} loaded for ${formatDateLabel(state.summary.start_date)} through ${formatDateLabel(state.summary.end_date)}.`;
    }
    return state.message;
  });

  private readonly plannerApi = inject(PlannerApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    const routeState = combineLatest([
      this.route.data,
      this.route.queryParamMap,
    ]).pipe(
      map(([data, queryParamMap]) => {
        const mode = data["overviewMode"];
        return {
          mode: mode === "month" ? "month" : "week",
          anchorDate: normalizeDateInput(queryParamMap.get("date")),
        } as const;
      }),
      tap(({ mode, anchorDate }) => {
        this.mode.set(mode);
        this.anchorDate.set(anchorDate);
        this.state.set({ status: "loading", anchorDate });
      }),
      switchMap(({ mode, anchorDate }) => {
        const request: Observable<{
          readonly summary: PlanningRangeSummary;
          readonly week: PlanningWeekDetail | null;
        }> =
          mode === "week"
            ? this.plannerApi.loadWeekDetail(startOfWeek(anchorDate)).pipe(
                map((week) => ({
                  summary: week.summary,
                  week,
                })),
              )
            : this.plannerApi.loadMonthOverview(startOfMonth(anchorDate)).pipe(
                map((summary) => ({
                  summary,
                  week: null,
                })),
              );
        return request.pipe(
          map(
            ({ summary, week }): OverviewState => ({
              status: "ready",
              anchorDate,
              summary,
              week,
            }),
          ),
          catchError((error: unknown) =>
            of(overviewErrorState(anchorDate, error)),
          ),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    );

    routeState.subscribe((state) => {
      this.state.set(state);
    });
  }

  protected openAnchorDate(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { date: this.anchorDate() },
      queryParamsHandling: "merge",
    });
  }

  protected openToday(): void {
    const nextDate = todayLocalDate();
    this.anchorDate.set(nextDate);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { date: nextDate },
      queryParamsHandling: "merge",
    });
  }

  protected moveRange(direction: -1 | 1): void {
    const nextDate =
      this.mode() === "week"
        ? addDays(this.anchorDate(), direction * 7)
        : addMonths(this.anchorDate(), direction);
    this.anchorDate.set(nextDate);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { date: nextDate },
      queryParamsHandling: "merge",
    });
  }

  protected switchPlannerView(view: string): void {
    const date = this.anchorDate();
    const route =
      view === "week"
        ? "/planner/week"
        : view === "month"
          ? "/planner/month"
          : "/planner";

    void this.router.navigate([route], { queryParams: { date } });
  }

  protected retry(): void {
    this.openAnchorDate();
  }

  protected overviewDescription(): string {
    return this.mode() === "week"
      ? "Timed week grid from persisted daily snapshots. Each date opens the day workspace."
      : "Monday-first calendar summary of saved daily inputs and current snapshots. Each date opens the day workspace.";
  }

  protected weekMetaLabel(week: PlanningWeekDetail): string {
    return `${this.weekTimeZoneLabel(week)} - Day bounds ${this.weekBoundsLabel(week)}`;
  }

  protected fallbackRangeLabel(anchorDate: string): string {
    if (this.mode() === "week") {
      const startDate = startOfWeek(anchorDate);
      return `${formatDateLabel(startDate)} to ${formatDateLabel(addDays(startDate, 6))}`;
    }

    const startDate = startOfMonth(anchorDate);
    const endDate = localDateFromDate(
      new Date(
        Date.UTC(
          dateFromLocalDate(startDate).getUTCFullYear(),
          dateFromLocalDate(startDate).getUTCMonth() + 1,
          0,
        ),
      ),
    );
    return `${formatDateLabel(startDate)} to ${formatDateLabel(endDate)}`;
  }

  protected fallbackTimeZoneLabel(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Local time";
  }

  protected weekPlaceholderDays(
    anchorDate: string,
  ): readonly WeekPlaceholderDay[] {
    const startDate = startOfWeek(anchorDate);
    return Array.from({ length: 7 }, (_, index) => {
      const localDate = addDays(startDate, index);
      return {
        localDate,
        name: this.dayName(localDate),
        number: this.dayNumber(localDate),
        isSelected: localDate === anchorDate,
      };
    });
  }

  protected rangeLabel(summary: PlanningRangeSummary): string {
    return `${formatDateLabel(summary.start_date)} to ${formatDateLabel(summary.end_date)}`;
  }

  protected selectedDay(
    summary: PlanningRangeSummary,
  ): PlanningDaySummary | null {
    return (
      summary.days.find((day) => day.local_date === this.anchorDate()) ??
      summary.days[0] ??
      null
    );
  }

  protected totals(summary: PlanningRangeSummary): OverviewTotals {
    return summary.days.reduce(
      (totals, day) => ({
        plannedMinutes: totals.plannedMinutes + day.planned_minutes,
        fixedEventCount: totals.fixedEventCount + day.fixed_event_count,
        interruptionMinutes:
          totals.interruptionMinutes + day.interruption_minutes,
        deferredCount: totals.deferredCount + day.unscheduled_deferred_count,
        usefulFreeTimeDays:
          totals.usefulFreeTimeDays + (day.has_useful_free_time ? 1 : 0),
        savedInputDays:
          totals.savedInputDays + (day.status !== "empty" ? 1 : 0),
        generatedPlanDays:
          totals.generatedPlanDays + (day.status === "planned" ? 1 : 0),
      }),
      {
        plannedMinutes: 0,
        fixedEventCount: 0,
        interruptionMinutes: 0,
        deferredCount: 0,
        usefulFreeTimeDays: 0,
        savedInputDays: 0,
        generatedPlanDays: 0,
      },
    );
  }

  protected formatDateLabel(value: string): string {
    return formatDateLabel(value);
  }

  protected dayName(value: string): string {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: "UTC",
      weekday: "short",
    }).format(dateFromLocalDate(value));
  }

  protected dayNumber(value: string): string {
    return String(dateFromLocalDate(value).getUTCDate());
  }

  protected formatDuration(minutes: number): string {
    return formatDuration(minutes);
  }

  protected statusLabel(day: PlanningDaySummary): string {
    switch (day.status) {
      case "planned":
        return `Generated snapshot v${day.snapshot_version ?? "?"}`;
      case "incomplete":
        return "Saved inputs only";
      case "empty":
        return "No saved day";
    }
  }

  protected compactStatusLabel(day: PlanningDaySummary): string {
    switch (day.status) {
      case "planned":
        return `Plan v${day.snapshot_version ?? "?"}`;
      case "incomplete":
        return "Inputs";
      case "empty":
        return "Empty";
    }
  }

  protected dayLink(day: PlanningDaySummary): readonly [string] {
    void day;
    return ["/planner"];
  }

  protected hasAnySignal(day: PlanningDaySummary): boolean {
    return (
      day.status !== "empty" ||
      day.planned_minutes > 0 ||
      day.fixed_event_count > 0 ||
      day.interruption_minutes > 0 ||
      day.unscheduled_deferred_count > 0 ||
      day.has_useful_free_time
    );
  }

  protected gridClass(): string {
    return this.mode() === "month"
      ? "grid gap-2 sm:grid-cols-2 xl:grid-cols-7"
      : "grid gap-2 sm:grid-cols-2 xl:grid-cols-7";
  }

  protected isSelectedDay(day: PlanningDaySummary): boolean {
    return day.local_date === this.anchorDate();
  }

  protected dayCellClass(day: PlanningDaySummary): string {
    const base =
      "block min-h-44 rounded-md border p-3 text-left transition focus-visible:shadow-focus";
    return this.isSelectedDay(day)
      ? `${base} border-meadow-700 bg-meadow-50 shadow-sm ring-2 ring-meadow-700 ring-offset-2`
      : `${base} border-mist-200 bg-white hover:border-meadow-600 hover:bg-mist-50`;
  }

  protected dayIndicators(day: PlanningDaySummary): readonly string[] {
    const indicators: string[] = [];
    if (day.status !== "empty") {
      indicators.push("Inputs saved");
    }
    if (day.status === "planned") {
      indicators.push(`Snapshot v${day.snapshot_version ?? "?"}`);
    }
    if (day.fixed_event_count > 0) {
      indicators.push(`${day.fixed_event_count} fixed`);
    }
    if (day.interruption_minutes > 0) {
      indicators.push(
        `${formatDuration(day.interruption_minutes)} interrupted`,
      );
    }
    if (day.unscheduled_deferred_count > 0) {
      indicators.push(`${day.unscheduled_deferred_count} deferred`);
    }
    if (day.has_useful_free_time) {
      indicators.push("Useful free time");
    }
    return indicators;
  }

  protected selectedDaySummary(day: PlanningDaySummary): string {
    if (day.status === "empty") {
      return "No saved inputs or current schedule snapshot for this date.";
    }
    if (day.status === "incomplete") {
      return "Saved inputs exist, but no generated schedule snapshot is current.";
    }
    return "Current generated snapshot summarizes this day only.";
  }

  protected freeTimePresenceLabel(count: number): string {
    return count === 0
      ? "No days with useful free time"
      : `${count} ${count === 1 ? "day" : "days"} with useful free time`;
  }

  protected overviewCells(
    summary: PlanningRangeSummary,
  ): readonly OverviewCell[] {
    const dayCells: OverviewCell[] = summary.days.map((day) => ({
      kind: "day",
      day,
    }));

    if (this.mode() !== "month") {
      return dayCells;
    }

    const leadingPadding = mondayFirstWeekdayIndex(summary.start_date);
    const trailingPadding = (7 - ((leadingPadding + dayCells.length) % 7)) % 7;
    const leadingCells = Array.from({ length: leadingPadding }, (_, index) => ({
      kind: "padding" as const,
      id: `leading-${index}`,
      label: "Leading empty calendar cell",
    }));
    const trailingCells = Array.from(
      { length: trailingPadding },
      (_, index) => ({
        kind: "padding" as const,
        id: `trailing-${index}`,
        label: "Trailing empty calendar cell",
      }),
    );

    return [...leadingCells, ...dayCells, ...trailingCells];
  }

  protected weekTimeZoneLabel(week: PlanningWeekDetail): string {
    const selected = week.days.find(
      (day) => day.summary.local_date === this.anchorDate(),
    );
    return (
      selected?.day?.time_zone ??
      selected?.summary.time_zone ??
      week.days.find((day) => day.day?.time_zone)?.day?.time_zone ??
      week.days.find((day) => day.summary.time_zone)?.summary.time_zone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone ??
      "Local time"
    );
  }

  protected weekBoundsLabel(week: PlanningWeekDetail): string {
    const bounds = weekBounds(week);
    return `${formatMinutesAsTime(bounds.startMinutes)}-${formatMinutesAsTime(bounds.endMinutes)}`;
  }

  protected weekHeightRem(week: PlanningWeekDetail): number {
    const bounds = weekBounds(week);
    return Math.max(
      36,
      ((bounds.endMinutes - bounds.startMinutes) * 1.15) / 16,
    );
  }

  protected weekTicks(week: PlanningWeekDetail): readonly WeekTick[] {
    const bounds = weekBounds(week);
    const totalMinutes = Math.max(1, bounds.endMinutes - bounds.startMinutes);
    const firstHour = Math.ceil(bounds.startMinutes / 60) * 60;
    const ticks: WeekTick[] = [
      {
        label: formatMinutesAsTime(bounds.startMinutes),
        topPercent: 0,
        labelTopPercent: null,
        labelClass: "absolute right-2 top-1",
        minutesFromStart: 0,
      },
    ];

    for (let minutes = firstHour; minutes < bounds.endMinutes; minutes += 60) {
      if (minutes === bounds.startMinutes) {
        continue;
      }
      ticks.push({
        label: formatMinutesAsTime(minutes),
        topPercent: ((minutes - bounds.startMinutes) / totalMinutes) * 100,
        labelTopPercent: ((minutes - bounds.startMinutes) / totalMinutes) * 100,
        labelClass: "absolute right-2 -translate-y-1/2",
        minutesFromStart: minutes - bounds.startMinutes,
      });
    }

    ticks.push({
      label: formatMinutesAsTime(bounds.endMinutes),
      topPercent: 100,
      labelTopPercent: null,
      labelClass: "absolute bottom-1 right-2",
      minutesFromStart: totalMinutes,
    });

    return ticks;
  }

  protected weekBlocksForDay(
    day: PlanningWeekDayDetail,
    week: PlanningWeekDetail,
  ): readonly WeekBlock[] {
    if (day.snapshot === null) {
      return [];
    }

    const bounds = weekBounds(week);
    const timeZone = day.day?.time_zone ?? day.summary.time_zone ?? "UTC";
    const totalMinutes = Math.max(1, bounds.endMinutes - bounds.startMinutes);
    const laneLayout = timelineLaneLayout(day.snapshot.items, timeZone);
    const completedIds = completedScheduleItemIds(
      day.snapshot,
      day.progress,
      timeZone,
    );
    const recoveryStates = recoveryStatesByTask(day.snapshot.decisions);

    return day.snapshot.items.map((item) => {
      const startMinutes = minutesFromIsoInZone(item.start_at, timeZone);
      const endMinutes = minutesFromIsoInZone(item.end_at, timeZone);
      const topMinutes = Math.max(0, startMinutes - bounds.startMinutes);
      const heightMinutes = Math.max(1, endMinutes - startMinutes);
      const lanes = laneLayout.get(item.id) ?? { laneIndex: 0, laneCount: 1 };
      const widthPercent = 100 / lanes.laneCount;
      const completionLabel = completedIds.has(item.id) ? "Done" : null;
      const recoveryState =
        item.kind === "task" &&
        item.task_id !== null &&
        completionLabel === null
          ? (recoveryStates.get(item.task_id) ?? null)
          : null;

      return {
        item,
        day,
        label: itemLabel(item, week.tasks, day.fixedEvents),
        kindLabel: formatKindLabel(item.kind),
        marker: itemMarker(item.kind),
        recoveryState,
        recoveryLabel:
          recoveryState === null ? null : recoveryLabelForState(recoveryState),
        completionLabel,
        minutes: heightMinutes,
        topPercent: (topMinutes / totalMinutes) * 100,
        heightPercent: (heightMinutes / totalMinutes) * 100,
        topMinutes,
        heightMinutes,
        laneIndex: lanes.laneIndex,
        laneCount: lanes.laneCount,
        leftPercent: lanes.laneIndex * widthPercent,
        widthPercent,
        isTiny: heightMinutes <= TINY_WEEK_BLOCK_MINUTES,
        isCompact: heightMinutes <= COMPACT_WEEK_BLOCK_MINUTES,
        showsDetails: heightMinutes >= DETAILED_WEEK_BLOCK_MINUTES,
      };
    });
  }

  protected weekSlotsForDay(
    day: PlanningWeekDayDetail,
    week: PlanningWeekDetail,
  ): readonly WeekSlot[] {
    const bounds = weekBounds(week);
    const totalMinutes = Math.max(1, bounds.endMinutes - bounds.startMinutes);
    const timeZone = day.day?.time_zone ?? day.summary.time_zone ?? "UTC";
    const unavailable =
      day.snapshot?.items
        .filter((item) => item.kind !== "designated_free_time")
        .map((item) => ({
          startMinutes: minutesFromIsoInZone(item.start_at, timeZone),
          endMinutes: minutesFromIsoInZone(item.end_at, timeZone),
        })) ?? [];
    const fixedEventUnavailable = day.fixedEvents.map((event) => ({
      startMinutes: minutesFromIsoInZone(event.start_at, timeZone),
      endMinutes: minutesFromIsoInZone(event.end_at, timeZone),
    }));
    const unavailableIntervals = [...unavailable, ...fixedEventUnavailable];
    const slots: WeekSlot[] = [];

    for (
      let startMinutes = bounds.startMinutes;
      startMinutes < bounds.endMinutes;
      startMinutes += 30
    ) {
      const endMinutes = Math.min(startMinutes + 30, bounds.endMinutes);
      if (
        unavailableIntervals.some(
          (item) =>
            startMinutes < item.endMinutes && endMinutes > item.startMinutes,
        )
      ) {
        continue;
      }

      const topMinutes = startMinutes - bounds.startMinutes;
      const start = formatMinutesAsTime(startMinutes);
      slots.push({
        id: `slot-${day.summary.local_date}-${start}`,
        localDate: day.summary.local_date,
        start,
        label: `${formatDateLabel(day.summary.local_date)} at ${start}`,
        topPercent: (topMinutes / totalMinutes) * 100,
        heightPercent: ((endMinutes - startMinutes) / totalMinutes) * 100,
        topMinutes,
        heightMinutes: endMinutes - startMinutes,
      });
    }

    return slots;
  }

  protected openWeekSlot(slot: WeekSlot): void {
    void this.router.navigate(["/planner"], {
      queryParams: {
        date: slot.localDate,
        create: "slot",
        start: slot.start,
      },
    });
  }

  protected openWeekBlock(block: WeekBlock): void {
    const queryParams: Record<string, string> = {
      date: block.day.summary.local_date,
    };
    if (block.item.kind === "task" && block.item.task_id !== null) {
      queryParams["editTask"] = block.item.task_id;
    } else if (
      block.item.kind === "fixed_event" &&
      block.item.fixed_event_id !== null
    ) {
      queryParams["editFixedEvent"] = block.item.fixed_event_id;
    } else if (block.item.kind === "designated_free_time") {
      queryParams["create"] = "slot";
      queryParams["start"] = formatMinutesAsTime(
        minutesFromIsoInZone(
          block.item.start_at,
          block.day.day?.time_zone ?? block.day.summary.time_zone ?? "UTC",
        ),
      );
    }

    void this.router.navigate(["/planner"], { queryParams });
  }

  protected weekBlockClass(block: WeekBlock): string {
    const density = block.isTiny
      ? "px-1 py-0"
      : block.isCompact
        ? "px-1 py-0.5"
        : "px-2 py-1";
    const shared = `absolute overflow-hidden rounded-sm border bg-white ${density} text-left shadow-sm transition focus-visible:z-20 focus-visible:shadow-focus`;

    switch (block.item.kind) {
      case "task":
        return `${shared} border-mist-200 border-l-4 border-l-meadow-600`;
      case "fixed_event":
        return `${shared} border-mist-200 border-l-4 border-l-signal-600`;
      case "interruption":
        return `${shared} border-mist-200 border-l-4 border-l-rose-500`;
      case "designated_free_time":
        return `${shared} border-mist-200 border-l-4 border-l-sky-500`;
      case "buffer":
        return `${shared} border-mist-200 border-l-4 border-l-mist-400`;
      default:
        return `${shared} border-mist-200 border-l-4 border-l-mist-300`;
    }
  }

  protected weekBlockMarkerLabel(block: WeekBlock): string {
    const labels = [block.marker, block.recoveryLabel, block.completionLabel]
      .filter((label): label is string => label !== null)
      .join(" - ");
    return labels.length > 0 ? labels : block.marker;
  }

  protected weekBlockCompactLabel(block: WeekBlock): string {
    return `${this.weekBlockMarkerLabel(block)} - ${block.label}`;
  }

  protected weekBlockAriaLabel(block: WeekBlock): string {
    const parts = [
      block.label,
      block.kindLabel,
      formatDuration(block.minutes),
      this.formatScheduleTimeRange(
        block.item.start_at,
        block.item.end_at,
        block.day.day?.time_zone ?? block.day.summary.time_zone ?? "UTC",
      ),
    ];

    if (block.recoveryLabel) {
      parts.push(block.recoveryLabel);
    }
    if (block.completionLabel) {
      parts.push(block.completionLabel);
    }

    return parts.join(", ");
  }

  protected formatScheduleTimeRange(
    start: string,
    end: string,
    timeZone: string | undefined | null,
  ): string {
    return `${formatTime(start, timeZone ?? "UTC")}-${formatTime(end, timeZone ?? "UTC")}`;
  }

  protected currentTimeIndicator(
    week: PlanningWeekDetail,
  ): CurrentTimeIndicator | null {
    const timeZone = this.weekTimeZoneLabel(week);
    const currentDate = localDateNowInZone(timeZone);
    if (!week.summary.days.some((day) => day.local_date === currentDate)) {
      return null;
    }

    const nowMinutes = minutesNowInZone(timeZone);
    const bounds = weekBounds(week);
    if (nowMinutes < bounds.startMinutes || nowMinutes > bounds.endMinutes) {
      return null;
    }

    return {
      date: currentDate,
      label: `Current time ${formatMinutesAsTime(nowMinutes)}`,
      topPercent:
        ((nowMinutes - bounds.startMinutes) /
          Math.max(1, bounds.endMinutes - bounds.startMinutes)) *
        100,
    };
  }

  protected deferredDecisionCount(week: PlanningWeekDetail): number {
    return week.days.reduce(
      (total, day) =>
        total +
        (day.snapshot?.decisions.filter((decision) =>
          isDeferredReasonCode(decision.reason_code),
        ).length ?? 0),
      0,
    );
  }

  protected movedDecisionCount(week: PlanningWeekDetail): number {
    return week.days.reduce(
      (total, day) =>
        total +
        (day.snapshot?.decisions.filter(
          (decision) => decision.reason_code === "moved_after_interruption",
        ).length ?? 0),
      0,
    );
  }
}

function overviewErrorState(anchorDate: string, error: unknown): OverviewState {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401 || error.status === 403) {
      return {
        status: "permission",
        anchorDate,
        message: "Sign in again before opening planner overviews.",
      };
    }
    if (error.status === 422) {
      return {
        status: "error",
        anchorDate,
        message: "Choose a valid overview date.",
      };
    }
  }

  return {
    status: "error",
    anchorDate,
    message:
      "Planner overview data did not load. Try again when the API is available.",
  };
}

function startOfWeek(value: string): string {
  const date = dateFromLocalDate(value);
  const mondayOffset = -mondayFirstWeekdayIndex(value);
  return localDateFromDate(addUtcDays(date, mondayOffset));
}

function mondayFirstWeekdayIndex(value: string): number {
  const day = dateFromLocalDate(value).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

function startOfMonth(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

function addDays(value: string, days: number): string {
  return localDateFromDate(addUtcDays(dateFromLocalDate(value), days));
}

function addMonths(value: string, months: number): string {
  const date = dateFromLocalDate(value);
  return localDateFromDate(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)),
  );
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
    ),
  );
}

function normalizeDateInput(value: string | null): string {
  return value !== null && isValidDateInput(value) ? value : todayLocalDate();
}

function isValidDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  return localDateFromDate(dateFromLocalDate(value)) === value;
}

function todayLocalDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDateNowInZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateFromLocalDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function localDateFromDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(dateFromLocalDate(value));
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) {
    return "0 min";
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) {
    return `${remainder} min`;
  }
  if (remainder === 0) {
    return `${hours} hr`;
  }
  return `${hours} hr ${remainder} min`;
}

function formatMinutesAsTime(minutes: number): string {
  const normalizedMinutes = Math.max(0, minutes);
  const hours = Math.floor(normalizedMinutes / 60) % 24;
  const remainder = normalizedMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatKindLabel(kind: string): string {
  switch (kind) {
    case "task":
      return "Flexible work";
    case "fixed_event":
      return "Fixed event";
    case "interruption":
      return "Reported unavailable time";
    case "buffer":
      return "Buffer";
    case "designated_free_time":
      return "Useful free time";
    default:
      return kind.replaceAll("_", " ");
  }
}

function itemMarker(kind: string): string {
  switch (kind) {
    case "task":
      return "Work";
    case "fixed_event":
      return "Fixed";
    case "interruption":
      return "Unavailable";
    case "buffer":
      return "Buffer";
    case "designated_free_time":
      return "Free";
    default:
      return "Block";
  }
}

function itemLabel(
  item: ScheduleItem,
  tasks: readonly Task[],
  fixedEvents: readonly FixedEvent[],
): string {
  if (item.kind === "task") {
    return tasks.find((task) => task.id === item.task_id)?.title ?? "Task";
  }

  if (item.kind === "fixed_event") {
    return (
      fixedEvents.find((event) => event.id === item.fixed_event_id)?.title ??
      "Fixed event"
    );
  }

  return formatKindLabel(item.kind);
}

function weekBounds(week: PlanningWeekDetail): {
  readonly startMinutes: number;
  readonly endMinutes: number;
} {
  const bounds = week.days
    .map((day) => {
      if (day.snapshot === null) {
        return null;
      }
      return timelineBounds(
        day.snapshot,
        day.day?.time_zone ?? day.summary.time_zone ?? "UTC",
      );
    })
    .filter((value): value is { startMinutes: number; endMinutes: number } =>
      Boolean(value),
    );

  if (bounds.length === 0) {
    return { startMinutes: 8 * 60, endMinutes: 18 * 60 };
  }

  return {
    startMinutes: Math.min(...bounds.map((bound) => bound.startMinutes)),
    endMinutes: Math.max(...bounds.map((bound) => bound.endMinutes)),
  };
}

function timelineBounds(
  snapshot: ScheduleSnapshot,
  timeZone: string,
): { readonly startMinutes: number; readonly endMinutes: number } {
  const configuredStart = configurationTimeMinutes(
    snapshot.configuration["day_start"],
  );
  const configuredEnd = configurationTimeMinutes(
    snapshot.configuration["day_end"],
  );
  const itemStarts = snapshot.items.map((item) =>
    minutesFromIsoInZone(item.start_at, timeZone),
  );
  const itemEnds = snapshot.items.map((item) =>
    minutesFromIsoInZone(item.end_at, timeZone),
  );
  const startMinutes = Math.min(configuredStart ?? 8 * 60, ...itemStarts);
  const endMinutes = Math.max(configuredEnd ?? 18 * 60, ...itemEnds);

  return { startMinutes, endMinutes };
}

function timelineLaneLayout(
  items: readonly ScheduleItem[],
  timeZone: string,
): ReadonlyMap<
  string,
  { readonly laneIndex: number; readonly laneCount: number }
> {
  const sortedItems = items
    .map((item, index) => ({
      item,
      index,
      startMinutes: minutesFromIsoInZone(item.start_at, timeZone),
      endMinutes: minutesFromIsoInZone(item.end_at, timeZone),
    }))
    .sort(
      (a, b) =>
        a.startMinutes - b.startMinutes ||
        a.endMinutes - b.endMinutes ||
        a.index - b.index,
    );
  const layout = new Map<string, { laneIndex: number; laneCount: number }>();
  let active: Array<{
    readonly laneIndex: number;
    readonly endMinutes: number;
  }> = [];
  let groupIds: string[] = [];
  let groupLaneCount = 0;

  const closeGroup = () => {
    if (groupIds.length === 0) {
      return;
    }

    for (const id of groupIds) {
      const existing = layout.get(id);
      if (existing) {
        layout.set(id, {
          laneIndex: existing.laneIndex,
          laneCount: Math.max(1, groupLaneCount),
        });
      }
    }
    groupIds = [];
    groupLaneCount = 0;
  };

  for (const entry of sortedItems) {
    const nextActive = active.filter(
      (candidate) => candidate.endMinutes > entry.startMinutes,
    );
    if (nextActive.length === 0) {
      closeGroup();
    }
    active = nextActive;

    const usedLanes = new Set(active.map((candidate) => candidate.laneIndex));
    let laneIndex = 0;
    while (usedLanes.has(laneIndex)) {
      laneIndex += 1;
    }

    layout.set(entry.item.id, { laneIndex, laneCount: 1 });
    active.push({
      laneIndex,
      endMinutes: Math.max(entry.endMinutes, entry.startMinutes + 1),
    });
    groupIds.push(entry.item.id);
    groupLaneCount = Math.max(groupLaneCount, active.length);
  }

  closeGroup();

  return layout;
}

function configurationTimeMinutes(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (match === null) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesFromIsoInZone(value: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: string) =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? "0");

  return part("hour") * 60 + part("minute");
}

function minutesNowInZone(timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (type: string) =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? "0");

  return part("hour") * 60 + part("minute");
}

function completedScheduleItemIds(
  snapshot: ScheduleSnapshot,
  progress: readonly TaskProgress[],
  timeZone: string,
): ReadonlySet<string> {
  const completedByTask = new Map<string, number>();
  for (const record of progress) {
    completedByTask.set(
      record.task_id,
      (completedByTask.get(record.task_id) ?? 0) + record.completed_minutes,
    );
  }

  const completedItemIds = new Set<string>();
  const taskItems = snapshot.items
    .filter((item) => item.kind === "task" && item.task_id !== null)
    .map((item, index) => ({
      item,
      index,
      startMinutes: minutesFromIsoInZone(item.start_at, timeZone),
      endMinutes: minutesFromIsoInZone(item.end_at, timeZone),
    }))
    .sort(
      (a, b) =>
        a.startMinutes - b.startMinutes ||
        a.endMinutes - b.endMinutes ||
        a.index - b.index,
    );

  for (const entry of taskItems) {
    const taskId = entry.item.task_id;
    if (taskId === null) {
      continue;
    }
    const remainingCompletedMinutes = completedByTask.get(taskId) ?? 0;
    const itemMinutes = Math.max(
      1,
      (Date.parse(entry.item.end_at) - Date.parse(entry.item.start_at)) /
        60_000,
    );

    if (remainingCompletedMinutes >= itemMinutes) {
      completedItemIds.add(entry.item.id);
      completedByTask.set(taskId, remainingCompletedMinutes - itemMinutes);
    } else {
      completedByTask.set(taskId, 0);
    }
  }

  return completedItemIds;
}

function recoveryStatesByTask(
  decisions: readonly ScheduleDecision[],
): ReadonlyMap<string, TimelineRecoveryState> {
  const states = new Map<string, TimelineRecoveryState>();

  for (const decision of decisions) {
    if (decision.task_id === null) {
      continue;
    }

    if (decision.reason_code === "moved_after_interruption") {
      states.set(decision.task_id, "moved");
    } else if (
      decision.reason_code === "split_across_available_windows" &&
      !states.has(decision.task_id)
    ) {
      states.set(decision.task_id, "split");
    }
  }

  return states;
}

function recoveryLabelForState(state: TimelineRecoveryState): string {
  switch (state) {
    case "moved":
      return "Moved";
    case "split":
      return "Split";
  }
}

function isDeferredReasonCode(reasonCode: string): boolean {
  return (
    reasonCode === "blocked_by_fixed_event" ||
    reasonCode === "blocked_by_interruption" ||
    reasonCode === "missed_before_current_time" ||
    reasonCode === "insufficient_time_before_deadline" ||
    reasonCode === "insufficient_remaining_day_time"
  );
}
