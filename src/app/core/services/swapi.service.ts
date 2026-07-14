import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';

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
  private readonly cache = new Map<string, Observable<SwapiResponse>>();

  getStarships(page: number = 1): Observable<SwapiResponse> {
    const key = `${page}`;
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    const request$ = this.http.get<SwapiResponse>(this.baseUrl, { params: { page } }).pipe(
      shareReplay(1),
      catchError((error) => {
        this.cache.delete(key);
        return throwError(() => error);
      })
    );

    this.cache.set(key, request$);
    return request$;
  }

  // SWAPI's `search` param also matches the `model` field, so it can't be used
  // to search by name only. Instead, fetch every (cached) page and filter locally.
  searchStarshipsByName(name: string): Observable<Starship[]> {
    const query = name.toLowerCase();

    return this.getAllStarships().pipe(
      map((starships) => starships.filter((starship) => starship.name.toLowerCase().includes(query)))
    );
  }

  getAllStarships(): Observable<Starship[]> {
    return this.getStarships(1).pipe(
      switchMap((first) => {
        const totalPages = Math.ceil(first.count / first.results.length);
        const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => this.getStarships(i + 2));

        return remainingPages.length
          ? forkJoin(remainingPages).pipe(
              map((pages) => [...first.results, ...pages.flatMap((page) => page.results)])
            )
          : of(first.results);
      })
    );
  }

  updateStarship(starship: Starship, changes: Partial<Starship>): Observable<Starship> {
    // SWAPI is read-only. Once a real backend supports writes, swap this for:
    // return this.http.patch<Starship>(starship.url, changes);
    return of({ ...starship, ...changes });
  }
}
