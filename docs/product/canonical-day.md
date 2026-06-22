# Canonical MVP day

This scenario is the shared product example for the first planning flow. It is
small enough for scheduler unit tests and rich enough to exercise the core
promise: recovering after an interruption.

## Inputs

| Setting | Value |
| --- | --- |
| Planning day | 2026-06-22 |
| Time zone | Europe/Brussels |
| Day bounds | 08:00–18:00 |
| Default buffer | 10 minutes |

### Locked events

| Time | Event |
| --- | --- |
| 09:00–10:00 | Team meeting |
| 12:00–13:00 | Lunch appointment |
| 15:30–16:00 | Collection appointment |

### Flexible tasks

| Task | Estimate | Priority | Deadline | Splitting |
| --- | --- | --- | --- | --- |
| Reply to inbox | 45 min | 4 | None | No |
| Write report | 90 min | 5 | None | No |
| Study notes | 90 min | 3 | None | Yes, 15-min minimum |
| Buy groceries | 30 min | 2 | 2026-06-22 | No |

## Expected first plan

| Time | Result |
| --- | --- |
| 08:00–08:45 | Reply to inbox |
| 08:45–08:55 | Buffer |
| 09:00–10:00 | Team meeting |
| 10:00–11:30 | Write report |
| 11:30–11:40 | Buffer |
| 12:00–13:00 | Lunch appointment |
| 13:00–14:30 | Study notes |
| 14:30–14:40 | Buffer |
| 14:40–15:10 | Buy groceries |
| 15:10–15:20 | Buffer |
| 15:30–16:00 | Collection appointment |
| 16:00–18:00 | Designated free time |

The report is marked complete at 11:30. At 14:00, the user reports an
interruption from 14:00 until 15:15. The completed 60 minutes of study remain
credited; its unfinished 30 minutes must be replanned.

## Expected revised plan

| Time | Result |
| --- | --- |
| 13:00–14:00 | Completed study work, preserved as history |
| 14:00–15:15 | Interruption |
| 15:30–16:00 | Collection appointment |
| 16:00–16:30 | Remaining study work |
| 16:30–16:40 | Buffer |
| 16:40–17:10 | Buy groceries, moved later |
| 17:10–17:20 | Buffer |
| 17:20–18:00 | Designated free time |

The revised result should identify the study segment as moved after an
interruption and preserve its recorded partial completion. Grocery shopping
remains scheduled because it still fits before the local end of day. This is a
reference scenario, not a hidden multi-day optimization rule.
