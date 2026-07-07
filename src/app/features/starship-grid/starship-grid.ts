import { Component, OnInit, inject } from '@angular/core';

import { Starship, SwapiService } from '../../core/services/swapi.service';

@Component({
  selector: 'app-starship-grid',
  imports: [],
  templateUrl: './starship-grid.html',
  styleUrl: './starship-grid.scss',
})
export class StarshipGridComponent implements OnInit {
  private readonly swapiService = inject(SwapiService);

  starships: Starship[] = [];

  ngOnInit(): void {
    this.swapiService.getStarships().subscribe((response) => {
      this.starships = response.results;
    });
  }
}
