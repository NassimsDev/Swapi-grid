# Star Wars Fleet — SWAPI Grid

A front-end-only Angular app that browses SWAPI starship data in an AG Grid data grid, with infinite scroll, search, sorting, and one client-side-editable column.

## Install and run

```bash
npm install
npm start        # ng serve — http://localhost:4200
```

- `npm run build` — production build to `dist/`
- `npm test` — unit tests (`ng test`, powered by Vitest)

## SWAPI resource

`https://swapi.dev/api/starships/` — the Starships endpoint. See [swapi.service.ts](src/app/core/services/swapi.service.ts).

## Infinite scroll and the "no loader while scrolling" behavior

- AG Grid's Infinite Row Model (`rowModelType: 'infinite'`) is used, with `cacheBlockSize` set to match SWAPI's own page size (10). A custom `IDatasource` (`dataSource` in [starship-grid.ts](src/app/features/starship-grid/starship-grid.ts)) maps each block AG Grid requests directly onto one SWAPI page (or, while a search/sort is active, a slice of the full locally-fetched dataset — see Trade-offs below).
- The loading overlay (`isLoading` signal) is only toggled for the very first block (`params.startRow === 0`). Every subsequent block requested by scrolling never touches `isLoading`, so no loader appears once the initial rows are on screen.
- Each SWAPI page is cached in `SwapiService.getStarships()` (a `Map<page, Observable>` with `shareReplay(1)`), so re-scrolling past already-seen rows never re-fetches them. A failed request evicts its own cache entry (`catchError` + `cache.delete`) so Retry actually re-fetches instead of replaying the cached error.

## Editable column and where edits are stored

- `cargo_capacity` is the editable column (`editable: true`).
- On edit, `onCellValueChanged` calls `SwapiService.updateStarship()`. SWAPI itself is read-only, so this method does **not** call the API — it resolves to the merged object in memory. AG Grid's own row-data model holds the new value, so it's visible for the rest of the session but is **not persisted anywhere** (no backend, no `localStorage`): a page refresh reverts it to the original SWAPI value. If the update observable ever errors, the cell is rolled back to its previous value via `node.setDataValue(field, oldValue)`.

## Column resizing

Native AG Grid Community behavior: `resizable: true` on the text columns (Name, Class, Model, Manufacturer). The narrow numeric columns (#, Known Pilots, Crew, Passengers, cargo capacity) are fixed-width (`resizable: false`) since their content is short and consistent. No custom resize logic was written.

## Trade-offs and limitations

- Search only matches the `name` field. SWAPI's own `?search=` parameter also matches `model`, so it can't be used directly — search instead fetches (and caches) every page client-side and filters locally by name.
- For the same reason, any active column sort switches the grid off the paginated per-page endpoint onto the full, locally-fetched-and-sorted dataset. The first search or sort in a session pays for all page requests up front; subsequent ones reuse the cached pages.
- Because SWAPI is read-only, edited `cargo_capacity` values are never persisted server-side — they live only in AG Grid's in-memory row model for the current session.
- Numeric columns (Known Pilots, Crew, Passengers, cargo capacity) are raw SWAPI strings (e.g. `"30-165"`, `"1,000,000"`, `"unknown"`) parsed to a number for sorting; unparseable values (`"unknown"`) are treated as null and always sort last, regardless of sort direction.
- No end-to-end/browser test coverage — functional verification during development was done manually in a real browser. Unit tests cover the service's pagination/caching logic and the grid's sort and edit behavior.
- swapi.dev can be intermittently slow or unavailable; there's a Retry button on failure but no automatic retry/backoff.

## Third-party packages

- `ag-grid-angular` / `ag-grid-community` — the data grid itself (infinite row model, sorting, cell editing).
- `tailwindcss` (v4) — all styling.
- `@fontsource/inter` — self-hosted Inter font (no external font CDN).
- `rxjs` — already an Angular dependency; used for debouncing the search input and caching/sharing HTTP requests.
- [Material Icons](https://fonts.google.com/icons) — column header icons.
