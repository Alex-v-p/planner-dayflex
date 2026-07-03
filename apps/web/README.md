# planner-dayflex web

This is the browser application foundation for `planner-dayflex`.

## Runtime and tooling

- Angular 22 with standalone components and TypeScript.
- Tailwind CSS 3 for utility styling.
- ESLint, Prettier, and Vitest for local quality checks.
- Node 22.22.3 or another runtime allowed by the package `engines` field.

## Commands

Run commands from `apps/web/`:

```sh
npm install
npm run start
npm run format
npm run lint
npm run test
npm run build
```

`npm run start` serves the app at `http://127.0.0.1:4200`.

## API configuration

The browser calls only the application API. It does not import scheduler,
database, AI, model, or service internals.

Runtime API configuration is loaded from `src/assets/app-config.json`.
Deployments can replace that asset without rebuilding the app. The committed
local default points at `/api`; `src/assets/app-config.example.json` shows a
local API URL example.

## Structure

The app follows the repository structure guide:

- `src/app/core/` owns configuration, HTTP setup, routing, and shell layout.
- `src/app/shared/` owns reusable presentational controls and feedback
  primitives.
- `src/app/features/` is intentionally absent until feature tickets introduce
  planner, task, event, schedule, or free-time screens.

## Ticket impact

- Data-model impact: None.
- Service/container impact: Browser/API only; no new service, Docker image, or
  Compose topology.
