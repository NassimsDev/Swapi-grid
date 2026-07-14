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
} from 'ag-grid-community';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, map } from 'rxjs/operators';

import { Starship, SwapiService } from '../../core/services/swapi.service';

ModuleRegistry.registerModules([AllCommunityModule]);

const PAGE_SIZE = 10;

@Component({
  selector: 'app-starship-grid',
  imports: [AgGridAngular],
  templateUrl: './starship-grid.html',
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

  colDefs: ColDef[] = [
    {
      headerName: '#',
      valueGetter: (params) => (params.node?.rowIndex ?? 0) + 1,
      pinned: 'left',
      width: 60,
      resizable: false,
      sortable: false,
      filter: false,
    },
    { field: 'name', headerName: 'Name', resizable: true },
    { field: 'starship_class', headerName: 'Class', resizable: true },
    { field: 'model', headerName: 'Model', resizable: true },
    { field: 'manufacturer', headerName: 'Manufacturer', resizable: true },
    { field: 'pilots.length', headerName: 'Known Pilots', resizable: false },
    { field: 'crew', headerName: 'Crew', resizable: false },
    { field: 'passengers', headerName: 'Passengers', resizable: false },
    {field: 'cargo_capacity', headerName: 'cargo capacity' , resizable: false , editable: true }
  ];

  dataSource: IDatasource = {
    getRows: (params: IGetRowsParams<Starship>) => {
      const isFirstBlock = params.startRow === 0;

      if (isFirstBlock) {
        this.isLoading.set(true);
      }

      const search = this.searchTerm();
      const request$ = search
        ? this.swapiService.searchStarshipsByName(search).pipe(
            map((results) => ({
              results: results.slice(params.startRow, params.endRow),
              count: results.length,
            })),
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
}