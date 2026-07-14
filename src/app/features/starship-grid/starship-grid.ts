import { Component, ViewEncapsulation, inject, signal } from '@angular/core';
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
import { debounceTime, distinctUntilChanged, finalize, map } from 'rxjs/operators';

import { Starship, SwapiService } from '../../core/services/swapi.service';

ModuleRegistry.registerModules([AllCommunityModule]);

const PAGE_SIZE = 10;

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
  styleUrl: './starship-grid.css',
  // This stylesheet targets AG Grid's internally-rendered DOM (not part of
  // Angular's own template) and a Tailwind @theme override meant to apply
  // globally, so it must not be scoped to this component.
  encapsulation: ViewEncapsulation.None,
})
export class StarshipGridComponent {
  private readonly swapiService = inject(SwapiService);
  private readonly searchInput$ = new Subject<string>();
  private gridApi?: GridApi;

  searchTerm = signal('');
  isLoading = signal(true);
  hasError = signal(false);
  totalCount = signal<number | null>(null);
  reachedEnd = signal(false);

  cacheBlockSize = PAGE_SIZE;

  defaultColDef: ColDef = {
    cellClass: '!border-r !border-gray-100',
    headerClass: 'border-r border-gray-200',
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
    { field: 'name', headerName: 'Name', resizable: true, headerClass: 'border-r border-gray-200 hdr-icon-name' },
    {
      field: 'starship_class',
      headerName: 'Class',
      resizable: true,
      headerClass: 'border-r border-gray-200 hdr-icon-class',
    },
    { field: 'model', headerName: 'Model', resizable: true, headerClass: 'border-r border-gray-200 hdr-icon-model' },
    {
      field: 'manufacturer',
      headerName: 'Manufacturer',
      resizable: true,
      headerClass: 'border-r border-gray-200 hdr-icon-manufacturer',
    },
    {
      field: 'pilots.length',
      headerName: 'Known Pilots',
      resizable: false,
      headerClass: 'border-r border-gray-200 hdr-icon-pilots',
    },
    { field: 'crew', headerName: 'Crew', resizable: false, headerClass: 'border-r border-gray-200 hdr-icon-crew' },
    {
      field: 'passengers',
      headerName: 'Passengers',
      resizable: false,
      headerClass: 'border-r border-gray-200 hdr-icon-passengers',
    },
    {
      field: 'cargo_capacity',
      headerName: 'cargo capacity',
      resizable: false,
      editable: true,
      headerClass: 'border-r border-gray-200 hdr-icon-cargo',
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

      request$
        .pipe(
          finalize(() => {
            if (isFirstBlock) {
              this.isLoading.set(false);
            }
          }),
        )
        .subscribe({
          next: (response) => {
            if (isFirstBlock) {
              this.hasError.set(false);
            }
            this.totalCount.set(response.count);
            params.successCallback(response.results, response.count);
          },
          error: () => {
            if (isFirstBlock) {
              this.hasError.set(true);
            }
            params.failCallback();
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
    this.gridApi?.purgeInfiniteCache();
  }

  onRetry(): void {
    this.hasError.set(false);
    this.gridApi?.purgeInfiniteCache();
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
