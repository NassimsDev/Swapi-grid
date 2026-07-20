import { Component, inject, signal } from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import {
  AllCommunityModule,
  CellValueChangedEvent,
  ColDef,
  GridApi,
  GridReadyEvent,
  IDatasource,
  IGetRowsParams,
  ModuleRegistry,
  SortModelItem,
} from 'ag-grid-community';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';

import { Starship, SwapiService } from '../../core/services/swapi.service';

ModuleRegistry.registerModules([AllCommunityModule]);

const PAGE_SIZE = 10;

const HEADER_CLASS = 'border-r border-gray-200 text-gray-400 text-sm';

// Header icons are Lucide glyphs drawn on the header text's ::before via
// Tailwind utilities; the codepoints live in @theme (--icon-*) in styles.css.
// They target .ag-header-cell-text (through an arbitrary variant, since these
// classes land on the header cell) because AG Grid already uses the header
// cell's own ::before for its resize separator. Every candidate must appear
// literally in this file — Tailwind scans source text, so no interpolation.
const ICON_HEADER_CLASS = `${HEADER_CLASS} [&_.ag-header-cell-text]:inline-flex [&_.ag-header-cell-text]:items-center [&_.ag-header-cell-text]:gap-[5px] [&_.ag-header-cell-text]:before:font-[family-name:lucide] [&_.ag-header-cell-text]:before:text-lg [&_.ag-header-cell-text]:before:leading-none [&_.ag-header-cell-text]:before:font-normal`;

// crew/passengers/cargo_capacity are raw SWAPI strings (e.g. "30-165", "1,000,000", "unknown").
// pilots.length is already numeric but shares the same numeric-compare path.
const NUMERIC_SORT_COLUMN_IDS = new Set(['pilots.length', 'crew', 'passengers', 'cargo_capacity']);

// SWAPI uses "unknown" (and similar non-numeric text) as a null placeholder in
// otherwise-numeric fields. Treat it as null so it can always sort last below.
function parseNumericValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const match = value.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

function compareNumeric(a: number | null, b: number | null, direction: number): number {
  if (a === null || b === null) {
    return a === b ? 0 : a === null ? 1 : -1;
  }
  return (a - b) * direction;
}

@Component({
  selector: 'app-starship-grid',
  imports: [AgGridAngular],
  templateUrl: './starship-grid.html',
})
export class StarshipGridComponent {
  private static readonly MAX_AUTO_RETRIES = 3;

  private readonly swapiService = inject(SwapiService);
  private readonly searchInput$ = new Subject<string>();
  private gridApi?: GridApi;
  private autoRetryCount = 0;
  private autoRetryTimer?: ReturnType<typeof setTimeout>;

  searchTerm = signal('');
  isLoading = signal(true);
  hasError = signal(false);
  totalCount = signal<number | null>(null);
  reachedEnd = signal(false);

  cacheBlockSize = PAGE_SIZE;

  defaultColDef: ColDef = {
    cellClass: '!border-r !border-gray-100',
    headerClass: HEADER_CLASS,
    sortable: true,
  };

  colDefs: ColDef[] = [
    {
      colId: 'rowNumber',
      headerName: '#',
      valueGetter: (params) => (params.node?.rowIndex ?? 0) + 1,
      pinned: 'left',
      width: 60,
      resizable: false,
      sortable: false,
      filter: false,
    },
    {
      field: 'name',
      headerName: 'Name',
      resizable: true,
      headerClass: `${ICON_HEADER_CLASS} [&_.ag-header-cell-text]:before:content-[var(--icon-plane)_/_'']`,
    },
    {
      field: 'starship_class',
      headerName: 'Class',
      resizable: true,
      headerClass: `${ICON_HEADER_CLASS} [&_.ag-header-cell-text]:before:content-[var(--icon-tag)_/_'']`,
    },
    {
      field: 'model',
      headerName: 'Model',
      resizable: true,
      headerClass: `${ICON_HEADER_CLASS} [&_.ag-header-cell-text]:before:content-[var(--icon-cpu)_/_'']`,
    },
    {
      field: 'manufacturer',
      headerName: 'Manufacturer',
      resizable: true,
      headerClass: `${ICON_HEADER_CLASS} [&_.ag-header-cell-text]:before:content-[var(--icon-factory)_/_'']`,
    },
    {
      field: 'pilots.length',
      headerName: 'Known Pilots',
      resizable: false,
      headerClass: `${ICON_HEADER_CLASS} [&_.ag-header-cell-text]:before:content-[var(--icon-circle-user-round)_/_'']`,
    },
    {
      field: 'crew',
      headerName: 'Crew',
      resizable: false,
      headerClass: `${ICON_HEADER_CLASS} [&_.ag-header-cell-text]:before:content-[var(--icon-users-round)_/_'']`,
    },
    {
      field: 'passengers',
      headerName: 'Passengers',
      resizable: false,
      headerClass: `${ICON_HEADER_CLASS} [&_.ag-header-cell-text]:before:content-[var(--icon-tickets-plane)_/_'']`,
    },
    {
      field: 'cargo_capacity',
      headerName: 'cargo capacity',
      resizable: false,
      editable: true,
      cellEditor: 'agNumberCellEditor',
      cellEditorParams: { min: 0 },
      headerClass: `${ICON_HEADER_CLASS} [&_.ag-header-cell-text]:before:content-[var(--icon-box)_/_'']`,
    },
  ];

  dataSource: IDatasource = {
    getRows: (params: IGetRowsParams<Starship>) => {
      const isFirstBlock = params.startRow === 0;

      if (isFirstBlock) {
        this.isLoading.set(true);
      }

      const search = this.searchTerm();
      const sortModel = params.sortModel;

      const request$ =
        search || sortModel.length
          ? (search ? this.swapiService.searchStarshipsByName(search) : this.swapiService.getAllStarships()).pipe(
              map((results) => {
                const sorted = this.applySort(results, sortModel);
                return {
                  results: sorted.slice(params.startRow, params.endRow),
                  count: sorted.length,
                };
              }),
            )
          : this.swapiService.getStarships(Math.floor(params.startRow / PAGE_SIZE) + 1);

      request$.subscribe({
        next: (response) => {
          if (isFirstBlock) {
            this.isLoading.set(false);
            this.hasError.set(false);
          }
          this.autoRetryCount = 0;
          this.totalCount.set(response.count);
          params.successCallback(response.results, response.count);
        },
        error: () => {
          params.failCallback();
          // AG Grid never re-requests a failed block on its own, which would
          // leave those rows permanently empty — so retry them ourselves.
          const willRetry = this.scheduleBlockRetry();
          if (isFirstBlock) {
            if (willRetry) {
              this.isLoading.set(true);
            } else {
              this.isLoading.set(false);
              this.hasError.set(true);
            }
          }
        },
      });
    },
  };

  constructor() {
    this.searchInput$.pipe(debounceTime(300), distinctUntilChanged()).subscribe((query) => {
      this.onSearch(query);
    });
  }

  onSearchInputChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchInput$.next(value);
  }

  onSearch(query: string): void {
    this.searchTerm.set(query);
    this.reachedEnd.set(false);
    this.autoRetryCount = 0;
    this.gridApi?.purgeInfiniteCache();
  }

  onRetry(): void {
    this.hasError.set(false);
    this.autoRetryCount = 0;
    this.gridApi?.purgeInfiniteCache();
  }

  // Schedules a single delayed cache purge so failed blocks get re-requested
  // (already-loaded pages replay instantly from the service cache). Returns
  // false once the retry budget is exhausted, so the caller can surface the
  // error state instead.
  private scheduleBlockRetry(): boolean {
    if (this.autoRetryTimer) {
      return true;
    }
    if (this.autoRetryCount >= StarshipGridComponent.MAX_AUTO_RETRIES) {
      return false;
    }
    this.autoRetryCount++;
    this.autoRetryTimer = setTimeout(() => {
      this.autoRetryTimer = undefined;
      this.gridApi?.purgeInfiniteCache();
    }, 2000);
    return true;
  }

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
  }

  onBodyScrollEnd(): void {
    const total = this.totalCount();
    if (total === null || !this.gridApi) {
      return;
    }

    this.reachedEnd.set(this.gridApi.getLastDisplayedRowIndex() >= total - 1);
  }

  onCellValueChanged(event: CellValueChangedEvent<Starship>): void {
    const field = event.colDef.field as keyof Starship | undefined;
    if (event.source !== 'edit' || !field) {
      return;
    }

    const changes = { [field]: event.newValue } as Partial<Starship>;

    this.swapiService.updateStarship(event.data, changes).subscribe({
      error: () => event.node.setDataValue(field, event.oldValue),
    });
  }

  private getFieldValue(item: Starship, colId: string): unknown {
    return colId.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], item);
  }

  private applySort(items: Starship[], sortModel: SortModelItem[]): Starship[] {
    if (!sortModel.length) {
      return items;
    }

    const { colId, sort } = sortModel[0];
    const direction = sort === 'desc' ? -1 : 1;

    return [...items].sort((a, b) => {
      const aValue = this.getFieldValue(a, colId);
      const bValue = this.getFieldValue(b, colId);

      if (NUMERIC_SORT_COLUMN_IDS.has(colId)) {
        return compareNumeric(parseNumericValue(aValue), parseNumericValue(bValue), direction);
      }

      return String(aValue ?? '').localeCompare(String(bValue ?? '')) * direction;
    });
  }
}
