import { TestBed } from '@angular/core/testing';
import { CellValueChangedEvent, GridReadyEvent, IGetRowsParams, SortModelItem } from 'ag-grid-community';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Starship, SwapiService } from '../../core/services/swapi.service';
import { StarshipGridComponent } from './starship-grid';

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

describe('StarshipGridComponent', () => {
  let component: StarshipGridComponent;
  let swapiService: {
    getStarships: ReturnType<typeof vi.fn>;
    searchStarshipsByName: ReturnType<typeof vi.fn>;
    getAllStarships: ReturnType<typeof vi.fn>;
    updateStarship: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    swapiService = {
      getStarships: vi.fn(),
      searchStarshipsByName: vi.fn(),
      getAllStarships: vi.fn(),
      updateStarship: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SwapiService, useValue: swapiService }],
    });

    component = TestBed.createComponent(StarshipGridComponent).componentInstance;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('failed block recovery', () => {
    it('automatically purges the grid cache so failed blocks are re-requested', () => {
      vi.useFakeTimers();
      const purgeInfiniteCache = vi.fn();
      component.onGridReady({ api: { purgeInfiniteCache } } as unknown as GridReadyEvent);
      swapiService.getStarships.mockReturnValue(throwError(() => new Error('offline')));

      const failCallback = vi.fn();
      component.dataSource.getRows({
        startRow: 0,
        endRow: 10,
        sortModel: [],
        successCallback: vi.fn(),
        failCallback,
      } as unknown as IGetRowsParams<Starship>);

      expect(failCallback).toHaveBeenCalled();
      expect(purgeInfiniteCache).not.toHaveBeenCalled();

      vi.advanceTimersByTime(2000);
      expect(purgeInfiniteCache).toHaveBeenCalledTimes(1);
    });
  });

  describe('sorting', () => {
    it('sorts numeric columns numerically and always places unparseable ("unknown") values last', () => {
      swapiService.getAllStarships.mockReturnValue(
        of([
          makeStarship({ name: 'Y-wing', crew: '2' }),
          makeStarship({ name: 'Death Star', crew: 'unknown' }),
          makeStarship({ name: 'X-wing', crew: '1' }),
        ]),
      );

      const successCallback = vi.fn();
      const params = {
        startRow: 0,
        endRow: 10,
        sortModel: [{ colId: 'crew', sort: 'asc' }] as SortModelItem[],
        successCallback,
        failCallback: vi.fn(),
      } as unknown as IGetRowsParams<Starship>;

      component.dataSource.getRows(params);

      const [rows] = successCallback.mock.calls[0];
      expect((rows as Starship[]).map((s) => s.name)).toEqual(['X-wing', 'Y-wing', 'Death Star']);
    });

    it('sorts non-numeric columns using natural (locale) ordering', () => {
      swapiService.getAllStarships.mockReturnValue(
        of([makeStarship({ name: 'Y-wing' }), makeStarship({ name: 'Death Star' }), makeStarship({ name: 'X-wing' })]),
      );

      const successCallback = vi.fn();
      const params = {
        startRow: 0,
        endRow: 10,
        sortModel: [{ colId: 'name', sort: 'asc' }] as SortModelItem[],
        successCallback,
        failCallback: vi.fn(),
      } as unknown as IGetRowsParams<Starship>;

      component.dataSource.getRows(params);

      const [rows] = successCallback.mock.calls[0];
      expect((rows as Starship[]).map((s) => s.name)).toEqual(['Death Star', 'X-wing', 'Y-wing']);
    });
  });

  describe('editing', () => {
    it('sends the changed field to the service when a cell is edited', () => {
      const starship = makeStarship({ name: 'Slave I', cargo_capacity: '1000' });
      swapiService.updateStarship.mockReturnValue(of({ ...starship, cargo_capacity: '2000' }));

      const event = {
        source: 'edit',
        colDef: { field: 'cargo_capacity' },
        data: starship,
        oldValue: '1000',
        newValue: '2000',
        node: { setDataValue: vi.fn() },
      } as unknown as CellValueChangedEvent<Starship>;

      component.onCellValueChanged(event);

      expect(swapiService.updateStarship).toHaveBeenCalledWith(starship, { cargo_capacity: '2000' });
      expect(event.node.setDataValue).not.toHaveBeenCalled();
    });

    it('reverts the cell to its previous value if persisting the edit fails', () => {
      swapiService.updateStarship.mockReturnValue(throwError(() => new Error('offline')));
      const starship = makeStarship({ name: 'Slave I', cargo_capacity: '1000' });

      const event = {
        source: 'edit',
        colDef: { field: 'cargo_capacity' },
        data: starship,
        oldValue: '1000',
        newValue: '2000',
        node: { setDataValue: vi.fn() },
      } as unknown as CellValueChangedEvent<Starship>;

      component.onCellValueChanged(event);

      expect(event.node.setDataValue).toHaveBeenCalledWith('cargo_capacity', '1000');
    });

    it('ignores programmatic (non-edit) value changes', () => {
      const starship = makeStarship({ name: 'Slave I', cargo_capacity: '1000' });

      const event = {
        source: 'api',
        colDef: { field: 'cargo_capacity' },
        data: starship,
        oldValue: '1000',
        newValue: '2000',
        node: { setDataValue: vi.fn() },
      } as unknown as CellValueChangedEvent<Starship>;

      component.onCellValueChanged(event);

      expect(swapiService.updateStarship).not.toHaveBeenCalled();
    });
  });
});
