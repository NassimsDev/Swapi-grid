import { Component, inject, signal } from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import {
  AllCommunityModule,
  ColDef,
  GridApi,
  GridReadyEvent,
  IDatasource,
  IGetRowsParams,
  ModuleRegistry,
} from 'ag-grid-community';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { Starship, SwapiService } from '../../core/services/swapi.service';

ModuleRegistry.registerModules([AllCommunityModule]);

const PAGE_SIZE = 10;

@Component({
  selector: 'app-starship-grid',
  imports: [AgGridAngular],
  templateUrl: './starship-grid.html',
  styleUrl: './starship-grid.scss',
})
export class StarshipGridComponent {
  private readonly swapiService = inject(SwapiService);
  private readonly searchInput$ = new Subject<string>();
  private gridApi?: GridApi;

  searchTerm = signal('');

  cacheBlockSize = PAGE_SIZE;

  colDefs: ColDef[] = [
    { field: 'name', headerName: 'Name', resizable: true },
    { field: 'model', headerName: 'Model', resizable: true },
    { field: 'manufacturer', headerName: 'Manufacturer', resizable: true },
    { field: 'crew', headerName: 'Crew', resizable: false },
    { field: 'passengers', headerName: 'Passengers', resizable: false },
  ];

  dataSource: IDatasource = {
    getRows: (params: IGetRowsParams<Starship>) => {
      const page = Math.floor(params.startRow / PAGE_SIZE) + 1;

      this.swapiService.getStarships(page, this.searchTerm()).subscribe({
        next: (response) => params.successCallback(response.results, response.count),
        error: () => params.failCallback(),
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
    this.gridApi?.purgeInfiniteCache();
  }

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
  }
}