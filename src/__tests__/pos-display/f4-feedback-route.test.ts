/**
 * Fase 4 · POST /api/pos/display/feedback (PLAN §4.2): la calificación del
 * cliente en la pantalla del POS.
 *
 * Lo que se prueba aquí es lo que no se puede mirar a ojo:
 * - idempotencia: una calificación por venta, tanto por la comprobación
 *   previa como por el índice único (23505) si otro gana la carrera;
 * - la organización y la sucursal salen de `pos_terminals`, nunca del cuerpo
 *   (CLAUDE.md regla 5): un `organizationId` en el body se ignora;
 * - los dos actores: token de la tableta (displayAuth) y sesión del POS;
 * - qué se guarda: solo el número, nunca nada del cliente.
 */

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

import { makeSupabaseDouble, eqValue, type RecordedCall, type SupabaseDouble } from './f3a-supabaseDouble';

const T1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const T_OTRA_ORG = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const SALE = '11111111-2222-4333-8444-555555555555';

interface FeedbackRow {
  organization_id: number;
  branch_id: number;
  terminal_id: string;
  sale_id: string | null;
  rating: number;
  created_at: string;
}
interface TerminalRow {
  id: string;
  organization_id: number;
  branch_id: number;
  is_active: boolean;
}
interface SecretRow {
  terminal_id: string;
  organization_id: number;
  display_token_hash: string | null;
}

const state: {
  feedback: FeedbackRow[];
  terminals: TerminalRow[];
  secrets: SecretRow[];
  /** Fuerza el error del insert (código de Postgres). */
  insertError: { code?: string; message: string } | null;
  readError: boolean;
  promotions: Array<Record<string, unknown>>;
  organizationTimezone: string | null;
} = { feedback: [], terminals: [], secrets: [], insertError: null, readError: false, promotions: [], organizationTimezone: 'America/Bogota' };

function matches(row: Record<string, unknown>, call: RecordedCall): boolean {
  return call.filters.every(([op, col, value]) => {
    const v = row[col];
    if (op === 'eq') return v === value;
    if (op === 'is') return value === null ? v === null : v === value;
    if (op === 'gte') return typeof v === 'string' && typeof value === 'string' && v >= value;
    if (op === 'lte') return typeof v === 'string' && typeof value === 'string' && v <= value;
    return false;
  });
}

function serviceResponder(call: RecordedCall) {
  if (call.table === 'pos_display_feedback') {
    if (call.op === 'insert') {
      if (state.insertError) return { data: null, error: state.insertError };
      const payload = call.payload as unknown as FeedbackRow;
      // El índice único real: (terminal_id, sale_id) donde sale_id no es null.
      const clash =
        payload.sale_id !== null && state.feedback.some((r) => r.terminal_id === payload.terminal_id && r.sale_id === payload.sale_id);
      if (clash) return { data: null, error: { code: '23505', message: 'duplicate key' } };
      state.feedback.push({ ...payload, created_at: new Date().toISOString() });
      return { data: null, error: null };
    }
    if (state.readError) return { data: null, error: { message: 'boom' } };
    const rows = state.feedback.filter((r) => matches(r as unknown as Record<string, unknown>, call));
    return { data: rows.slice(0, call.limit ?? rows.length), error: null };
  }
  if (call.table === 'pos_terminal_secrets') {
    const hash = eqValue(call, 'display_token_hash');
    const row = state.secrets.find((r) => r.display_token_hash === hash) ?? null;
    return { data: row, error: null };
  }
  if (call.table === 'pos_terminals') {
    const row = state.terminals.find((r) => matches(r as unknown as Record<string, unknown>, call)) ?? null;
    return { data: row, error: null };
  }
  if (call.table === 'promotions') return { data: state.promotions, error: null };
  // La cartelera lee la zona horaria de la organización para saber QUÉ DÍA es
  // (filtra `applicable_days`). Si no se puede leer, la ruta usa la de
  // respaldo: aquí se responde siempre, y las pruebas del respaldo fijan el error.
  if (call.table === 'organizations') return { data: state.organizationTimezone === null ? null : { timezone: state.organizationTimezone }, error: null };
  throw new Error(`tabla inesperada: ${call.table}`);
}

let serviceDb: SupabaseDouble;
let sessionDb: SupabaseDouble;
const session = {
  organizationId: 120,
  userId: 'u-1',
  roleId: 2,
  roleName: 'x',
  isSuperAdmin: false,
  organizationName: 'Org 120',
  memberId: 1,
  get supabase() {
    return sessionDb as never;
  },
};
const getServerOrgContext = jest.fn(async () => session);
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  getServerOrgContext: (...a: unknown[]) => getServerOrgContext(...(a as [])),
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => serviceDb }));
jest.mock('@/lib/security/rateLimitStore', () => ({ getRateLimitStore: () => null, RATE_LIMIT_STORE_ENV: 'RATE_LIMIT_STORE' }));

import { NextRequest } from 'next/server';
import { POST as feedback } from '@/app/api/pos/display/feedback/route';
import { FEEDBACK_RATE_LIMIT } from '@/lib/pos/display/server/displayFeedback';
import { GET as promotions } from '@/app/api/pos/display/promotions/route';
import { _resetRateLimits } from '@/lib/security/rateLimit';
import { hashDisplayToken } from '@/lib/pos/display/server/displayTokens';

/** Token con la forma que exige `isDisplayTokenShape` (43 caracteres base64url). */
const TOKEN = 'a'.repeat(43);

function post(body: unknown, headers: Record<string, string> = {}) {
  return feedback(
    new NextRequest('http://localhost/api/pos/display/feedback', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', ...headers },
    }),
  );
}

beforeEach(() => {
  _resetRateLimits();
  state.feedback = [];
  state.terminals = [{ id: T1, organization_id: 120, branch_id: 7, is_active: true }, { id: T_OTRA_ORG, organization_id: 999, branch_id: 3, is_active: true }];
  state.secrets = [{ terminal_id: T1, organization_id: 120, display_token_hash: hashDisplayToken(TOKEN) }];
  state.insertError = null;
  state.readError = false;
  state.promotions = [];
  serviceDb = makeSupabaseDouble(serviceResponder);
  sessionDb = makeSupabaseDouble((call) => {
    if (call.table !== 'pos_terminals') throw new Error(`tabla inesperada en sesión: ${call.table}`);
    // El cliente de sesión ve solo las terminales de SU organización (RLS): el
    // doble lo imita filtrando por los `eq` de la consulta, que incluyen la org.
    const row = state.terminals.find((r) => matches(r as unknown as Record<string, unknown>, call)) ?? null;
    return { data: row, error: null };
  });
  getServerOrgContext.mockClear();
  getServerOrgContext.mockResolvedValue(session);
});

describe('F4 · feedback: una calificación por venta', () => {
  it('la primera se registra; la segunda de la MISMA venta no crea otra fila', async () => {
    const first = await post({ terminalId: T1, saleId: SALE, rating: 5 });
    expect(first.status).toBe(200);
    expect((await first.json()).data).toEqual({ registered: true, duplicate: false });
    expect(state.feedback).toHaveLength(1);

    const second = await post({ terminalId: T1, saleId: SALE, rating: 1 });
    expect(second.status).toBe(200);
    expect((await second.json()).data).toEqual({ registered: false, duplicate: true });
    expect(state.feedback).toHaveLength(1);
    expect(state.feedback[0].rating).toBe(5); // manda la primera, no la última
  });

  it('carrera perdida: si otro insertó entre la comprobación y el insert, el 23505 se responde como repetida', async () => {
    // La lectura previa no ve nada (tabla vacía) y el insert choca con el índice único.
    state.insertError = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const res = await post({ terminalId: T1, saleId: SALE, rating: 4 });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ registered: false, duplicate: true });
  });

  it('otra venta de la misma terminal sí se registra', async () => {
    await post({ terminalId: T1, saleId: SALE, rating: 5 });
    const otra = await post({ terminalId: T1, saleId: '99999999-2222-4333-8444-555555555555', rating: 2 });
    expect((await otra.json()).data).toEqual({ registered: true, duplicate: false });
    expect(state.feedback).toHaveLength(2);
  });

  it('sin venta (saleId null) se deduplica por ventana de tiempo en la misma terminal', async () => {
    const first = await post({ terminalId: T1, saleId: null, rating: 3 });
    expect((await first.json()).data.registered).toBe(true);
    const second = await post({ terminalId: T1, saleId: null, rating: 5 });
    expect((await second.json()).data).toEqual({ registered: false, duplicate: true });
    expect(state.feedback).toHaveLength(1);
  });
});

describe('F4 · feedback: la organización sale de la terminal, nunca del cuerpo', () => {
  it('un organizationId en el body no cambia lo que se escribe', async () => {
    const res = await post({ terminalId: T1, saleId: SALE, rating: 5, organizationId: 999 });
    // `organizationId` no está en el esquema `.strict()`: la petición ni se atiende.
    expect(res.status).toBe(400);
    expect(state.feedback).toHaveLength(0);
  });

  it('una terminal de OTRA organización no existe para la sesión: 404 y no se escribe', async () => {
    const res = await post({ terminalId: T_OTRA_ORG, saleId: SALE, rating: 5 });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('TERMINAL_NOT_FOUND');
    expect(state.feedback).toHaveLength(0);
  });

  it('con sesión se escribe la organización y la SUCURSAL de la fila de la terminal', async () => {
    await post({ terminalId: T1, saleId: SALE, rating: 4 });
    expect(state.feedback[0]).toMatchObject({ organization_id: 120, branch_id: 7, terminal_id: T1, sale_id: SALE, rating: 4 });
  });

  it('solo se guarda el número: ninguna columna con datos del cliente', async () => {
    await post({ terminalId: T1, saleId: SALE, rating: 4 });
    expect(Object.keys(state.feedback[0]).sort()).toEqual(
      ['branch_id', 'created_at', 'organization_id', 'rating', 'sale_id', 'terminal_id'].sort(),
    );
  });
});

describe('F4 · feedback: los dos actores', () => {
  it('con token Bearer la terminal sale del token y el terminalId del cuerpo se ignora', async () => {
    const res = await post({ terminalId: T_OTRA_ORG, saleId: SALE, rating: 5 }, { authorization: `Bearer ${TOKEN}` });
    expect(res.status).toBe(200);
    expect(state.feedback[0]).toMatchObject({ terminal_id: T1, organization_id: 120, branch_id: 7 });
    expect(getServerOrgContext).not.toHaveBeenCalled();
  });

  it('token desconocido: 401 y no se escribe', async () => {
    const res = await post({ saleId: SALE, rating: 5 }, { authorization: `Bearer ${'b'.repeat(43)}` });
    expect(res.status).toBe(401);
    expect(state.feedback).toHaveLength(0);
  });

  it('sin token y sin terminalId válido: 400', async () => {
    const res = await post({ saleId: SALE, rating: 5 });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_TERMINAL');
  });
});

describe('F4 · feedback: entradas y límites', () => {
  it.each([0, 6, 2.5, -1, 'cinco', null])('rating inválido (%p) → 400 sin tocar la base', async (rating) => {
    const res = await post({ terminalId: T1, saleId: SALE, rating });
    expect(res.status).toBe(400);
    expect(state.feedback).toHaveLength(0);
  });

  it('un fallo de lectura no se traga la calificación en silencio: 503', async () => {
    state.readError = true;
    const res = await post({ terminalId: T1, saleId: SALE, rating: 5 });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('FEEDBACK_UNAVAILABLE');
  });

  it('el cubo por terminal corta la ráfaga', async () => {
    for (let i = 0; i < FEEDBACK_RATE_LIMIT.limit; i += 1) {
      const res = await post({ terminalId: T1, saleId: `${String(i).padStart(8, '0')}-2222-4333-8444-555555555555`, rating: 5 });
      expect(res.status).toBe(200);
    }
    const blocked = await post({ terminalId: T1, saleId: SALE, rating: 5 });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).not.toBeNull();
  });
});

describe('F4 · promociones del reposo: la cartelera es la de ESA terminal', () => {
  function get(query: string, headers: Record<string, string> = {}) {
    return promotions(
      new NextRequest(`http://localhost/api/pos/display/promotions${query}`, { headers: { 'x-forwarded-for': '203.0.113.9', ...headers } }),
    );
  }

  it('filtra por la organización y la sucursal de la terminal, activas y vigentes, solo POS', async () => {
    state.promotions = [{ id: 'p1', name: '2x1', description: 'Solo hoy', end_date: null }];
    const res = await get(`?terminalId=${T1}`);
    expect(res.status).toBe(200);
    expect((await res.json()).data.promotions).toEqual([{ id: 'p1', name: '2x1', description: 'Solo hoy', endsAt: null }]);

    const call = serviceDb.calls.find((c) => c.table === 'promotions');
    expect(call?.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'organization_id', 120],
        ['eq', 'is_active', true],
        ['eq', 'applies_to_pos', true],
      ]),
    );
    // Lo barato e indexable se queda en SQL: ya empezadas.
    expect(call?.filters.some(([op, col]) => op === 'lte' && col === 'start_date')).toBe(true);
    // El fin de vigencia, el día de la semana y la sucursal se deciden en
    // memoria sobre unas decenas de filas (lo que PostgREST no expresa bien
    // sobre jsonb), así que se comprueba el RESULTADO, no el SQL.
    state.promotions = [
      { id: 'vencida', name: 'Ayer', end_date: new Date(Date.now() - 86_400_000).toISOString() },
      { id: 'otra-sucursal', name: 'De la 9', end_date: null, branches: [9] },
      { id: 'vale', name: 'Vale', end_date: null, branches: [7] },
    ];
    const res2 = await get(`?terminalId=${T1}`);
    expect((await res2.json()).data.promotions.map((p: { id: string }) => p.id)).toEqual(['vale']);
  });

  it('una terminal de otra organización: 404 y ninguna lectura de promociones', async () => {
    const res = await get(`?terminalId=${T_OTRA_ORG}`);
    expect(res.status).toBe(404);
    expect(serviceDb.calls.some((c) => c.table === 'promotions')).toBe(false);
  });

  it('con token la terminal sale del token, aunque la query diga otra cosa', async () => {
    state.promotions = [{ id: 'p1', name: 'Promo' }];
    const res = await get(`?terminalId=${T_OTRA_ORG}`, { authorization: `Bearer ${TOKEN}` });
    expect(res.status).toBe(200);
    const call = serviceDb.calls.find((c) => c.table === 'promotions');
    expect(call?.filters).toEqual(expect.arrayContaining([['eq', 'organization_id', 120]]));
  });

  it('ni importes ni reglas salen de la ruta: el cartel no calcula descuentos', async () => {
    state.promotions = [{ id: 'p1', name: 'Promo', discount_value: 50, promotion_type: 'percentage', usage_limit: 10 }];
    const res = await get(`?terminalId=${T1}`);
    const [promo] = (await res.json()).data.promotions;
    expect(Object.keys(promo).sort()).toEqual(['description', 'endsAt', 'id', 'name']);
  });
});
