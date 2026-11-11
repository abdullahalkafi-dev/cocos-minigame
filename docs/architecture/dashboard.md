# Dashboard architecture

The buyer's web app: sign up, buy games, customize them in an asset studio with a live phone preview, manage the API key, see players and results.

**Next.js 15 (App Router) with `output: 'export'`**: it builds to plain static files that the API server serves, so there is no second Node process in production. React 19, TypeScript.

```
dashboard/src/
  app/                    routes only; each page file just renders a feature component
    layout.tsx            html shell + AppProvider (signed-in user, toasts)
    globals.css           design tokens, light/dark themes, components
    (public)/login, register
    (app)/                everything that needs a signed-in buyer; layout = AppShell (sidebar)
      page.tsx            overview
      store, games, game, api-key
  features/               one folder per feature: the real screens
    auth/                 AuthPage, auth-context (user + toasts)
    overview/  store/  api-key/
    games/                MyGamesPage, GameDetailPage (tabs), IntegrateTab, IntegrateSnippets, PlayersTab, SettingsTab
    studio/               the asset studio (forms generated from the game's manifest)
  components/             shared UI: AppShell, ui.tsx (icons, buttons, cards, modal, media preview)
  lib/                    api.ts (fetch client), paths.ts, snippets.ts (code samples), use-origin.ts
```

## Conventions

- **Pages are thin.** `app/**/page.tsx` imports one feature component. Logic and markup live in `features/`.
- **All screens are client components** (`'use client'`): the buyer's token is in `localStorage`, so data is fetched in the browser. Hooks that read browser APIs run in effects so the static build never touches `window`.
- **Auth gate:** `AppShell` redirects to `/login` when there is no signed-in user; the login page redirects away when there is one.
- **One game page:** because the export is static, a game is opened with a query string: `/game?id=<gameId>&tab=customize|integrate|players|settings` (`lib/paths.ts: gamePath`). The server redirects the older `/games/<id>/<tab>` form.
- **The studio is manifest-driven.** It renders forms from the `manifest` returned by `GET /api/licenses/:id`, so a new game needs no dashboard code.
- **API access** goes through `lib/api.ts` (adds the token, turns errors into `ApiError`, signs the user out on 401).

## Build and run

```bash
npm run build -w dashboard      # next build + copies dashboard/out to server/public/app
npm run dev -w dashboard        # next dev on :5173, forwards /api, /g, /uploads, ... to the server on :3000
npm run typecheck -w dashboard
```

The server serves `server/public/app` with extensionless URLs (`/login` → `login.html`) and caches `/_next/static` for a year (file names are hashed). Restart the server after rebuilding the dashboard.
