/**
 * Fase 4A (Desktop): las RPC de PostgREST se tratan como lecturas cacheables
 * y NUNCA se encolan en `action-queue`. Cubre también la purga de las RPC
 * que versiones anteriores del interceptor dejaron en la cola y que fuera
 * del Desktop nada cambia.
 *
 * Corre con `fake-indexeddb` (IndexedDB en memoria, entorno node).
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

// El módulo registra listeners de `window` al cargar: se le da uno mínimo.
const listeners: Record<string, Array<(e: unknown) => void>> = {};
(globalThis as unknown as { window: unknown }).window = {
  addEventListener: (name: string, cb: (e: unknown) => void) => {
    (listeners[name] ||= []).push(cb);
  },
  removeEventListener: () => {},
  dispatchEvent: (e: { type: string }) => {
    for (const cb of listeners[e.type] || []) cb(e);
    return true;
  },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
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

import {
  cacheFreshResponse,
  getCachedRpcResponse,
  getQueueCountsByType,
  getQueuedActions,
  getRpcCacheKey,
  getRpcFunctionName,
  hashBody,
  isCacheableRequest,
  isCacheableRpc,
  purgeQueuedRpcActions,
  queueAction,
  removeQueuedAction,
  resolveOfflineDataRequest,
  setCachedRpcResponse,
  setOnline,
} from '@/lib/utils/offlineCache';

const BASE = 'https://proyecto.supabase.co/rest/v1';
const RANKING_URL = `${BASE}/rpc/pos_product_ranking`;
const RANKING_BODY = JSON.stringify({ p_org_id: 120, p_search: null, p_page: 1, p_limit: 12 });

async function clearQueue() {
  for (const a of await getQueuedActions()) if (a.id !== undefined) await removeQueuedAction(a.id);
}

beforeEach(async () => {
  await clearQueue();
  setOnline(false);
});

describe('identificación de RPC', () => {
  it('extrae el nombre de la función de la URL', () => {
    expect(getRpcFunctionName(RANKING_URL)).toBe('pos_product_ranking');
    expect(getRpcFunctionName(`${RANKING_URL}?select=*`)).toBe('pos_product_ranking');
    expect(getRpcFunctionName(`${BASE}/products?select=*`)).toBeNull();
  });

  it('clasifica lecturas y escrituras por nombre', () => {
    for (const fn of ['pos_product_ranking', 'pos_category_ranking', 'get_organization_currencies', 'get_current_plan', 'fn_reporte_ventas_resumen', 'calculate_reservation_total', 'check_user_permission', 'set_org_context', 'set_session_org_id']) {
      expect(isCacheableRpc(fn)).toBe(true);
    }
    for (const fn of ['fn_register_stock_entry', 'decrement_ai_credits', 'deduct_comm_credits', 'update_stock_level', 'soft_delete_product', 'issue_invoice', 'set_organization_base_currency', 'mark_all_notifications_as_read', 'assistant_create_adjustment', 'generate_web_order_number']) {
      expect(isCacheableRpc(fn)).toBe(false);
    }
  });

  it('la clave incluye función y hash del body; bodies distintos → claves distintas', () => {
    expect(getRpcCacheKey('pos_product_ranking', RANKING_BODY)).toBe(`rpc:pos_product_ranking:${hashBody(RANKING_BODY)}`);
    expect(getRpcCacheKey('pos_product_ranking', RANKING_BODY)).not.toBe(getRpcCacheKey('pos_product_ranking', RANKING_BODY.replace('"p_page":1', '"p_page":2')));
    expect(hashBody('')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('isCacheableRequest: GET siempre, POST solo RPC de lectura, PATCH nunca', () => {
    expect(isCacheableRequest(`${BASE}/products`, 'GET')).toBe(true);
    expect(isCacheableRequest(RANKING_URL, 'POST')).toBe(true);
    expect(isCacheableRequest(`${BASE}/rpc/fn_register_stock_entry`, 'POST')).toBe(false);
    expect(isCacheableRequest(`${BASE}/products`, 'POST')).toBe(false);
    expect(isCacheableRequest(RANKING_URL, 'PATCH')).toBe(false);
  });
});

describe('RPC servida de caché sin red', () => {
  it('con red guarda la respuesta; sin red la sirve por función + hash del body', async () => {
    const payload = JSON.stringify([{ product_id: 1, total_count: 1, is_favorite: true, sales_count_90d: 3 }]);
    expect(await cacheFreshResponse({ url: RANKING_URL, method: 'POST', body: RANKING_BODY, text: payload, status: 200 })).toBe(true);

    const res = await resolveOfflineDataRequest({ url: RANKING_URL, method: 'POST', body: RANKING_BODY, headers: {} });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Offline-Cache')).toBe('true');
    expect(await res.text()).toBe(payload);
  });

  it('otro body (otra página) sin caché → 503 y NO se encola', async () => {
    const otherBody = RANKING_BODY.replace('"p_page":1', '"p_page":7');
    const res = await resolveOfflineDataRequest({ url: RANKING_URL, method: 'POST', body: otherBody, headers: {} });
    expect(res.status).toBe(503);
    expect((await res.json()).error.message).toMatch(/Offline/);
    expect(await getQueuedActions()).toHaveLength(0);
  });

  it('una RPC de escritura sin red nunca se sirve de caché ni se encola', async () => {
    await setCachedRpcResponse('fn_register_stock_entry', '{"x":1}', '{"ok":true}', 200);
    const res = await resolveOfflineDataRequest({ url: `${BASE}/rpc/fn_register_stock_entry`, method: 'POST', body: '{"x":1}', headers: {} });
    expect(res.status).toBe(503);
    expect(await getQueuedActions()).toHaveLength(0);
    expect(await cacheFreshResponse({ url: `${BASE}/rpc/fn_register_stock_entry`, method: 'POST', body: '{"x":1}', text: '{"ok":true}', status: 200 })).toBe(false);
  });

  it('las escrituras REST siguen yendo a la cola con 202', async () => {
    const res = await resolveOfflineDataRequest({ url: `${BASE}/product_favorites`, method: 'POST', body: '{"product_id":1}', headers: { apikey: 'x' } });
    expect(res.status).toBe(202);
    const queued = await getQueuedActions();
    expect(queued).toHaveLength(1);
    expect(queued[0].url).toBe(`${BASE}/product_favorites`);
  });

  it('GET sin red se sirve de caché por URL como antes', async () => {
    await cacheFreshResponse({ url: `${BASE}/categories?select=*`, method: 'GET', body: '', text: '[{"id":1}]', status: 200 });
    const res = await resolveOfflineDataRequest({ url: `${BASE}/categories?select=*`, method: 'GET', body: '', headers: {} });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('[{"id":1}]');
  });
});

describe('purga de RPC encoladas por error', () => {
  it('retira solo las RPC y deja las escrituras REST; el conteo por tipo lo refleja', async () => {
    await queueAction({ url: RANKING_URL, method: 'POST', headers: {}, body: RANKING_BODY });
    await queueAction({ url: `${BASE}/rpc/get_organization_currencies`, method: 'POST', headers: {}, body: '{}' });
    await queueAction({ url: `${BASE}/product_favorites`, method: 'POST', headers: {}, body: '{}' });
    await queueAction({ url: `${BASE}/customers?id=eq.1`, method: 'PATCH', headers: {}, body: '{}' });

    const before = await getQueueCountsByType();
    expect(before).toMatchObject({ total: 4, rpc: 2, rest: 2, byMethod: { POST: 3, PATCH: 1 } });

    expect(await purgeQueuedRpcActions()).toBe(2);

    const after = await getQueueCountsByType();
    expect(after).toMatchObject({ total: 2, rpc: 0, rest: 2 });
    expect((await getQueuedActions()).map((a) => a.method).sort()).toEqual(['PATCH', 'POST']);
    expect(await purgeQueuedRpcActions()).toBe(0);
  });
});

describe('fuera del Desktop nada cambia', () => {
  it('sin `goAdminDesktop` en window, isDesktop es false e isAppOnline sigue a navigator.onLine', async () => {
    const { isDesktop } = await import('@/lib/utils/desktop');
    const { isAppOnline } = await import('@/lib/utils/offlineCache');
    expect(isDesktop()).toBe(false);
    (globalThis as unknown as { navigator: { onLine: boolean } }).navigator.onLine = true;
    expect(isAppOnline()).toBe(true);
    (globalThis as unknown as { navigator: { onLine: boolean } }).navigator.onLine = false;
    expect(isAppOnline()).toBe(false);
  });

  it('con red, la caché de RPC respeta el TTL como la de GET (no se sirve caducada)', async () => {
    (globalThis as unknown as { navigator: { onLine: boolean } }).navigator.onLine = true;
    setOnline(true);
    await setCachedRpcResponse('get_current_plan', '{"org_id":120}', '{"plan":"pro"}', 200);
    expect(await getCachedRpcResponse('get_current_plan', '{"org_id":120}')).toEqual({ data: '{"plan":"pro"}', status: 200 });
    const realNow = Date.now;
    Date.now = () => realNow() + 6 * 60 * 1000;
    try {
      expect(await getCachedRpcResponse('get_current_plan', '{"org_id":120}')).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });
});
