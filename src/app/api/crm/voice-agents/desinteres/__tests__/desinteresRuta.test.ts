/// <reference types="jest" />
/**
 * GET|PUT /api/crm/voice-agents/desinteres — configuración de la organización
 * de qué hace el agente de voz ante el desinterés definitivo.
 *
 * La organización sale de la sesión (otra en el body → 403 sin escribir), los
 * permisos se resuelven en el servidor (`crm.stages.manage`), la validación
 * es la del servidor (monto ≥ 0, moneda del catálogo, etapa de ventas propia).
 */

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

import { fakeSupabase, makeDb, ORG, OTRA, U, YO, type Ola1Db, type Row } from '../../../__tests__/ola1Fake';

let db: Ola1Db;
let permisos: Set<string>;

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: YO, roleId: 4, roleName: 'x', isSuperAdmin: false, supabase: fakeSupabase(db) })),
  hasOrgAdminOrPermission: jest.fn(async (_ctx: unknown, code: string) => permisos.has(code)),
}));
jest.mock('@/lib/services/monedaOrganizacion', () => ({ resolveOrgCurrency: jest.fn(async () => ({ code: 'COP', decimals: 0 })) }));

import { NextRequest } from 'next/server';
import { GET, PUT } from '../route';

const GESTOR = ['crm.stages.manage'];
const req = (method: string, body?: unknown, query = '') =>
  new NextRequest(`http://localhost/api/crm/voice-agents/desinteres${query}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> });

const VALIDO = {
  modo: 'mark_lost',
  excepcionValor: { activa: true, monto: 20_000_000, moneda: 'COP' },
  excepcionEtapa: { activa: true, etapaId: U(42) },
};

function semilla(): Record<string, Row[]> {
  return {
    pipelines: [
      { id: U(40), organization_id: ORG, name: 'Ventas', pipeline_type: 'sales', stages: [
        { id: U(41), name: 'Calificación', position: 1, is_won: false, is_lost: false },
        { id: U(42), name: 'Negociación', position: 2, is_won: false, is_lost: false },
        { id: U(49), name: 'Perdida', position: 9, is_won: false, is_lost: true },
      ] },
      { id: U(50), organization_id: ORG, name: 'Renovaciones', pipeline_type: 'renewal', stages: [{ id: U(51), name: 'Aviso', position: 1, is_won: false, is_lost: false }] },
      { id: U(95), organization_id: OTRA, name: 'Ajeno', pipeline_type: 'sales', stages: [{ id: U(96), name: 'Señuelo', position: 1, is_won: false, is_lost: false }] },
    ],
    organization_currencies: [
      { organization_id: ORG, currency_code: 'COP', is_base: true },
      { organization_id: ORG, currency_code: 'USD', is_base: false },
      { organization_id: OTRA, currency_code: 'EUR', is_base: true },
    ],
    currencies: [{ code: 'COP' }, { code: 'USD' }, { code: 'EUR' }],
    crm_voice_disinterest_settings: [
      { organization_id: OTRA, mode: 'log_only', value_exception_enabled: false, value_threshold: null, value_currency: null, stage_exception_enabled: false, advanced_stage_id: null, updated_by: null, updated_at: null },
    ],
  };
}

beforeEach(() => {
  db = makeDb(semilla());
  permisos = new Set(GESTOR);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('GET', () => {
  it('sin fila propia: valores por defecto (marcar perdida, sin excepciones), aunque otra organización tenga la suya', async () => {
    const { status, body } = await json(await GET(req('GET')));
    expect(status).toBe(200);
    const data = body.data as { config: { modo: string; guardada: boolean; excepcionValor: { activa: boolean } }; puedeEditar: boolean; monedaBase: string; monedas: string[]; etapas: { id: string }[] };
    expect(data.config).toMatchObject({ modo: 'mark_lost', guardada: false, excepcionValor: { activa: false } });
    expect(data.puedeEditar).toBe(true);
    expect(data.monedaBase).toBe('COP');
    expect(data.monedas).toEqual(['COP', 'USD']);
    // Solo etapas abiertas de pipelines de VENTAS de la organización de la sesión.
    expect(data.etapas.map((e) => e.id)).toEqual([U(41), U(42)]);
  });

  it('sin el permiso: se lee, pero `puedeEditar` es false (lo decide el servidor)', async () => {
    permisos = new Set();
    const { body } = await json(await GET(req('GET')));
    expect((body.data as { puedeEditar: boolean }).puedeEditar).toBe(false);
  });
});

describe('PUT', () => {
  it('guarda con la organización de la sesión y quién la cambió', async () => {
    const { status, body } = await json(await PUT(req('PUT', VALIDO)));
    expect(status).toBe(200);
    const fila = db.t.crm_voice_disinterest_settings.find((r) => r.organization_id === ORG);
    expect(fila).toMatchObject({ mode: 'mark_lost', value_exception_enabled: true, value_threshold: 20_000_000, value_currency: 'COP', stage_exception_enabled: true, advanced_stage_id: U(42), updated_by: YO });
    expect((body.data as { config: { guardada: boolean } }).config.guardada).toBe(true);
    // La de la otra organización no se toca.
    expect(db.t.crm_voice_disinterest_settings.find((r) => r.organization_id === OTRA)?.mode).toBe('log_only');
  });

  it('un segundo PUT actualiza la misma fila (upsert por organización)', async () => {
    await PUT(req('PUT', VALIDO));
    await PUT(req('PUT', { ...VALIDO, modo: 'task_only' }));
    expect(db.t.crm_voice_disinterest_settings.filter((r) => r.organization_id === ORG)).toHaveLength(1);
    expect(db.t.crm_voice_disinterest_settings.find((r) => r.organization_id === ORG)?.mode).toBe('task_only');
  });

  it('403 si el body trae OTRA organización, y no escribe', async () => {
    const { status, body } = await json(await PUT(req('PUT', { ...VALIDO, organization_id: OTRA })));
    expect(status).toBe(403);
    expect(body.code).toBe('FOREIGN_ORGANIZATION');
    expect(db.writes.filter((w) => w.table === 'crm_voice_disinterest_settings')).toHaveLength(0);
  });

  it('la MISMA organización en el body no es un ataque', async () => {
    const { status } = await json(await PUT(req('PUT', { ...VALIDO, organization_id: ORG })));
    expect(status).toBe(200);
  });

  it('403 sin «Configurar etapas», y no escribe', async () => {
    permisos = new Set(['crm.opportunities.edit_any']);
    const { status, body } = await json(await PUT(req('PUT', VALIDO)));
    expect(status).toBe(403);
    expect(body.code).toBe('CRM_FORBIDDEN');
    expect(db.writes.filter((w) => w.table === 'crm_voice_disinterest_settings')).toHaveLength(0);
  });

  it.each([
    ['monto negativo', { ...VALIDO, excepcionValor: { activa: true, monto: -1, moneda: 'COP' } }],
    ['moneda con formato inválido', { ...VALIDO, excepcionValor: { activa: true, monto: 1, moneda: 'pesos' } }],
    ['monto ausente con la excepción activa', { ...VALIDO, excepcionValor: { activa: true, monto: null, moneda: 'COP' } }],
    ['modo desconocido', { ...VALIDO, modo: 'cerrar_todo' }],
  ])('400 · %s', async (_n, cuerpo) => {
    const { status } = await json(await PUT(req('PUT', cuerpo)));
    expect(status).toBe(400);
    expect(db.writes.filter((w) => w.table === 'crm_voice_disinterest_settings')).toHaveLength(0);
  });

  it('400 · moneda que no existe en el catálogo', async () => {
    const { status, body } = await json(await PUT(req('PUT', { ...VALIDO, excepcionValor: { activa: true, monto: 1, moneda: 'XYZ' } })));
    expect(status).toBe(400);
    expect(body.code).toBe('moneda_invalida');
  });

  it.each([
    ['de otra organización', U(96)],
    ['de un pipeline que no es de ventas', U(51)],
    ['terminal (perdida)', U(49)],
  ])('400 · etapa %s', async (_n, etapaId) => {
    const { status, body } = await json(await PUT(req('PUT', { ...VALIDO, excepcionEtapa: { activa: true, etapaId } })));
    expect(status).toBe(400);
    expect(body.code).toBe('etapa_invalida');
  });

  it('monto 0 es válido (≥ 0)', async () => {
    const { status } = await json(await PUT(req('PUT', { ...VALIDO, excepcionValor: { activa: true, monto: 0, moneda: 'USD' } })));
    expect(status).toBe(200);
  });
});
