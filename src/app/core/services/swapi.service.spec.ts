import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Starship, SwapiResponse, SwapiService } from './swapi.service';

function makeStarship(overrides: Partial<Starship>): Starship {
  return {
    name: '',
    model: '',
    manufacturer: '',
    cost_in_credits: '',
    length: '',
    max_atmosphering_speed: '',
    crew: '',
    passengers: '',
    cargo_capacity: '',
    consumables: '',
    hyperdrive_rating: '',
    MGLT: '',
    starship_class: '',
    pilots: [],
    films: [],
    created: '',
    edited: '',
    url: '',
    ...overrides,
  };
}

function makeResponse(overrides: Partial<SwapiResponse>): SwapiResponse {
  return { count: 0, next: null, previous: null, results: [], ...overrides };
}

describe('SwapiService', () => {
  let service: SwapiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(SwapiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  it('requests the given page number from the SWAPI starships endpoint', () => {
    service.getStarships(2).subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === 'https://swapi.dev/api/starships/' && r.params.get('page') === '2',
    );
    expect(req.request.method).toBe('GET');
    req.flush(makeResponse({ count: 1 }));
  });

  it('caches a page so the same page is never requested twice', () => {
    service.getStarships(1).subscribe();
    service.getStarships(1).subscribe();

    httpMock.expectOne(() => true).flush(makeResponse({ count: 1 }));
    httpMock.verify();
  });

  it('retries a failed page request before delivering an error', () => {
    vi.useFakeTimers();
    let result: SwapiResponse | undefined;
    service.getStarships(1).subscribe((r) => (result = r));

    httpMock.expectOne((r) => r.params.get('page') === '1').error(new ProgressEvent('error'));
    vi.advanceTimersByTime(1000);
    httpMock.expectOne((r) => r.params.get('page') === '1').flush(makeResponse({ count: 36 }));

    expect(result?.count).toBe(36);
  });

  it('evicts a page that failed every retry so a later call re-fetches it', () => {
    vi.useFakeTimers();
    service.getStarships(1).subscribe({ error: () => {} });

    httpMock.expectOne((r) => r.params.get('page') === '1').error(new ProgressEvent('error'));
    vi.advanceTimersByTime(1000);
    httpMock.expectOne((r) => r.params.get('page') === '1').error(new ProgressEvent('error'));
    vi.advanceTimersByTime(1000);
    httpMock.expectOne((r) => r.params.get('page') === '1').error(new ProgressEvent('error'));

    let result: SwapiResponse | undefined;
    service.getStarships(1).subscribe((r) => (result = r));
    httpMock.expectOne((r) => r.params.get('page') === '1').flush(makeResponse({ count: 36 }));

    expect(result?.count).toBe(36);
  });

  it('combines every page into a single, ordered list', () => {
    const page1 = makeResponse({
      count: 3,
      next: 'page-2',
      results: [makeStarship({ name: 'A-wing' }), makeStarship({ name: 'B-wing' })],
    });
    const page2 = makeResponse({
      count: 3,
      next: null,
      results: [makeStarship({ name: 'X-wing' })],
    });

    let combined: Starship[] = [];
    service.getAllStarships().subscribe((results) => (combined = results));

    httpMock.expectOne((r) => r.params.get('page') === '1').flush(page1);
    httpMock.expectOne((r) => r.params.get('page') === '2').flush(page2);

    expect(combined.map((s) => s.name)).toEqual(['A-wing', 'B-wing', 'X-wing']);
  });
});
