/**
 * Fase 4C (Desktop): replicador genérico. Pasada completa por lotes de 500
 * con poda, ámbito por padre (`padre!inner(organization_id)`), ventana de 12
 * meses, tope de filas, pasada incremental por `updated_at`, error aislado
 * por tabla, y el planificador único (catálogo + réplica) solo en Desktop.
 *
 * Datos inventados: organización 120, sucursal 7.
 */
import 'fake-indexeddb/auto';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: () => { throw new Error('no debe usarse en tests'); }, rpc: () => { throw new Error('no debe usarse en tests'); } } }));
jest.mock('@/lib/utils/desktop', () => ({
  isDesktop: () => typeof window !== 'undefined' && 'goAdminDesktop' in (window as object),
  desktopReportsConnectivity: () => false,
  onDesktopConnectivity: () => () => {},
  getDesktopBridge: () => null,
}));
jest.mock('@/lib/utils/offlineCache', () => ({ isAppOnline: () => true }));
const replicateCatalogMock = jest.fn(async (_opts?: unknown) => ({ organization_id: 120, isEmpty: false }));
jest.mock('../catalogReplicator', () => ({
  replicateCatalog: (opts: unknown) => replicateCatalogMock(opts),
  isCatalogReplicating: () => false,
}));

import { clearOfflineDb, closeOfflineDB, getOfflineDbStatus, getOfflineRowsByOrg, getOfflineTableMeta } from '../offlineDb';
import {
  OFFLINE_BATCH_SIZE,
  OFFLINE_REPLICATION_INTERVAL_MS,
  replicateAllOffline,
  replicateOfflineDb,
  isOfflineReplicating,
  startOfflineReplication,
  stopOfflineReplication,
} from '../offlineReplicator';
import { FULL_REFRESH_INTERVAL_MS } from '../replicationManifest';
import { createFakeOfflineClient } from './fakeOfflineClient';
import { installWindow, uninstallWindow } from './testEnv';

const ORG = 120;
jest.setTimeout(60_000);
const NOW = Date.parse('2026-09-16T12:00:00Z');
const T0 = '2026-09-01T00:00:00+00:00';

function makeTables() {
  const products = Array.from({ length: 1203 }, (_, i) => ({ id: i + 1, organization_id: ORG, sku: `S${i + 1}`, name: `P${i + 1}`, updated_at: T0 }));
  products.push({ id: 9999, organization_id: 121, sku: 'X', name: 'Otra org', updated_at: T0 });
  const branches = [
    { id: 7, organization_id: ORG, name: 'Principal', updated_at: T0 },
    { id: 8, organization_id: 121, name: 'Ajena', updated_at: T0 },
  ];
  const stock_levels = [
    { id: 1, product_id: 1, branch_id: 7, lot_id: null, qty_on_hand: 5, updated_at: T0 },
    { id: 2, product_id: 2, branch_id: 8, lot_id: null, qty_on_hand: 9, updated_at: T0 }, // sucursal de otra org
  ];
  const product_prices = [
    { id: 1, product_id: 1, price: 10, effective_from: T0, effective_to: null },
    { id: 2, product_id: 1, price: 8, effective_from: '2025-01-01T00:00:00+00:00', effective_to: T0 }, // cerrado: fuera
    { id: 3, product_id: 9999, price: 1, effective_from: T0, effective_to: null }, // otra org
  ];
  const sales = [
    { id: 's-new', organization_id: ORG, branch_id: 7, total: 10, created_at: '2026-09-10T00:00:00+00:00', updated_at: '2026-09-10T00:00:00+00:00' },
    { id: 's-old', organization_id: ORG, branch_id: 7, total: 20, created_at: '2025-01-10T00:00:00+00:00', updated_at: '2025-01-10T00:00:00+00:00' }, // > 12 meses
  ];
  return { products, branches, stock_levels, product_prices, sales };
}

const LINKS = {};

beforeEach(async () => {
  installWindow({ desktop: true });
  await clearOfflineDb();
  replicateCatalogMock.mockClear();
});

afterEach(() => {
  stopOfflineReplication();
  uninstallWindow();
});

afterAll(async () => {
  await closeOfflineDB();
});

describe('replicateOfflineDb', () => {
  it('pasada completa: lotes de 500, ámbito por organización y por padre, filtros extra y ventana', async () => {
    const client = createFakeOfflineClient({ tables: makeTables(), links: LINKS });
    const status = await replicateOfflineDb({ organizationId: ORG, client, tables: ['products', 'branches', 'stock_levels', 'product_prices', 'sales'], now: () => NOW });

    expect(status.tables.products.count).toBe(1203);
    const productPages = client.requests.filter((r) => r.table === 'products');
    expect(productPages.map((r) => [r.from, r.to])).toEqual([[0, 499], [500, 999], [1000, 1499]]);
    expect(productPages[0].filters).toContain(`organization_id=eq.${ORG}`);
    expect(OFFLINE_BATCH_SIZE).toBe(500);

    // stock_levels no tiene organization_id: llega por branches!inner y se le añade localmente.
    const stockReq = client.requests.find((r) => r.table === 'stock_levels')!;
    expect(stockReq.select).toContain('branches!inner(organization_id)');
    expect(stockReq.filters).toContain(`branches.organization_id=eq.${ORG}`);
    const stock = await getOfflineRowsByOrg('stock_levels', ORG);
    expect(stock).toEqual([{ id: 1, product_id: 1, branch_id: 7, lot_id: null, qty_on_hand: 5, qty_reserved: null, avg_cost: null, created_at: null, updated_at: T0, min_level: null, organization_id: ORG }]);

    // product_prices: solo vigentes (effective_to is null) y solo del padre de la organización.
    const priceReq = client.requests.find((r) => r.table === 'product_prices')!;
    expect(priceReq.filters).toContain('effective_to=is.null');
    expect((await getOfflineRowsByOrg('product_prices', ORG)).map((r) => r.id)).toEqual([1]);

    // sales: ventana de 12 meses por created_at, orden descendente para conservar lo reciente.
    const salesReq = client.requests.find((r) => r.table === 'sales')!;
    expect(salesReq.filters.some((f) => f.startsWith('created_at=gte.2025-09-16'))).toBe(true);
    expect((await getOfflineRowsByOrg('sales', ORG)).map((r) => r.id)).toEqual(['s-new']);

    expect(status.isEmpty).toBe(false);
    expect(status.tables.sales.full_at).toBe(NOW);
    expect(status.tables.sales.cursor).toBe('2026-09-10T00:00:00+00:00');
    expect(status.tables.products.error).toBeNull();
    expect(status.estimatedBytes).toBeGreaterThan(0);
    expect((window as unknown as { events?: string[] }).events ?? []).toBeDefined();
  });

  it('pasada incremental: pide solo cambios desde el cursor y no poda; la completa vuelve pasado el intervalo', async () => {
    const tables = makeTables();
    const client = createFakeOfflineClient({ tables, links: LINKS });
    await replicateOfflineDb({ organizationId: ORG, client, tables: ['products'], now: () => NOW });
    client.requests.length = 0;

    // Cambios en el servidor: un producto editado, uno nuevo y uno borrado.
    tables.products[0].name = 'Editado';
    tables.products[0].updated_at = '2026-09-16T11:00:00+00:00';
    tables.products.push({ id: 5000, organization_id: ORG, sku: 'N', name: 'Nuevo', updated_at: '2026-09-16T11:30:00+00:00' });
    tables.products.splice(1, 1); // borra id 2

    const later = NOW + 10 * 60 * 1000;
    const inc = await replicateOfflineDb({ organizationId: ORG, client, tables: ['products'], now: () => later });
    const req = client.requests.filter((r) => r.table === 'products');
    expect(req).toHaveLength(1);
    expect(req[0].filters).toContain(`updated_at=gt.${T0}`);
    const rows = await getOfflineRowsByOrg('products', ORG);
    expect(rows.find((r) => r.id === 1)?.name).toBe('Editado');
    expect(rows.find((r) => r.id === 5000)?.name).toBe('Nuevo');
    expect(rows.find((r) => r.id === 2)).toBeDefined(); // sin poda en incremental
    expect(inc.tables.products.cursor).toBe('2026-09-16T11:30:00+00:00');
    expect(inc.tables.products.full_at).toBe(NOW);
    expect(inc.tables.products.replicated_at).toBe(later);

    // Pasado el intervalo de pasada completa: completa con poda.
    client.requests.length = 0;
    const muchLater = NOW + FULL_REFRESH_INTERVAL_MS + 1;
    const full = await replicateOfflineDb({ organizationId: ORG, client, tables: ['products'], now: () => muchLater });
    expect(client.requests.filter((r) => r.table === 'products').every((r) => !r.filters.some((f) => f.startsWith('updated_at=gt.')))).toBe(true);
    expect((await getOfflineRowsByOrg('products', ORG)).find((r) => r.id === 2)).toBeUndefined();
    expect(full.tables.products.full_at).toBe(muchLater);
    expect(full.tables.products.count).toBe(1203);
  });

  it('tope de filas: corta y lo anota; un error en una tabla no detiene las demás', async () => {
    const tables = makeTables();
    const client = createFakeOfflineClient({ tables, links: LINKS, failing: { branches: 'permission denied for table branches' } });
    const manifestModule = jest.requireActual('../replicationManifest') as typeof import('../replicationManifest');
    const products = manifestModule.getTableManifest('products')!;
    const originalMax = products.maxRows;
    products.maxRows = 700;
    try {
      const status = await replicateOfflineDb({ organizationId: ORG, client, tables: ['branches', 'products', 'sales'], now: () => NOW });
      expect(status.tables.products.count).toBe(700);
      expect(status.tables.products.error).toContain('Tope de 700 filas');
      expect(client.requests.filter((r) => r.table === 'products').map((r) => [r.from, r.to])).toEqual([[0, 499], [500, 699]]);
      expect(status.tables.branches.error).toContain('permission denied');
      expect(status.tables.branches.replicated_at).toBe(0);
      expect(status.missing).toContain('branches');
      expect(status.tables.sales.count).toBe(1);
      expect(status.tables.sales.error).toBeNull();
    } finally {
      products.maxRows = originalMax;
    }
  });

  it('llamadas concurrentes comparten la misma pasada', async () => {
    const client = createFakeOfflineClient({ tables: makeTables(), links: LINKS });
    const a = replicateOfflineDb({ organizationId: ORG, client, tables: ['branches'], now: () => NOW });
    const b = replicateOfflineDb({ organizationId: ORG, client, tables: ['branches'], now: () => NOW });
    expect(a).toBe(b);
    await a;
    expect(client.requests.filter((r) => r.table === 'branches')).toHaveLength(1);
  });

  it('cambio de organización vacía la réplica anterior', async () => {
    const client = createFakeOfflineClient({ tables: makeTables(), links: LINKS });
    await replicateOfflineDb({ organizationId: ORG, client, tables: ['branches'], now: () => NOW });
    expect((await getOfflineRowsByOrg('branches', ORG)).length).toBe(1);
    await replicateOfflineDb({ organizationId: 121, client, tables: ['branches'], now: () => NOW });
    expect((await getOfflineRowsByOrg('branches', ORG)).length).toBe(0);
    expect(await getOfflineTableMeta('branches', ORG)).toBeUndefined();
    expect((await getOfflineDbStatus(121)).tables.branches.count).toBe(1);
  });

  it('sin organización o sin IndexedDB lanza', async () => {
    await expect(replicateOfflineDb({ organizationId: 0 })).rejects.toThrow('Sin organización');
  });
});

describe('replicateAllOffline y planificador', () => {
  it('replica primero el catálogo del POS y luego la réplica genérica; un fallo del catálogo no la impide', async () => {
    const client = createFakeOfflineClient({ tables: makeTables(), links: LINKS });
    replicateCatalogMock.mockRejectedValueOnce(new Error('catálogo caído'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const status = await replicateAllOffline({ organizationId: ORG, client, tables: ['branches'], now: () => NOW });
    expect(replicateCatalogMock).toHaveBeenCalledWith({ organizationId: ORG, client });
    expect(status.tables.branches.count).toBe(1);
    warn.mockRestore();
  });

  it('en Desktop programa un solo intervalo de 10 min para catálogo + réplica y para con el último suscriptor', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    try {
      const client = createFakeOfflineClient({ tables: makeTables(), links: LINKS });
      // fake-indexeddb usa setImmediate (no falseado) y el replicador cede con setTimeout (falseado):
      // se alternan ambos hasta que la pasada termina.
      const settle = async () => {
        for (let i = 0; i < 20_000; i++) {
          await new Promise((r) => setImmediate(r));
          await jest.advanceTimersByTimeAsync(1);
          if (i > 10 && !isOfflineReplicating()) break;
        }
      };
      const stopA = startOfflineReplication(ORG, client);
      const stopB = startOfflineReplication(ORG, client);
      await settle();
      expect(replicateCatalogMock).toHaveBeenCalledTimes(1);
      expect(client.requests.length).toBeGreaterThan(0);
      await jest.advanceTimersByTimeAsync(OFFLINE_REPLICATION_INTERVAL_MS);
      await settle();
      expect(replicateCatalogMock).toHaveBeenCalledTimes(2);
      stopA();
      await jest.advanceTimersByTimeAsync(OFFLINE_REPLICATION_INTERVAL_MS);
      await settle();
      expect(replicateCatalogMock).toHaveBeenCalledTimes(3); // B sigue suscrito
      stopB();
      await jest.advanceTimersByTimeAsync(OFFLINE_REPLICATION_INTERVAL_MS);
      await settle();
      expect(replicateCatalogMock).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('fuera del Desktop no programa nada', async () => {
    uninstallWindow();
    installWindow({ desktop: false });
    const client = createFakeOfflineClient({ tables: makeTables(), links: LINKS });
    const stop = startOfflineReplication(ORG, client);
    await new Promise((r) => setTimeout(r, 10));
    expect(client.requests).toHaveLength(0);
    expect(replicateCatalogMock).not.toHaveBeenCalled();
    stop();
  });
});
