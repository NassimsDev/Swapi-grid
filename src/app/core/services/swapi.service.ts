import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface Starship {
  name: string;
  model: string;
  manufacturer: string;
  cost_in_credits: string;
  length: string;
  max_atmosphering_speed: string;
  crew: string;
  passengers: string;
  cargo_capacity: string;
  consumables: string;
  hyperdrive_rating: string;
  MGLT: string;
  starship_class: string;
  pilots: string[];
  films: string[];
  created: string;
  edited: string;
  url: string;
}

export interface SwapiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Starship[];
}

@Injectable({
  providedIn: 'root'
})
export class SwapiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'https://swapi.dev/api/starships/';

  getStarships(page: number = 1): Observable<SwapiResponse> {
    return this.http.get<SwapiResponse>(this.baseUrl, {
      params: { page }
    });
  }
}
