# Visual inspiration

Visual references help establish tone, hierarchy, and interaction ideas; they
do not override product specifications or permit a pixel-for-pixel copy of
another interface.

The reference images themselves are local-only at
`docs/design/inspiration/screenshots/` and are ignored by Git. This keeps
copyrighted, large, or accidentally sensitive images out of GitHub history
while preserving a small, reviewable catalog of the lessons drawn from them.
Production assets that the app is licensed to ship are a separate concern and
may be versioned with the application when a feature requires them.

## Adding a reference

1. Use a descriptive filename such as `dark-week-calendar-dashboard.png`.
2. Record the source, date, relevant screen, and intended takeaway in
   [`catalog.md`](catalog.md).
3. Remove private names, personal schedules, tokens, and other sensitive
   information before committing a screenshot.
4. Link the catalog entry from a UI ticket so its use is explicit.

For `planner-dayflex`, favor calm hierarchy, readable time blocks, clear
recovery states, and accessible status indicators. Do not rely on color alone
to communicate a moved, blocked, or completed state.
