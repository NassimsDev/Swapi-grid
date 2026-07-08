import { Component, OnInit, inject, signal } from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import { AllCommunityModule, ColDef, ModuleRegistry } from 'ag-grid-community';

import { Starship, SwapiService } from '../../core/services/swapi.service';

ModuleRegistry.registerModules([AllCommunityModule]);

@Component({
  selector: 'app-starship-grid',
  imports: [AgGridAngular],
  templateUrl: './starship-grid.html',
  styleUrl: './starship-grid.scss',
})
export class StarshipGridComponent implements OnInit {
  private readonly swapiService = inject(SwapiService);

  starships = signal<Starship[]>([]);

  colDefs: ColDef[] = [
    { field: 'name', headerName: 'Name', resizable: true },
    { field: 'model', headerName: 'Model', resizable: true },
    { field: 'manufacturer', headerName: 'Manufacturer', resizable: true },
    { field: 'crew', headerName: 'Crew', resizable: true },
    { field: 'passengers', headerName: 'Passengers', resizable: true },
  ];

  ngOnInit(): void {
    this.swapiService.getStarships().subscribe((response) => {
      this.starships.set(response.results);
    });
  }
}
