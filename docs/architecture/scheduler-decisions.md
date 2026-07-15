# Scheduler decisions for the first build

These defaults make the initial scheduler deterministic. Change them only with
a scoped ticket, an updated reference scenario, and matching tests.

| Topic | First-build decision |
| --- | --- |
| Planning time zone | Each planning day stores an IANA time zone. Use the user's configured zone, or the browser zone when a plan is first created. |
| Day bounds | Each user has configurable local start and end times; the initial default is 08:00–18:00. |
| Time representation | Persist timezone-aware instants and retain the planning day's IANA zone for display. Local times that do not exist during a daylight-saving change are invalid; ambiguous times need an explicit offset. |
| Interval rule | All blocks are half-open: `[start, end)`. A task ending at 10:00 may therefore begin when another block ends at 10:00. |
| Fixed-event conflicts | Two fixed events that overlap are invalid input. An interruption may overlap locked time; locked intervals are unioned and a warning explains that availability did not decrease twice. |
| Current time | New work cannot start before `max(day start, current time)`. Unfinished scheduled segments before that point are reconsidered. |
| Priority | Integer 1–5, where 5 is most important. |
| Deadline | The MVP accepts an optional local due date. It is a latest permissible end on that date; a task that cannot finish by it is returned as unscheduled with a deadline reason. |
| Task order | Higher priority first; then earlier deadline; then shorter remaining duration; then creation time and stable ID. No deadline sorts after a deadline at the same priority. |
| Buffer | Default 10 minutes after a flexible-task segment when space allows. Buffers never displace fixed events or turn a valid task segment into an invalid one. |
| Splitting | A task may be split only when explicitly allowed. Each segment must be at least 15 minutes, and a task has at most three segments in one planning day. |
| Free time | Return remaining windows of at least 30 minutes as designated free time. Smaller gaps are neither scheduled work nor a promoted free-time result. |

Task order is the deterministic **selection order**, not a promise about where a
task appears in the chronological timeline. After choosing a task, the
scheduler scans all currently available windows from earliest to latest for its
first valid whole placement. A lower-priority task can therefore appear earlier
when a higher-priority task cannot fit in that earlier gap. Results are always
returned in chronological order.

## Stable reason codes

The scheduler returns facts, not only prose. The first contract uses these
codes where applicable:

- `placed_in_earliest_valid_window`
- `moved_after_interruption`
- `split_across_available_windows`
- `blocked_by_fixed_event`
- `blocked_by_interruption`
- `missed_before_current_time`
- `insufficient_time_before_deadline`
- `insufficient_remaining_day_time`
- `designated_free_time`
- `locked_time_overlap_merged`

The user interface may turn these into gentler explanations, but it must not
invent a different reason.
