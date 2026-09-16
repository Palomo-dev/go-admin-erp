/**
 * Fase 4C (Desktop): enganche del interceptor. Sin red, un `GET
 * /rest/v1/<tabla>` con tabla en el manifiesto se resuelve PRIMERO en la
 * réplica local; si no se puede (tabla sin replicar, sintaxis no
 * soportada) cae a la caché por URL y, si tampoco hay, a 503. Las RPC
 * siguen con la caché de la fase 4A. Fuera del Desktop nada cambia (el
 * interceptor de `config.ts` solo llama a `resolveOfflineDataRequest` en
 * Desktop y sin red).
 */
import 'fake-indexeddb/auto';

jest.mock('@/lib/utils/desktop', () => {
  const actual = jest.requireActual('@/lib/utils/desktop');
  return {
    ...actual,
    isDesktop: () => typeof window !== 'undefined' && 'goAdminDesktop' in (window as object),
    desktopReportsConnectivity: () => false,
    onDesktopConnectivity: () => () => {},
    getDesktopBridge: () => null,
  };
});

const storage = new Map<string, string>();
const listeners: Record<string, Array<(e: unknown) => void>> = {};
(globalThis as unknown as { window: unknown }).window = {
  goAdminDesktop: {},
  addEventListener: (name: string, cb: (e: unknown) => void) => {
    (listeners[name] ||= []).push(cb);
  },
  removeEventListener: () => {},
  dispatchEvent: (e: { type: string }) => {
    for (const cb of listeners[e.type] || []) cb(e);
    return true;
  },
  localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v), removeItem: (k: string) => void storage.delete(k) },
};
(globalThis as unknown as { navigator: { onLine: boolean } }).navigator = { onLine: true };
(globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class CustomEvent {
  type: string;
  detail: unknown;
  constructor(type: string, init?: { detail?: unknown }) {
    this.type = type;
    this.detail = init?.detail;
  }
};

import { getQueuedActions, removeQueuedAction, resolveOfflineDataRequest, setCachedResponse, setOnline } from '@/lib/utils/offlineCache';
import { clearOfflineDb, closeOfflineDB, putOfflineRows, setOfflineTableMeta } from '../offlineDb';

const ORG = 120;
const BASE = 'https://proyecto.supabase.co/rest/v1';

function url(table: string, params: Record<string, string>): string {
  const u = new URL(`${BASE}/${table}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

beforeEach(async () => {
  for (const a of await getQueuedActions()) if (a.id !== undefined) await removeQueuedAction(a.id);
  await clearOfflineDb();
  storage.set('currentOrganizationId', String(ORG));
  setOnline(false);
  const at = Date.now();
  await putOfflineRows('suppliers', [
    { id: 1, organization_id: ORG, name: 'Proveedor Uno', is_active: true },
    { id: 2, organization_id: ORG, name: 'Proveedor Dos', is_active: false },
  ]);
  await setOfflineTableMeta({ key: `suppliers:${ORG}`, table: 'suppliers', organization_id: ORG, replicated_at: at, full_at: at, count: 2, bytes: 200, cursor: null, error: null, attempted_at: at });
});

afterAll(async () => {
  await closeOfflineDB();
});

describe('GET sin red: réplica local → caché por URL → 503', () => {
  it('tabla replicada: responde desde la réplica aunque la URL nunca se haya pedido', async () => {
    const u = url('suppliers', { select: 'id,name', is_active: 'eq.true', order: 'name.asc' });
    const res = await resolveOfflineDataRequest({ url: u, method: 'GET', body: '', headers: { Prefer: 'count=exact' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-offline-local')).toBe('true');
    expect(res.headers.get('content-range')).toBe('0-0/1');
    expect(await res.json()).toEqual([{ id: 1, name: 'Proveedor Uno' }]);
  });

  it('tabla replicada gana a la caché por URL (más fresca y completa)', async () => {
    const u = url('suppliers', { select: 'id' });
    await setCachedResponse(u, 'GET', JSON.stringify([{ id: 999 }]), 200);
    const res = await resolveOfflineDataRequest({ url: u, method: 'GET', body: '', headers: {} });
    expect(await res.json()).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('tabla del manifiesto sin replicar: caché por URL si existe, si no 503', async () => {
    const u = url('customers', { select: 'id' });
    const miss = await resolveOfflineDataRequest({ url: u, method: 'GET', body: '', headers: {} });
    expect(miss.status).toBe(503);
    await setCachedResponse(u, 'GET', JSON.stringify([{ id: 'c1' }]), 200);
    const hit = await resolveOfflineDataRequest({ url: u, method: 'GET', body: '', headers: {} });
    expect(hit.status).toBe(200);
    expect(hit.headers.get('X-Offline-Cache')).toBe('true');
    expect(await hit.json()).toEqual([{ id: 'c1' }]);
  });

  it('tabla fuera del manifiesto: solo caché por URL', async () => {
    const u = url('kitchen_tickets', { select: 'id' });
    expect((await resolveOfflineDataRequest({ url: u, method: 'GET', body: '', headers: {} })).status).toBe(503);
    await setCachedResponse(u, 'GET', '[]', 200);
    expect((await resolveOfflineDataRequest({ url: u, method: 'GET', body: '', headers: {} })).status).toBe(200);
  });

  it('sintaxis no soportada (agregado) en tabla replicada: cae a la caché por URL y luego 503', async () => {
    const u = url('suppliers', { select: 'count()' });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await resolveOfflineDataRequest({ url: u, method: 'GET', body: '', headers: {} })).status).toBe(503);
    await setCachedResponse(u, 'GET', '[{"count":2}]', 200);
    expect(await (await resolveOfflineDataRequest({ url: u, method: 'GET', body: '', headers: {} })).json()).toEqual([{ count: 2 }]);
    warn.mockRestore();
  });

  it('.single() sin fila → 406 PGRST116 (no 503) y HEAD con count → solo cabecera', async () => {
    const single = await resolveOfflineDataRequest({ url: url('suppliers', { id: 'eq.77' }), method: 'GET', body: '', headers: { Accept: 'application/vnd.pgrst.object+json' } });
    expect(single.status).toBe(406);
    expect((await single.json()).code).toBe('PGRST116');
    const head = await resolveOfflineDataRequest({ url: url('suppliers', { select: 'id' }), method: 'HEAD', body: '', headers: { Prefer: 'count=exact' } });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-range')).toBe('0-1/2');
    expect(await head.text()).toBe('');
    expect(await getQueuedActions()).toHaveLength(0);
  });

  it('sin organización en el almacenamiento no toca la réplica', async () => {
    storage.delete('currentOrganizationId');
    const res = await resolveOfflineDataRequest({ url: url('suppliers', { select: 'name' }), method: 'GET', body: '', headers: {} });
    expect(res.status).toBe(503);
  });

  it('una RPC con equivalente local se calcula sobre la réplica antes que la caché por body', async () => {
    const at = Date.now();
    await putOfflineRows('accounts_receivable', [
      { id: 'ar1', organization_id: ORG, customer_id: 'c1', balance: 150, days_overdue: 12, status: 'overdue', due_date: '2026-08-01T12:00:00+00:00' },
      { id: 'ar2', organization_id: 121, customer_id: 'c1', balance: 999, days_overdue: 1, status: 'overdue', due_date: '2026-08-01T12:00:00+00:00' },
    ]);
    await setOfflineTableMeta({ key: `accounts_receivable:${ORG}`, table: 'accounts_receivable', organization_id: ORG, replicated_at: at, full_at: at, count: 2, bytes: 200, cursor: null, error: null, attempted_at: at });
    const body = JSON.stringify({ customer_ids: ['c1', 'c2'], org_id: ORG });
    const res = await resolveOfflineDataRequest({ url: `${BASE}/rpc/get_accounts_receivable_for_customers`, method: 'POST', body, headers: {} });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-offline-local')).toBe('true');
    expect(await res.json()).toEqual([{ customer_id: 'c1', balance: 150, days_overdue: 12, status: 'overdue', due_date: '2026-08-01T12:00:00+00:00' }]);
    // Otra organización en el body: no se sirve localmente (ni hay caché) → 503.
    const other = await resolveOfflineDataRequest({ url: `${BASE}/rpc/get_accounts_receivable_for_customers`, method: 'POST', body: JSON.stringify({ customer_ids: ['c1'], org_id: 121 }), headers: {} });
    expect(other.status).toBe(503);
  });

  it('las RPC siguen con la caché de la fase 4A y las escrituras REST con la cola', async () => {
    const rpc = await resolveOfflineDataRequest({ url: `${BASE}/rpc/get_organization_currencies`, method: 'POST', body: '{"p_organization_id":120}', headers: {} });
    expect(rpc.status).toBe(503);
    const write = await resolveOfflineDataRequest({ url: `${BASE}/suppliers`, method: 'POST', body: '{"name":"x"}', headers: {} });
    expect(write.status).toBe(202);
    expect(await getQueuedActions()).toHaveLength(1);
  });
});
