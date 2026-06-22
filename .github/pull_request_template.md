## Summary

State what changed, why it changed, and the user or developer impact. Include
the root cause when this is a fix.

## Ticket

Closes #ISSUE_NUMBER, or name the durable `TKT-xxx` record.

## Acceptance criteria

State the satisfied outcomes as plain assertions. Use short, normal bullets
when helpful; never use checkboxes or classification fields as tasks.

## Screenshots

Attach before/after screenshots for UI changes, or state `Not applicable`.

## Validation

List the exact commands and their outcomes. Include manual verification where
useful. For Docker/Compose changes, include configuration validation,
image-build, and health/connection smoke results as applicable.

## CI changes

Explain any added or changed CI coverage, or state `None`.

## Risk level

State `Low`, `Medium`, or `High` followed by a concise reason.

## Data-model impact

State `None`, or list the added, changed, or removed tables, fields,
constraints, indexes, migrations, backfills, and rollback implications.

## Service and container impact

State `None`, or name the service boundary, contracts, configuration/secret
handling, Docker/Compose and network exposure, and the checks performed.

## Review

State the independent review outcome, including whether P0/P1 findings were
reported and how they were resolved. Mention any follow-up that still needs a
human decision.
