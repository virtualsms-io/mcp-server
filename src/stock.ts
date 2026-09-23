/**
 * Catalog stock is reported as a band (in_stock / low_stock / out_of_stock),
 * never as the underlying exact count: the backend has removed, or will
 * remove, the exact integer entirely. `availability` is authoritative when
 * present; the legacy `count` threshold is a fallback for older API payloads,
 * using the same thresholds the backend itself applies. Fail closed: a row
 * with neither field is `unknown`, and `unknown` is never in stock.
 */

export type StockBand = 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown';

export interface CatalogStockRow {
  availability?: string;
  count?: number;
}

const KNOWN_BANDS = new Set<StockBand>(['in_stock', 'low_stock', 'out_of_stock']);

export function catalogStockBand(row: CatalogStockRow): StockBand {
  if (row.availability && KNOWN_BANDS.has(row.availability as StockBand)) {
    return row.availability as StockBand;
  }
  if (typeof row.count === 'number' && Number.isFinite(row.count)) {
    if (row.count <= 0) return 'out_of_stock';
    if (row.count <= 5) return 'low_stock';
    return 'in_stock';
  }
  return 'unknown';
}

export function isCatalogInStock(row: CatalogStockRow): boolean {
  const band = catalogStockBand(row);
  return band === 'in_stock' || band === 'low_stock';
}

const STOCK_BAND_RANK: Record<StockBand, number> = {
  in_stock: 3,
  low_stock: 2,
  out_of_stock: 1,
  unknown: 0,
};

export function stockBandRank(row: CatalogStockRow): number {
  return STOCK_BAND_RANK[catalogStockBand(row)];
}
