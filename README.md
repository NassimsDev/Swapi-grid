# Star Wars Fleet — SWAPI Grid

A front-end-only Angular app that browses SWAPI starship data in an AG Grid data grid, with infinite scroll, search, sorting, and one client-side-editable column.

**Live demo:** https://swapi-grid.netlify.app

| Layer | Choice | Why |
|---|---|---|
| Framework | Angular 21 (standalone, zoneless, signals) | Modern Angular defaults: no NgModules, no zone.js — all rendered state lives in signals, which makes change detection explicit and predictable. |
| Data grid | AG Grid Community 36 | Ships an Infinite Row Model out of the box, which maps naturally onto SWAPI's page-based API. |
| Styling | Tailwind CSS 4 | Utility-first styling directly in templates; v4's CSS-first config (`@theme`) removes the JS config file entirely. |
| Async | RxJS 7.8 | Search debouncing, request caching/sharing, and parallel page fetching are all one-operator concerns. |
| Tests | Vitest 4 (via `ng test`) | The test runner integrated with Angular's esbuild builder. |

## Install and run

```bash
npm install
npm start        # ng serve — http://localhost:4200
```

| Command | What it does |
|---|---|
| `npm start` | Dev server with hot reload on http://localhost:4200 |
| `npm run build` | Production build to `dist/swapi-grid/browser` |
| `npm test` | Unit tests (Vitest, jsdom environment, no real network) |

## SWAPI resource

`https://swapi.dev/api/starships/` — the **Starships** endpoint. See [swapi.service.ts](src/app/core/services/swapi.service.ts).

The API is paginated (10 results per page, `count` gives the grand total) and **read-only** — two facts that drive most of the design decisions below.

## Infinite scroll and the "no loader while scrolling" behavior

AG Grid's Infinite Row Model (`rowModelType: 'infinite'`) pulls rows block-by-block from a custom `IDatasource` (`dataSource` in [starship-grid.ts](src/app/features/starship-grid/starship-grid.ts)) as the user scrolls.

| Decision | How | Why |
|---|---|---|
| 1 grid block = 1 SWAPI page | `cacheBlockSize` is set to 10, SWAPI's own page size | Each block AG Grid requests maps exactly onto one API page — no overfetching, no client-side re-slicing in the nominal case. |
| Loader on first load only | `isLoading` is toggled **only** when `params.startRow === 0` | Scroll-triggered blocks load silently; rows just appear when ready. The spinner is only shown before the very first rows exist. |
| Pages are never fetched twice | `SwapiService` caches a `Map<page, Observable>` with `shareReplay(1)` | Scrolling back up (or re-requesting a block) replays the cached response instantly — zero network traffic for already-seen pages. |
| Failed requests don't poison the cache | `catchError` evicts the failed page from the `Map` | Without eviction, the cached observable would replay the *error* forever and the Retry button would be useless. |
| Errors are recoverable | Error overlay + Retry button; Retry calls `purgeInfiniteCache()` | AG Grid re-requests its blocks, which now miss the cache and hit the network again. |

## Editable column and where edits are stored

**`cargo_capacity`** is the editable column.

| Aspect | Implementation |
|---|---|
| Input validation | `cellEditor: 'agNumberCellEditor'` with `min: 0` — the editor renders `<input type="number">`, so non-numeric characters are physically blocked at the keystroke and negative values are rejected. |
| Save flow | `onCellValueChanged` → `SwapiService.updateStarship()`. Only events with `source === 'edit'` are handled, so programmatic value changes never trigger a save (and can't loop). |
| Where the value lives | **In AG Grid's in-memory row model only.** SWAPI is read-only, so `updateStarship()` resolves to the merged object without calling the API. The edit survives scrolling within the session but a page refresh restores the original SWAPI value. No backend, no `localStorage` — by design, per the brief. |
| Failure handling | Optimistic update with rollback: if the update observable errors, the cell is restored via `node.setDataValue(field, oldValue)`. |
| Future-proofing | Swapping the fake write for a real one is a one-line change inside `updateStarship()` (`http.patch(...)`) — the component wiring (including rollback) is already backend-ready. |

## Column resizing

Native AG Grid Community behavior — no custom resize logic was written.

| Columns | `resizable` | Rationale |
|---|---|---|
| Name, Class, Model, Manufacturer | `true` | Free-text fields with highly variable length — worth letting the user widen them. |
| #, Known Pilots, Crew, Passengers, cargo capacity | `false` | Short, consistent numeric content; fixed widths keep the layout stable. |

## Trade-offs and limitations

| Trade-off | Cause | Consequence |
|---|---|---|
| Search is client-side | SWAPI's `?search=` parameter also matches the `model` field, but the requirement was to match **`name` only** | Search fetches (and caches) every page once, then filters locally, case-insensitive, on `name`. |
| Sorting is client-side | SWAPI has no server-side sort at all | An active sort switches the datasource from per-page fetching to the full locally-sorted dataset, sliced per block. The first search/sort in a session pays for all page requests up front (36 ships → 4 requests, parallelized with `forkJoin`); every later one reuses the cache. |
| Edits are not persisted | SWAPI is read-only | Edited values live only in the grid's memory for the current session (see above). |
| Numeric fields are messy strings | SWAPI returns `"30-165"`, `"1,000,000"`, `"unknown"`, `"n/a"` | A parser strips thousands separators and extracts the first number; unparseable values become `null` and **always sort last, regardless of sort direction** — "unknown" never tops a ranking. |
| No e2e test suite | Scope decision | Functional verification was done manually in a real browser during development. Unit tests (11) cover the service's pagination/caching and the grid's sorting/editing logic, with HTTP and the service mocked. |
| Availability depends on swapi.dev | Free third-party API, occasionally slow or down, and its CDN emits cache/CORS headers inconsistently (which can poison the browser's HTTP cache) | Three layers of resilience: every request carries a unique `_ts` param so no browser/CDN cache can ever serve a stale or CORS-broken entry; requests time out after 10 s and retry twice with a 1 s delay; blocks that still fail trigger up to 3 automatic grid-cache purges. Only after all that does the error overlay with its manual Retry button appear. |

## Third-party packages

| Package | Role | Note |
|---|---|---|
| `ag-grid-angular` / `ag-grid-community` | The data grid | Infinite Row Model, sorting UI, cell editing. Legacy CSS theming (`[theme]="'legacy'"` + imported theme CSS). |
| `tailwindcss` (v4) + `@tailwindcss/postcss` | All styling | Wired through `.postcssrc.json` (the only PostCSS config Angular's builder reads). **100% Tailwind — there is no component stylesheet at all**: even AG Grid's internally-rendered DOM (header icons, sort-arrow hover previews, theme variables) is styled with arbitrary variants/properties (`[&_.ag-header-cell-text]:before:...`, `[--ag-font-family:...]`). The only CSS in `styles.css` besides imports is Tailwind's own `@theme` config block and the Lucide `@font-face`. |
| `@fontsource/inter` | Inter font | Self-hosted through npm — no font CDN at runtime. |
| `lucide-static` | Column header + search icons | Self-hosted Lucide icon font. Lucide was chosen over Material Design icons because its icon set looks more modern and professional — a better fit for a data-heavy UI. `plane` was picked to represent the starships (Name column) and `tickets-plane` to represent the passenger count. Consumed as a bare `@font-face` (its CSS with ~1500 unused icon classes is not imported); glyph codepoints are declared as `@theme` tokens and drawn through Tailwind `before:content-[var(--icon-*)]` utilities in `headerClass`, keeping AG Grid's native header (sorting) intact. |
| `rxjs` | Async plumbing | Already an Angular dependency; used for the 300 ms search debounce, `shareReplay` caching, and `forkJoin` page fetching. |
