# OVRLD

A local-first strength training app for iPhone and Android: structured programs, fast offline logging, a progressive-overload engine and an adaptive weekly planner. Wearable sync (Oura, Apple Health) is planned after launch.

Public pages (privacy policy, support) live in `docs/` and are served by GitHub Pages.

Built with Expo SDK 58 (React Native, TypeScript), expo-sqlite + Drizzle ORM. See `phase2/architecture.md` in the FITNESS APP project for the design.

## Run it on the Android emulator (Windows)

Requires Node.js 20+ and the Android emulator already running.

```powershell
cd C:\Users\timrt\source\repos\overload
npm install
npx expo start --android
```

The first run installs Expo Go on the emulator and opens the app. Press `r` in the terminal to reload after code changes.

## Tests and checks

```powershell
npm test            # Vitest: migrations, seed, repositories, export/restore
npm run typecheck   # tsc --noEmit
npm run lint
```

## Project layout

| Path | What |
|---|---|
| `src/app/` | Screens (Expo Router). `(tabs)/` is the bottom-tab group. |
| `src/db/schema.ts` | Database schema: one place for every table. |
| `src/db/migrations/` | drizzle-kit SQL migrations, inlined into `bundle.ts` by `npm run db:generate`. |
| `src/db/repositories/` | All reads and writes. Synchronous, driver-agnostic, unit-tested in Node. |
| `src/db/seed/` | Our own exercise library (75 exercises) and four program templates. |
| `src/data/` | JSON backup/restore and CSV export. |
| `src/core/` | Pure helpers: units, dates, ids. Engines arrive here in step 3–4. |
| `tests/` | Vitest suites running against in-memory SQLite. |

## Changing the schema

1. Edit `src/db/schema.ts`.
2. `npm run db:generate` (runs drizzle-kit, then re-inlines migrations).
3. If you added a table, add it to `DATA_TABLES` in the schema and to `scripts/gen-triggers.mjs`, then add a new custom migration for its triggers.
