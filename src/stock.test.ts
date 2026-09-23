import { describe, expect, it } from 'vitest';
import { catalogStockBand, isCatalogInStock } from './stock.js';

describe('catalogStockBand', () => {
  it('uses the availability field when it is one of the three known values', () => {
    expect(catalogStockBand({ availability: 'in_stock' })).toBe('in_stock');
    expect(catalogStockBand({ availability: 'low_stock' })).toBe('low_stock');
    expect(catalogStockBand({ availability: 'out_of_stock' })).toBe('out_of_stock');
  });

  it('falls back to count thresholds when availability is absent', () => {
    expect(catalogStockBand({ count: 0 })).toBe('out_of_stock');
    expect(catalogStockBand({ count: 3 })).toBe('low_stock');
    expect(catalogStockBand({ count: 50 })).toBe('in_stock');
  });

  it('is unknown, not in stock, when neither field is present', () => {
    expect(catalogStockBand({})).toBe('unknown');
    expect(isCatalogInStock({})).toBe(false);
  });

  it('falls back to count when availability is a garbage string', () => {
    expect(catalogStockBand({ availability: 'bogus', count: 50 })).toBe('in_stock');
    expect(catalogStockBand({ availability: 'bogus', count: 0 })).toBe('out_of_stock');
  });
});

describe('isCatalogInStock', () => {
  it('treats in_stock and low_stock as in stock', () => {
    expect(isCatalogInStock({ availability: 'in_stock' })).toBe(true);
    expect(isCatalogInStock({ availability: 'low_stock' })).toBe(true);
  });

  it('treats out_of_stock and unknown as not in stock (fail closed)', () => {
    expect(isCatalogInStock({ availability: 'out_of_stock' })).toBe(false);
    expect(isCatalogInStock({ count: 0 })).toBe(false);
    expect(isCatalogInStock({})).toBe(false);
  });
});
