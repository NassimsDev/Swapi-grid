import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StarshipGrid } from './starship-grid';

describe('StarshipGrid', () => {
  let component: StarshipGrid;
  let fixture: ComponentFixture<StarshipGrid>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StarshipGrid],
    }).compileComponents();

    fixture = TestBed.createComponent(StarshipGrid);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
