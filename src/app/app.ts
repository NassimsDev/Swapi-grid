import { Component } from '@angular/core';

import { StarshipGridComponent } from './features/starship-grid/starship-grid';

@Component({
  selector: 'app-root',
  imports: [StarshipGridComponent],
  templateUrl: './app.html'
})
export class App {}
