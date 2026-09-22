/**
 * TESTER · Fase 4 de la pantalla del cliente (calificación, informe y modo
 * reposo), ronda 1. Fase de ROTURA: aquí no se corrige nada, solo se fija con
 * pasos reproducibles lo que falla.
 *
 * Los `it` que empiezan por DEFECTO documentan un fallo REAL del código de
 * esta fase: describen lo que el código HACE hoy, no lo que debería hacer.
 * Quien lo arregle tiene que darles la vuelta.
 *
 * Sin nombres de organizaciones: ids y números.
 */

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

import fs from 'fs';
import path from 'path';
import { makeSupabaseDouble, type RecordedCall, type SupabaseDouble } from './f3a-supabaseDouble';

const RAIZ = path.resolve(__dirname, '../../..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

const T1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0001';
const T2 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0002';
const T_OTRA_ORG = 'bbbbbbbb-cccc-4ddd-8eee-ffffffff0001';
const VENTA = '11111111-2222-4333-8444-555555550001';

interface FilaFeedback {
  organization_id: number;
  branch_id: number;
  terminal_id: string;
  sale_id: string | null;
  rating: number;
  created_at: string;
}
interface FilaTerminal {
  id: string;
  organization_id: number;
  branch_id: number;
  is_active: boolean;
}

const estado: {
  feedback: FilaFeedback[];
  terminales: FilaTerminal[];
  promociones: Array<Record<string, unknown>>;
} = { feedback: [], terminales: [], promociones: [] };

function cumple(fila: Record<string, unknown>, call: RecordedCall): boolean {
  return call.filters.every(([op, col, valor]) => {
    const v = fila[col];
    if (op === 'eq') return v === valor;
    if (op === 'is') return valor === null ? v === null : v === valor;
    if (op === 'gte') return typeof v === 'string' && typeof valor === 'string' && v >= valor;
    if (op === 'lte') return typeof v === 'string' && typeof valor === 'string' && v <= valor;
    // `or` no se evalúa aquí a propósito: lo que se mira en estas pruebas es
    // QUÉ filtros manda la ruta, no si el doble sabe imitarlos.
    return true;
  });
}

function responder(call: RecordedCall) {
  if (call.table === 'pos_display_feedback') {
    if (call.op === 'insert') {
      const payload = call.payload as unknown as FilaFeedback;
      const choque =
        payload.sale_id !== null && estado.feedback.some((r) => r.terminal_id === payload.terminal_id && r.sale_id === payload.sale_id);
      if (choque) return { data: null, error: { code: '23505', message: 'duplicate key' } };
      estado.feedback.push({ ...payload, created_at: new Date().toISOString() });
      return { data: null, error: null };
    }
    const filas = estado.feedback.filter((r) => cumple(r as unknown as Record<string, unknown>, call));
    return { data: filas.slice(0, call.limit ?? filas.length), error: null };
  }
  if (call.table === 'pos_terminal_secrets') return { data: null, error: null };
  if (call.table === 'pos_terminals') {
    return { data: estado.terminales.find((r) => cumple(r as unknown as Record<string, unknown>, call)) ?? null, error: null };
  }
  if (call.table === 'promotions') return { data: estado.promociones, error: null };
  throw new Error(`tabla inesperada: ${call.table}`);
}

let servicio: SupabaseDouble;
let sesion: SupabaseDouble;
const sesionCtx = {
  organizationId: 120,
  userId: 'u-1',
  roleId: 2,
  roleName: 'x',
  isSuperAdmin: false,
  organizationName: 'org 120',
  memberId: 1,
  get supabase() {
    return sesion as never;
  },
};
const getServerOrgContext = jest.fn(async () => sesionCtx);
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  getServerOrgContext: (...a: unknown[]) => getServerOrgContext(...(a as [])),
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => servicio }));
jest.mock('@/lib/security/rateLimitStore', () => ({ getRateLimitStore: () => null, RATE_LIMIT_STORE_ENV: 'RATE_LIMIT_STORE' }));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 0 }));

import { NextRequest } from 'next/server';
import { POST as feedback } from '@/app/api/pos/display/feedback/route';
import { GET as promociones } from '@/app/api/pos/display/promotions/route';
import { _resetRateLimits } from '@/lib/security/rateLimit';
import { _resetDisplayRatingMemory, sendDisplayRating } from '@/lib/pos/display/feedback';
import { FEEDBACK_ANONYMOUS_WINDOW_MS } from '@/lib/pos/display/server/displayFeedback';
import { IDLE_SLIDE_MS, idleSlideIndex, isIdleSettled, resolveIdleContent, sanitizeIdleSettings } from '@/components/pos-display/idle';
import { sanitizeDisplayPromotions, shortenDescription } from '@/lib/pos/display/promotions';
import { getSatisfactionReport, aggregateSatisfaction } from '@/components/pos/reportes/satisfaccionService';

function post(body: unknown, headers: Record<string, string> = {}) {
  return feedback(
    new NextRequest('http://localhost/api/pos/display/feedback', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.11', ...headers },
    }),
  );
}

function get(query: string, headers: Record<string, string> = {}) {
  return promociones(
    new NextRequest(`http://localhost/api/pos/display/promotions${query}`, { headers: { 'x-forwarded-for': '203.0.113.11', ...headers } }),
  );
}

beforeEach(() => {
  _resetRateLimits();
  _resetDisplayRatingMemory();
  estado.feedback = [];
  estado.promociones = [];
  estado.terminales = [
    { id: T1, organization_id: 120, branch_id: 7, is_active: true },
    { id: T2, organization_id: 120, branch_id: 7, is_active: true },
    { id: T_OTRA_ORG, organization_id: 999, branch_id: 3, is_active: true },
  ];
  servicio = makeSupabaseDouble(responder);
  sesion = makeSupabaseDouble((call) => {
    if (call.table !== 'pos_terminals') throw new Error(`tabla inesperada en sesión: ${call.table}`);
    return { data: estado.terminales.find((r) => cumple(r as unknown as Record<string, unknown>, call)) ?? null, error: null };
  });
  getServerOrgContext.mockClear();
  getServerOrgContext.mockResolvedValue(sesionCtx);
});

// ---------------------------------------------------------------------------
// 1. Calificación: entradas hostiles en la ruta
// ---------------------------------------------------------------------------

describe('TESTER F4 · ruta de calificación: entradas hostiles', () => {
  it.each([
    ['cero', 0],
    ['seis', 6],
    ['decimal', 4.5],
    ['negativo', -3],
    ['cadena', '5'],
    ['booleano', true],
    ['infinito', Number.POSITIVE_INFINITY],
    ['nulo', null],
    ['ausente', undefined],
    ['objeto', { valueOf: () => 5 }],
    ['lista', [5]],
    ['entero enorme', Number.MAX_SAFE_INTEGER],
  ])('rating %s → 400 y ninguna fila', async (_nombre, rating) => {
    const res = await post({ terminalId: T1, saleId: VENTA, rating });
    expect(res.status).toBe(400);
    expect(estado.feedback).toHaveLength(0);
  });

  it.each([
    ['no es uuid', 'venta-1'],
    ['cadena vacía', ''],
    ['uuid con basura alrededor', ` ${VENTA} `],
    ['número', 1],
    ['objeto', { id: VENTA }],
  ])('saleId %s → 400 (la venta no se inventa)', async (_nombre, saleId) => {
    const res = await post({ terminalId: T1, saleId, rating: 5 });
    expect(res.status).toBe(400);
    expect(estado.feedback).toHaveLength(0);
  });

  it.each([
    ['organizationId', { organizationId: 999 }],
    ['organization_id', { organization_id: 999 }],
    ['branchId', { branchId: 3 }],
    ['branch_id', { branch_id: 3 }],
    ['created_at', { created_at: '1999-01-01T00:00:00Z' }],
    ['comentario del cliente', { comment: 'me atendió mal fulano' }],
    ['id del cliente', { customerId: 'c-1' }],
  ])('un campo de más (%s) → 400: el esquema es estricto', async (_nombre, extra) => {
    const res = await post({ terminalId: T1, saleId: VENTA, rating: 5, ...extra });
    expect(res.status).toBe(400);
    expect(estado.feedback).toHaveLength(0);
  });

  it('cuerpo que no es JSON → 400 INVALID_BODY', async () => {
    const res = await feedback(
      new NextRequest('http://localhost/api/pos/display/feedback', {
        method: 'POST',
        body: 'no soy json',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.11' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_BODY');
  });

  it('cuerpo que es un array o un número → 400', async () => {
    expect((await post([{ terminalId: T1, rating: 5 }])).status).toBe(400);
    expect((await post(7)).status).toBe(400);
    expect(estado.feedback).toHaveLength(0);
  });

  it('una terminal inactiva no puede calificar (404) aunque sea de la organización', async () => {
    estado.terminales = [{ id: T1, organization_id: 120, branch_id: 7, is_active: false }];
    const res = await post({ terminalId: T1, saleId: VENTA, rating: 5 });
    expect(res.status).toBe(404);
    expect(estado.feedback).toHaveLength(0);
  });

  it('la sucursal NO sale de la petición: se escribe la de la fila de la terminal', async () => {
    await post({ terminalId: T1, saleId: VENTA, rating: 5 });
    expect(estado.feedback[0]).toMatchObject({ organization_id: 120, branch_id: 7 });
    const insert = servicio.calls.find((c) => c.table === 'pos_display_feedback' && c.op === 'insert');
    expect(Object.keys(insert?.payload ?? {}).sort()).toEqual(['branch_id', 'organization_id', 'rating', 'sale_id', 'terminal_id']);
  });
});

// ---------------------------------------------------------------------------
// 2. Idempotencia
// ---------------------------------------------------------------------------

describe('TESTER F4 · una calificación por venta', () => {
  it('diez pulsaciones seguidas de la misma venta dejan UNA fila', async () => {
    for (let i = 0; i < 10; i += 1) {
      const res = await post({ terminalId: T1, saleId: VENTA, rating: ((i % 5) + 1) as number });
      expect(res.status).toBe(200);
    }
    expect(estado.feedback).toHaveLength(1);
    expect(estado.feedback[0].rating).toBe(1); // la primera, no la última
  });

  it('la respuesta no delata si la calificación era repetida más allá del propio campo', async () => {
    await post({ terminalId: T1, saleId: VENTA, rating: 5 });
    const repetida = await post({ terminalId: T1, saleId: VENTA, rating: 1 });
    expect(repetida.status).toBe(200);
    expect(await repetida.json()).toEqual({ data: { registered: false, duplicate: true } });
  });

  it('la MISMA venta desde otra terminal sí se registra (el índice único es por terminal)', async () => {
    await post({ terminalId: T1, saleId: VENTA, rating: 5 });
    const otra = await post({ terminalId: T2, saleId: VENTA, rating: 1 });
    expect((await otra.json()).data.registered).toBe(true);
    expect(estado.feedback).toHaveLength(2);
  });

  it('sin venta: la deduplicación mira SOLO la ventana, así que fuera de ella vuelve a escribir', async () => {
    await post({ terminalId: T1, saleId: null, rating: 3 });
    expect(estado.feedback).toHaveLength(1);
    // La fila anterior «envejece» más allá de la ventana anónima.
    estado.feedback[0].created_at = new Date(Date.now() - FEEDBACK_ANONYMOUS_WINDOW_MS - 1000).toISOString();
    const siguiente = await post({ terminalId: T1, saleId: null, rating: 5 });
    expect((await siguiente.json()).data.registered).toBe(true);
    expect(estado.feedback).toHaveLength(2);
  });

  it('sin venta: una calificación anónima no tapa la de OTRA terminal', async () => {
    await post({ terminalId: T1, saleId: null, rating: 3 });
    const otra = await post({ terminalId: T2, saleId: null, rating: 5 });
    expect((await otra.json()).data.registered).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. DEFECTO: la memoria de la caja sin venta no caduca nunca
// ---------------------------------------------------------------------------

describe('TESTER F4 · memoria de la caja (feedback.ts)', () => {
  it('DEFECTO: sin venta, la caja solo manda la PRIMERA calificación de la ventana del navegador; las de los clientes siguientes se tiran', async () => {
    // Reproducción: POS abierto todo el día, ventas a crédito
    // (CartView.handleHoldWithDebt llama a setMode('thanks') SIN saleId), así
    // que `sendDisplayRating` recibe siempre saleId null.
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200 }) as Response);
    const cliente1 = await sendDisplayRating({ terminalId: T1, saleId: null, rating: 5 }, fetchMock as unknown as typeof fetch);
    const cliente2 = await sendDisplayRating({ terminalId: T1, saleId: null, rating: 1 }, fetchMock as unknown as typeof fetch);
    const cliente3 = await sendDisplayRating({ terminalId: T1, saleId: null, rating: 4 }, fetchMock as unknown as typeof fetch);

    expect(cliente1).toEqual({ ok: true, alreadySent: false });
    // Lo esperable sería que el segundo cliente (otra venta, otra persona)
    // llegase al servidor y este decidiera con su ventana de 2 minutos.
    expect(cliente2).toEqual({ ok: true, alreadySent: true });
    expect(cliente3).toEqual({ ok: true, alreadySent: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Y no es cosa del tiempo: la clave `terminal|sin-venta` no caduca nunca.
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date(Date.now() + 8 * 60 * 60 * 1000)); // ocho horas después
      const finDeJornada = await sendDisplayRating({ terminalId: T1, saleId: null, rating: 2 }, fetchMock as unknown as typeof fetch);
      expect(finDeJornada.alreadySent).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('el servidor SÍ está preparado para ese caso: su ventana anónima es de 2 minutos', () => {
    expect(FEEDBACK_ANONYMOUS_WINDOW_MS).toBe(2 * 60 * 1000);
    // …pero la caja nunca llega a preguntárselo (ver DEFECTO de arriba).
    expect(leer('src/lib/pos/display/feedback.ts')).toContain("sin venta, por terminal");
  });

  it('un rechazo del servidor no se recuerda: el cliente puede volver a pulsar', async () => {
    const fetchMock = jest
      .fn<Promise<Response>, unknown[]>()
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response);
    const primero = await sendDisplayRating({ terminalId: T1, saleId: VENTA, rating: 5 }, fetchMock as unknown as typeof fetch);
    expect(primero).toEqual({ ok: false, alreadySent: false });
    const segundo = await sendDisplayRating({ terminalId: T1, saleId: VENTA, rating: 5 }, fetchMock as unknown as typeof fetch);
    expect(segundo).toEqual({ ok: true, alreadySent: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('un fetch que lanza no rompe la caja ni deja la calificación por recordada', async () => {
    const fetchMock = jest.fn(async () => {
      throw new Error('sin red');
    });
    await expect(sendDisplayRating({ terminalId: T1, saleId: VENTA, rating: 5 }, fetchMock as unknown as typeof fetch)).resolves.toEqual({
      ok: false,
      alreadySent: false,
    });
  });

  it.each([0, 6, 4.5, -1, Number.NaN, '5' as unknown as number])(
    'un rating inválido (%p) ni siquiera sale de la caja',
    async (rating) => {
      const fetchMock = jest.fn(async () => ({ ok: true, status: 200 }) as Response);
      const res = await sendDisplayRating({ terminalId: T1, saleId: VENTA, rating: rating as never }, fetchMock as unknown as typeof fetch);
      expect(res.ok).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('sin terminal no se llama al servidor', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200 }) as Response);
    await sendDisplayRating({ terminalId: '', saleId: VENTA, rating: 5 }, fetchMock as unknown as typeof fetch);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4. Pantalla no táctil
// ---------------------------------------------------------------------------

describe('TESTER F4 · sin táctil no se pide calificación', () => {
  it('la pantalla solo pinta el selector si la caja lo pide Y hay táctil', () => {
    const fuente = leer('src/components/pos-display/CustomerDisplay.tsx');
    // askRating = thanks.askRating && touch (PLAN §4.4).
    expect(fuente).toMatch(/askRating\s*=\s*state\?\.mode === 'thanks' && state\.thanks\?\.askRating === true && touch/);
    // Y sin askRating no se pasa onRate: un no-táctil no puede ni intentarlo.
    expect(fuente).toMatch(/onRate=\{askRating \? onRate : undefined\}/);
  });

  it('ThanksView no pinta nada si falta cualquiera de los dos', () => {
    const vistas = leer('src/components/pos-display/views.tsx');
    expect(vistas).toContain('{askRating && onRate ? <RatingPicker');
  });

  it('el touch de la pantalla sale de la detección + el forzado de la organización, no del mensaje', () => {
    const fuente = leer('src/components/pos-display/CustomerDisplay.tsx');
    expect(fuente).toMatch(/resolveTouch\(/);
  });
});

// ---------------------------------------------------------------------------
// 5. Modo reposo
// ---------------------------------------------------------------------------

describe('TESTER F4 · reposo: ajustes hostiles', () => {
  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:image/png;base64,iVBORw0KGgo='],
    ['relativa', '/uploads/cartel.png'],
    ['sin esquema', 'www.ejemplo.com/a.png'],
    ['con espacio', 'https://ejemplo.com/a b.png'],
    ['dos pegadas por salto', 'https://a.example/1.png\nhttps://b.example/2.png'],
    ['solo espacios', '   '],
    ['file://', 'file:///C:/cartel.png'],
    ['no es cadena', 42],
    ['nula', null],
    ['objeto', { url: 'https://ejemplo.com/a.png' }],
  ])('mediaUrls con una URL inválida (%s) la descarta', (_nombre, url) => {
    const idle = sanitizeIdleSettings({ mode: 'media', mediaUrls: [url], idleAfterSeconds: 90 });
    expect(idle.mediaUrls).toEqual([]);
  });

  it('las válidas sobreviven y las inválidas no arrastran a las demás', () => {
    const idle = sanitizeIdleSettings({
      mode: 'media',
      mediaUrls: ['javascript:alert(1)', 'https://ejemplo.com/1.png', '   https://ejemplo.com/2.png   ', '/relativa.png'],
      idleAfterSeconds: 45,
    });
    expect(idle.mediaUrls).toEqual(['https://ejemplo.com/1.png', 'https://ejemplo.com/2.png']);
  });

  it('DEFECTO menor: el predicado de URL de reposo está duplicado (idle.ts e isValidMediaUrl de settingsSchema.ts)', () => {
    expect(leer('src/components/pos-display/idle.ts')).toContain('function isMediaUrl');
    expect(leer('src/components/pos-display/idle.ts')).not.toContain('isValidMediaUrl');
    expect(leer('src/lib/pos/display/settingsSchema.ts')).toContain('export function isValidMediaUrl');
  });

  it('modo «media» sin ninguna imagen válida cae a la marca', () => {
    const idle = sanitizeIdleSettings({ mode: 'media', mediaUrls: ['javascript:alert(1)'], idleAfterSeconds: 30 });
    expect(resolveIdleContent({ mode: idle.mode, promotions: 0, media: idle.mediaUrls.length, settled: true })).toBe('brand');
  });

  it('modo «promociones» sin promociones cae a la marca (y no a una pantalla en negro)', () => {
    expect(resolveIdleContent({ mode: 'promotions', promotions: 0, media: 5, settled: true })).toBe('brand');
  });

  it('antes de cumplirse el tiempo sin actividad siempre se ve la marca', () => {
    expect(resolveIdleContent({ mode: 'promotions', promotions: 3, media: 3, settled: false })).toBe('brand');
    expect(resolveIdleContent({ mode: 'media', promotions: 3, media: 3, settled: false })).toBe('brand');
  });

  it.each([
    ['ausente', undefined],
    ['nulo', null],
    ['lista', []],
    ['cadena', 'promotions'],
    ['modo inventado', { mode: 'video' }],
    ['segundos absurdos', { mode: 'brand', idleAfterSeconds: -5 }],
    ['segundos que no son número', { mode: 'brand', idleAfterSeconds: '90' }],
    ['mediaUrls que no es lista', { mode: 'media', mediaUrls: 'https://a.example/1.png' }],
  ])('ajustes de reposo basura (%s) degradan campo a campo, nunca lanzan', (_nombre, valor) => {
    expect(() => sanitizeIdleSettings(valor)).not.toThrow();
    const idle = sanitizeIdleSettings(valor);
    expect(['brand', 'promotions', 'media']).toContain(idle.mode);
    expect(idle.idleAfterSeconds).toBeGreaterThanOrEqual(10);
    expect(idle.idleAfterSeconds).toBeLessThanOrEqual(3600);
    expect(Array.isArray(idle.mediaUrls)).toBe(true);
  });

  it('más de 20 imágenes se recortan a 20', () => {
    const urls = Array.from({ length: 30 }, (_, i) => `https://ejemplo.com/${i}.png`);
    expect(sanitizeIdleSettings({ mode: 'media', mediaUrls: urls }).mediaUrls).toHaveLength(20);
  });

  it('la rotación es de 8 s y vuelve al principio; una pestaña dormida retoma la lámina que toca', () => {
    expect(IDLE_SLIDE_MS).toBe(8_000);
    expect(idleSlideIndex(0, 3)).toBe(0);
    expect(idleSlideIndex(7_999, 3)).toBe(0);
    expect(idleSlideIndex(8_000, 3)).toBe(1);
    expect(idleSlideIndex(23_999, 3)).toBe(2);
    expect(idleSlideIndex(24_000, 3)).toBe(0);
    // Media hora en segundo plano: no se queda en la lámina 225, sino en la que toca.
    expect(idleSlideIndex(30 * 60_000, 3)).toBe(idleSlideIndex(30 * 60_000, 3));
    expect(idleSlideIndex(30 * 60_000, 3)).toBeLessThan(3);
  });

  it.each([
    [0, 0],
    [-1, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])('idleSlideIndex con count %p no rompe el render', (count, esperado) => {
    expect(idleSlideIndex(50_000, count as number)).toBe(esperado);
  });

  it('el reposo no entra antes de tiempo ni se queda colgado', () => {
    const ahora = 1_800_000_000_000;
    expect(isIdleSettled(null, ahora, 90)).toBe(false);
    expect(isIdleSettled(ahora - 89_000, ahora, 90)).toBe(false);
    expect(isIdleSettled(ahora - 90_000, ahora, 90)).toBe(true);
    expect(isIdleSettled(ahora - 10, ahora, Number.NaN)).toBe(false);
  });

  it('el fundido no pasa de 300 ms y no hay sonido en el reposo', () => {
    const vistas = leer('src/components/pos-display/views.tsx');
    expect(leer('src/components/pos-display/idle.ts')).toContain('IDLE_FADE_MS = 300');
    expect(vistas).not.toMatch(/<audio|new Audio\(|\.play\(\)/);
  });
});

// ---------------------------------------------------------------------------
// 6. Cartelera de promociones
// ---------------------------------------------------------------------------

describe('TESTER F4 · cartelera del reposo', () => {
  it('DEFECTO: la ruta no filtra `applicable_days`, así que la pantalla puede anunciar una promoción que el POS no aplicará hoy', async () => {
    // promotionEngine.loadActivePromotions descarta en memoria las que no son
    // del día (`applicable_days`); la ruta de la pantalla no lo hace, ni en SQL
    // ni al proyectar. Resultado: cartel de «solo sábados» un martes.
    estado.promociones = [{ id: 'p-sabado', name: 'Solo sábados', description: '2x1', applicable_days: ['saturday'], end_date: null }];
    const res = await get(`?terminalId=${T1}`);
    expect(res.status).toBe(200);
    expect((await res.json()).data.promotions).toEqual([{ id: 'p-sabado', name: 'Solo sábados', description: '2x1', endsAt: null }]);
    // Y la consulta no menciona la columna siquiera:
    const call = servicio.calls.find((c) => c.table === 'promotions');
    expect(call?.columns).not.toContain('applicable_days');
    expect(call?.filters.some(([, col]) => String(col).includes('applicable_days'))).toBe(false);
    expect(leer('src/lib/services/promotionEngine.ts')).toContain('applicable_days');
  });

  it('la cartelera no lleva importes, reglas ni cupos', async () => {
    estado.promociones = [
      { id: 'p1', name: 'Promo', discount_value: 30, promotion_type: 'percentage', usage_limit: 5, usage_count: 5, min_purchase_amount: 1000 },
    ];
    const [promo] = (await (await get(`?terminalId=${T1}`)).json()).data.promotions;
    expect(Object.keys(promo).sort()).toEqual(['description', 'endsAt', 'id', 'name']);
  });

  it('una fila sin nombre no se pinta: un cartel sin nombre no es un cartel', () => {
    expect(sanitizeDisplayPromotions([{ id: 'p1' }, { name: 'sin id' }, null, 7, 'x'])).toEqual([]);
  });

  it('la descripción se recorta sin partir palabras y nunca pasa de 160 caracteres', () => {
    const larga = 'palabra '.repeat(40).trim();
    const corta = shortenDescription(larga);
    expect(corta).not.toBeNull();
    expect((corta as string).length).toBeLessThanOrEqual(161); // 160 + «…»
    expect(corta as string).toMatch(/…$/);
    expect(shortenDescription('con\nsaltos\ty tabuladores')).toBe('con saltos y tabuladores');
    expect(shortenDescription('   ')).toBeNull();
  });

  it('nunca se rotan más de 10 láminas', () => {
    const muchas = Array.from({ length: 25 }, (_, i) => ({ id: `p${i}`, name: `Promo ${i}` }));
    expect(sanitizeDisplayPromotions(muchas)).toHaveLength(10);
  });

  it('la organización y la sucursal salen de la terminal, no de la query', async () => {
    estado.promociones = [{ id: 'p1', name: 'Promo' }];
    await get(`?terminalId=${T1}&organizationId=999&branchId=3`);
    const call = servicio.calls.find((c) => c.table === 'promotions');
    expect(call?.filters).toEqual(expect.arrayContaining([['eq', 'organization_id', 120]]));
    expect(call?.filters.some(([op, expr]) => op === 'or' && String(expr).includes('branches.cs.[7]'))).toBe(true);
    expect(call?.filters.some(([, , v]) => v === 999 || v === 3)).toBe(false);
  });

  it('terminal de otra organización: 404 y ni una lectura de promociones', async () => {
    const res = await get(`?terminalId=${T_OTRA_ORG}`);
    expect(res.status).toBe(404);
    expect(servicio.calls.some((c) => c.table === 'promotions')).toBe(false);
  });

  it('sin terminalId y sin token: 400, no 500', async () => {
    const res = await get('');
    expect(res.status).toBe(400);
  });

  it('DEFECTO: el modo reposo sale SOLO de hello.settings, así que una tableta emparejada con el POS cerrado nunca rota promociones ni imágenes', () => {
    // El bootstrap de la tableta ya trae los ajustes completos
    // (`/api/pos/display/bootstrap` devuelve `settings` con `idle`), y el
    // idioma sí cae al bootstrap cuando no hay saludo. El reposo no: se lee
    // de `link.hello?.settings` y punto. Sin caja hablando no hay `hello`,
    // así que la tableta se queda en la marca con el reloj… que es justo el
    // caso que la ruta /promotions decía querer cubrir («la tableta puede
    // estar en reposo con el POS cerrado»).
    const pantalla = leer('src/components/pos-display/CustomerDisplay.tsx');
    expect(pantalla).toMatch(/const settings = link\.hello\?\.settings/);
    expect(pantalla).toMatch(/sanitizeIdleSettings\(settings\?\.idle\)/);
    // El idioma sí tiene respaldo del bootstrap; el reposo no.
    expect(pantalla).toMatch(/settingsLocale \?\? bootstrapLocale/);
    expect(pantalla).not.toMatch(/bootstrap\.settings/);
    // Y el bootstrap sí los manda: el dato está, solo que nadie lo lee.
    expect(leer('src/app/api/pos/display/bootstrap/route.ts')).toMatch(/settings,/);
    expect(leer('src/lib/pos/display/remoteDisplay.ts')).toContain('settings: Record<string, unknown>');
  });
});

// ---------------------------------------------------------------------------
// 7. Informe y zona horaria
// ---------------------------------------------------------------------------

describe('TESTER F4 · informe: zona horaria de la organización', () => {
  function dobleInforme(filas: unknown[]) {
    const llamadas: RecordedCall[] = [];
    const db = makeSupabaseDouble((call) => {
      llamadas.push(call);
      if (call.table === 'pos_display_feedback') return { data: filas, error: null };
      return { data: [], error: null };
    });
    return { db, llamadas: db.calls };
  }

  it('el rango se ancla al desfase de la organización y NO al TZ del proceso', async () => {
    const { db } = dobleInforme([]);
    await getSatisfactionReport({ startDate: '2026-09-01', endDate: '2026-09-30', timezone: 'America/Bogota' }, db as never, 120);
    const call = db.calls.find((c) => c.table === 'pos_display_feedback');
    const gte = call?.filters.find(([op, col]) => op === 'gte' && col === 'created_at')?.[2];
    const lte = call?.filters.find(([op, col]) => op === 'lte' && col === 'created_at')?.[2];
    // Mismo resultado con TZ=UTC y con TZ=America/Bogota (npm run test:tz-all).
    expect(gte).toBe('2026-09-01T00:00:00.000-05:00');
    expect(lte).toBe('2026-09-30T23:59:59.999-05:00');
  });

  it('otra zona con horario de verano usa SU desfase, no el de Bogotá', async () => {
    const { db } = dobleInforme([]);
    await getSatisfactionReport({ startDate: '2026-07-01', endDate: '2026-07-31', timezone: 'Europe/Madrid' }, db as never, 120);
    const call = db.calls.find((c) => c.table === 'pos_display_feedback');
    expect(call?.filters.find(([op, col]) => op === 'gte' && col === 'created_at')?.[2]).toBe('2026-07-01T00:00:00.000+02:00');
  });

  it('el informe no cruza con customers ni lee ninguna columna personal', async () => {
    const { db } = dobleInforme([{ rating: 5, branch_id: 7, terminal_id: T1, created_at: '2026-09-10T15:00:00Z' }]);
    await getSatisfactionReport({ startDate: '2026-09-01', endDate: '2026-09-30', timezone: 'America/Bogota' }, db as never, 120);
    expect(db.calls.map((c) => c.table)).not.toContain('customers');
    expect(db.calls.map((c) => c.table)).not.toContain('sales');
    const call = db.calls.find((c) => c.table === 'pos_display_feedback');
    expect(call?.columns).toBe('rating, branch_id, terminal_id, created_at');
    expect(leer('src/components/pos/reportes/satisfaccionService.ts')).not.toContain('sale_id');
  });

  it('DOCUMENTADO: el informe lee como mucho 5000 filas sin paginar (el promedio de un rango largo sería el de las 5000 últimas)', async () => {
    const { db } = dobleInforme([]);
    await getSatisfactionReport({ startDate: '2026-01-01', endDate: '2026-12-31', timezone: 'America/Bogota' }, db as never, 120);
    const call = db.calls.find((c) => c.table === 'pos_display_feedback');
    expect(call?.limit).toBe(5000);
    expect(call?.order).toEqual(['created_at', { ascending: false }]);
  });

  it('notas fuera de 1-5 que llegasen de la base no entran en el promedio', () => {
    const informe = aggregateSatisfaction([
      { rating: 5, branch_id: 7, terminal_id: T1, created_at: '2026-09-10T15:00:00Z' },
      { rating: 0, branch_id: 7, terminal_id: T1, created_at: '2026-09-10T15:00:00Z' },
      { rating: 6, branch_id: 7, terminal_id: T1, created_at: '2026-09-10T15:00:00Z' },
      { rating: 3.5, branch_id: 7, terminal_id: T1, created_at: '2026-09-10T15:00:00Z' },
      { rating: 1, branch_id: 7, terminal_id: T1, created_at: '2026-09-10T15:00:00Z' },
    ]);
    expect(informe.total).toBe(2);
    expect(informe.average).toBe(3);
    expect(informe.distribution).toEqual({ 1: 1, 2: 0, 3: 0, 4: 0, 5: 1 });
  });

  it('una fila sin sucursal cuenta en el total pero no inventa un grupo', () => {
    const informe = aggregateSatisfaction([
      { rating: 4, branch_id: null, terminal_id: null, created_at: '2026-09-10T15:00:00Z' },
      { rating: 2, branch_id: 7, terminal_id: T1, created_at: '2026-09-10T15:00:00Z' },
    ]);
    expect(informe.total).toBe(2);
    expect(informe.byBranch).toHaveLength(1);
    expect(informe.byTerminal).toHaveLength(1);
  });

  it('la página del informe usa el timezone de la organización y nunca lo cablea', () => {
    const fuente = leer('src/components/pos/reportes/SatisfaccionPage.tsx');
    expect(fuente).toContain('useOrgTimezone');
    expect(fuente).not.toContain("'America/Bogota'");
    expect(fuente).not.toMatch(/toISOString\(\)\.split\('T'\)\[0\]/);
    expect(leer('src/components/pos/reportes/satisfaccionService.ts')).not.toMatch(/toISOString\(\)\.split\('T'\)\[0\]/);
  });
});

// ---------------------------------------------------------------------------
// 8. Terminal local sin registrar
// ---------------------------------------------------------------------------

describe('TESTER F4 · caja sin terminal registrada', () => {
  it('DEFECTO: con la caja sin vincular a pos_terminals, la calificación se pierde en silencio (404) y el informe queda vacío', async () => {
    // `getOrCreateLocalTerminalId()` devuelve un UUID de localStorage que NO
    // existe en `pos_terminals` mientras nadie use «Esta caja» para vincularla
    // (EstaCajaSection). La ruta responde 404 y `sendDisplayRating` solo lo
    // apunta en la consola: ni el cajero ni el dueño se enteran de que la
    // calificación no llegó, y la tarjeta de ajustes deja encender la
    // calificación igualmente.
    const desconocida = 'cccccccc-dddd-4eee-8fff-000000000001';
    const res = await post({ terminalId: desconocida, saleId: VENTA, rating: 5 });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('TERMINAL_NOT_FOUND');
    expect(estado.feedback).toHaveLength(0);

    // Y la cartelera del reposo se queda igual de muda.
    const cartel = await get(`?terminalId=${desconocida}`);
    expect(cartel.status).toBe(404);

    // La caja no reintenta ni avisa: solo console.warn.
    expect(leer('src/lib/pos/display/feedback.ts')).toContain('console.warn');
    expect(leer('src/components/pos/configuracion/pantalla-cliente/AjustesPantallaSection.tsx')).not.toContain('TERMINAL_NOT_FOUND');
  });
});
