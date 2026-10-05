/// <reference types="jest" />
/**
 * Importador de leads — servicio (`leadsImportService`) sobre un doble de
 * Supabase en memoria que APLICA los filtros (`eq`, `neq`, `in`, `lte`,
 * `imatch` y rutas JSON `metadata->importacion->>lote`).
 *
 * Cubre: deduplicación contra la base y en el archivo, cliente existente con y
 * sin lead abierto, aislamiento por organización (señuelos de la 121), mapeo a
 * cliente + lead tal como llega a la base, conversión de moneda, RNE e
 * idempotencia (reimportar el mismo bloque no escribe nada).
 *
 * CRM ola 1 (D2, 2026-09-29): el lead ES la ficha de cliente. La importación
 * crea o marca la ficha (`lead_source='import'`, `metadata.lead` con el valor
 * anual y la importación, banda ICP de respaldo desde la prioridad) y NO crea
 * oportunidades 'lead'.
 *
 * Datos 100 % sintéticos.
 */

jest.mock('@/lib/services/crm/leadAutoAssign', () => ({
  autoAssignLead: jest.fn(async () => ({ status: 'unassigned', reason: 'sin equipo (prueba)' })),
}));
jest.mock('@/lib/services/organizationTimezoneService', () => ({
  getOrganizationTimezone: jest.fn(async () => 'America/Bogota'),
}));
jest.mock('@/lib/services/monedaOrganizacion', () => ({
  resolveOrgCurrency: jest.fn(async () => ({ code: 'COP', decimals: 0, source: 'base' })),
  resetOrgCurrencyCache: jest.fn(),
}));

import type { SupabaseClient } from '@supabase/supabase-js';
import { calcularDv } from '@/lib/utils/nitDv';
import { importarBloque, validarImportacion } from '../leadsImportService';
import type { FilaLeadEntrada, OpcionesImportacionLeads } from '@/lib/crm/importacionLeads/tipos';

type Row = Record<string, unknown>;
interface Filtro { k: 'eq' | 'neq' | 'in' | 'lte' | 'imatch' | 'is' | 'not_is'; col: string; v: unknown }
interface Db { t: Record<string, Row[]>; writes: { table: string; op: string; payload: unknown }[]; queries: { table: string; filtros: Filtro[] }[]; seq: number }

const valor = (row: Row, col: string): unknown => {
  const m = /^(\w+)->(\w+)->>(\w+)$/.exec(col);
  if (!m) return row[col];
  const a = row[m[1]] as Record<string, Record<string, unknown>> | undefined;
  const v = a?.[m[2]]?.[m[3]];
  return v === undefined || v === null ? null : String(v);
};
const cumple = (row: Row, f: Filtro) => {
  const v = valor(row, f.col);
  if (f.k === 'eq') return v === f.v;
  if (f.k === 'neq') return v !== f.v;
  if (f.k === 'in') return (f.v as unknown[]).includes(v);
  if (f.k === 'lte') return String(v) <= String(f.v);
  if (f.k === 'is') return f.v === null ? v === null || v === undefined : v === f.v;
  if (f.k === 'not_is') return f.v === null ? v !== null && v !== undefined : v !== f.v;
  return typeof v === 'string' && new RegExp(String(f.v), 'i').test(v);
};

function fake(db: Db): SupabaseClient {
  const from = (table: string) => {
    const filtros: Filtro[] = [];
    let op: 'select' | 'insert' | 'delete' | 'update' = 'select';
    let payload: unknown = null;
    const orden: { col: string; asc: boolean }[] = [];
    let limite: number | null = null;
    const run = (modo: 'many' | 'single' | 'maybe') => {
      const filas = (db.t[table] ??= []);
      if (op === 'insert') {
        const r: Row = { id: `${table}-${++db.seq}`, ...(payload as Row) };
        filas.push(r);
        db.writes.push({ table, op, payload });
        return { data: { ...r }, error: null };
      }
      if (op === 'select') db.queries.push({ table, filtros: [...filtros] });
      let hit = filas.filter((r) => filtros.every((f) => cumple(r, f)));
      if (op === 'delete') {
        db.writes.push({ table, op, payload: filtros });
        db.t[table] = filas.filter((r) => !hit.includes(r));
      }
      if (op === 'update') {
        db.writes.push({ table, op, payload });
        hit.forEach((r) => Object.assign(r, payload));
      }
      for (const o of [...orden].reverse()) hit = [...hit].sort((a, b) => (String(a[o.col]) < String(b[o.col]) ? -1 : String(a[o.col]) > String(b[o.col]) ? 1 : 0) * (o.asc ? 1 : -1));
      if (limite !== null) hit = hit.slice(0, limite);
      const data = hit.map((r) => ({ ...r }));
      if (modo === 'single') return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: 'no single' } };
      if (modo === 'maybe') return { data: data[0] ?? null, error: null };
      return { data, error: null };
    };
    const c: Record<string, unknown> = {
      select: () => c,
      insert: (p: unknown) => ((op = 'insert'), (payload = p), c),
      update: (p: unknown) => ((op = 'update'), (payload = p), c),
      delete: () => ((op = 'delete'), c),
      eq: (col: string, v: unknown) => (filtros.push({ k: 'eq', col, v }), c),
      neq: (col: string, v: unknown) => (filtros.push({ k: 'neq', col, v }), c),
      in: (col: string, v: unknown[]) => (filtros.push({ k: 'in', col, v }), c),
      lte: (col: string, v: unknown) => (filtros.push({ k: 'lte', col, v }), c),
      is: (col: string, v: unknown) => (filtros.push({ k: 'is', col, v }), c),
      not: (col: string, operador: string, v: unknown) => {
        if (operador !== 'is') throw new Error(`fake: not ${operador}`);
        filtros.push({ k: 'not_is', col, v });
        return c;
      },
      filter: (col: string, operador: string, v: unknown) => {
        if (operador !== 'imatch') throw new Error(`fake: filter ${operador}`);
        filtros.push({ k: 'imatch', col, v });
        return c;
      },
      order: (col: string, o?: { ascending?: boolean }) => (orden.push({ col, asc: o?.ascending !== false }), c),
      limit: (n: number) => ((limite = n), c),
      maybeSingle: async () => run('maybe'),
      single: async () => run('single'),
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(run('many')).then(ok, ko),
    };
    return c;
  };
  return { from } as unknown as SupabaseClient;
}

const ORG = 120;
const OTRA = 121;
const NIT = '900333444';
const DV = calcularDv(NIT) as number;

function semilla(): Db {
  return {
    seq: 0,
    writes: [],
    queries: [],
    t: {
      pipelines: [
        { id: 'pipe-120', organization_id: ORG, is_default: true, created_at: '2026-01-01' },
        { id: 'pipe-121', organization_id: OTRA, is_default: true, created_at: '2025-01-01' },
      ],
      stages: [
        { id: 'st-1', pipeline_id: 'pipe-120', position: 1 },
        { id: 'st-121', pipeline_id: 'pipe-121', position: 0 },
      ],
      customers: [
        { id: 'c-abierto', organization_id: ORG, full_name: 'Cliente Con Lead', phone: '+57 300 111 2233', email: null, identification_number: null, status: 'active' },
        { id: 'c-sin-lead', organization_id: ORG, full_name: 'Cliente Sin Lead', phone: null, email: 'Existe@Sintetico.CO', identification_number: null, status: 'active' },
        // Señuelo: mismo teléfono que la fila 6, pero de OTRA organización.
        { id: 'c-121', organization_id: OTRA, full_name: 'Ajeno', phone: '3004445566', email: null, identification_number: null, status: 'active' },
      ],
      opportunities: [{ id: 'o-1', organization_id: ORG, customer_id: 'c-abierto', record_type: 'lead', status: 'open' }],
      verticals: [
        { id: 'v-rest', organization_id: ORG, name: 'Restaurantes y bares', slug: 'restaurantes', sort_order: 1, is_active: true },
        { id: 'v-rest-121', organization_id: OTRA, name: 'Restaurantes', slug: 'restaurantes', sort_order: 0, is_active: true },
      ],
      organization_currencies: [{ organization_id: ORG, currency_code: 'COP', is_base: true }],
      currency_rates: [
        { code: 'COP', base_currency_code: 'USD', rate: 4000, rate_date: '2026-09-01' },
        { code: 'COP', base_currency_code: 'USD', rate: 9999, rate_date: '2999-01-01' },
      ],
      crm_excluded_numbers: [
        { organization_id: ORG, phone_e164: '+573007778899' },
        { organization_id: OTRA, phone_e164: '+573009990001' },
      ],
    },
  };
}

const filas: FilaLeadEntrada[] = [
  { fila: 2, campos: { idExterno: 'S-1', nombre: 'Nuevo Uno', razonSocial: 'Nuevo Uno S.A.S.', nit: `${NIT}-${DV}`, telefono: '300 999 0001', ciudad: 'Tunja', sector: 'Restaurante/bar', prioridad: 'A', valor: '600', plan: 'Pro' }, fuente: ['https://fuente.example/uno'] },
  { fila: 3, campos: { idExterno: 'S-2', nombre: 'Repetido', telefono: '+57 300 999 0001' } },
  { fila: 4, campos: { idExterno: 'S-3', nombre: 'Tiene Lead', telefono: '3001112233' } },
  { fila: 5, campos: { idExterno: 'S-4', nombre: 'Sin Lead', correo: 'existe@sintetico.co' } },
  { fila: 6, campos: { idExterno: 'S-5', nombre: 'Solo En Otra Org', telefono: '3004445566' } },
  { fila: 7, campos: { idExterno: 'S-6', nombre: 'Excluido RNE', telefono: '3007778899' } },
  { fila: 8, campos: { idExterno: 'S-7', nombre: 'Sin Contacto' } },
];

const OPC: OpcionesImportacionLeads = { lote: 'lote_sintetico', tipoCliente: 'company', monedaValor: 'USD', pais: 'CO', archivo: 'sintetico.xlsx' };

let db: Db;
const ctx = () => ({ organizationId: ORG, userId: 'u-200', supabase: fake(db) });
const inserts = (table: string) => db.writes.filter((w) => w.table === table && w.op === 'insert').map((w) => w.payload as Row);
const updates = (table: string) => db.writes.filter((w) => w.table === table && w.op === 'update').map((w) => w.payload as Row);

beforeEach(() => {
  db = semilla();
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('validarImportacion (vista previa)', () => {
  it('decide cada fila y NO escribe nada', async () => {
    const r = await validarImportacion(ctx(), filas, OPC);
    expect(r.resultados.map((x) => [x.fila, x.accion, x.motivo ?? null])).toEqual([
      [2, 'crear', null],
      [3, 'omitir', 'duplicado_archivo'],
      [4, 'omitir', 'lead_abierto'],
      [5, 'ligar', null],
      [6, 'crear', null],
      [7, 'crear', null],
      [8, 'error', null],
    ]);
    expect(r.resultados[1].duplicadaDe).toBe(2);
    expect(r.resultados[3].cliente).toEqual({ id: 'c-sin-lead', nombre: 'Cliente Sin Lead', por: 'correo' });
    expect(r.resultados[5].avisos.map((a) => a.codigo)).toContain('rne_excluido');
    expect(r.resumen).toEqual({ total: 7, crear: 3, ligar: 1, omitir: 2, error: 1, rnePendiente: 3, rneExcluido: 1 });
    expect(r.moneda).toMatchObject({ moneda: 'COP', origen: 'USD', tasa: 4000, fechaTasa: '2026-09-01', sinTasa: false });
    expect(db.writes).toEqual([]);
  });

  it('toda lectura de clientes, leads, verticales y excluidos va filtrada por la organización de la sesión', async () => {
    await validarImportacion(ctx(), filas, OPC);
    const porOrg = db.queries.filter((q) => ['customers', 'opportunities', 'verticals', 'crm_excluded_numbers', 'organization_currencies'].includes(q.table));
    expect(porOrg.length).toBeGreaterThan(0);
    for (const q of porOrg) expect(q.filtros).toContainEqual({ k: 'eq', col: 'organization_id', v: ORG });
  });
});

describe('importarBloque', () => {
  it('crea la ficha lead, marca como lead al existente sin tocar su ficha y respeta omitidos y errores', async () => {
    const r = await importarBloque(ctx(), filas, OPC);
    expect(r.resultados.map((x) => [x.fila, x.accion])).toEqual([[2, 'crear'], [3, 'omitir'], [4, 'omitir'], [5, 'ligar'], [6, 'crear'], [7, 'crear'], [8, 'error']]);

    const clientes = inserts('customers');
    expect(clientes).toHaveLength(3);
    expect(clientes[0]).toMatchObject({
      organization_id: ORG,
      customer_type: 'company',
      company_name: 'Nuevo Uno S.A.S.',
      trade_name: 'Nuevo Uno',
      identification_type: 'NIT',
      identification_number: NIT,
      dv: DV,
      phone: '+573009990001',
      city: 'Tunja',
      lifecycle_stage: 'lead',
      vertical_id: 'v-rest',
      timezone: 'America/Bogota',
    });
    expect(clientes[0]).not.toHaveProperty('do_not_call');
    expect(clientes[0].tags).toEqual(expect.arrayContaining(['Restaurante/bar', 'prioridad:A', 'lote:lote_sintetico', 'rne:pendiente']));
    expect((clientes[0].metadata as { importacion: Row }).importacion).toMatchObject({
      lote: 'lote_sintetico', id_externo: 'S-1', fila: 2, rne: 'pendiente', importado_por: 'u-200', fuentes: ['https://fuente.example/uno'],
      valor_original: { monto: 600, moneda: 'USD', tasa: 4000, fecha_tasa: '2026-09-01' },
    });
    // El número excluido queda marcado como tal (y el de la 121 no «contamina» a la 120).
    expect((clientes[2].metadata as { importacion: Row }).importacion.rne).toBe('excluido');
    expect((clientes[1].metadata as { importacion: Row }).importacion.rne).toBe('pendiente');

    // D2: ninguna oportunidad; el lead se escribe en la ficha.
    expect(inserts('opportunities')).toEqual([]);
    const fichas = updates('customers').filter((u) => 'lead_source' in u);
    expect(fichas).toHaveLength(4);
    expect(fichas[0]).toMatchObject({ lead_source: 'import', owner_id: null });
    expect((fichas[0].metadata as { lead: Row }).lead).toMatchObject({
      titulo: 'Nuevo Uno · Tunja',
      valor_estimado: { monto: 2400000, moneda: 'COP' },
      origen_texto: 'import',
      importacion: expect.objectContaining({ lote: 'lote_sintetico', id_externo: 'S-1', rne: 'pendiente', plan_probable: 'Pro' }),
    });
    // La prioridad A del archivo es la banda ICP de respaldo (sin perfiles ICP no hay score).
    expect(updates('customers')).toContainEqual({ icp_band: 'A' });
    // Cliente existente («ligar»): solo origen, responsable y metadata.lead; ni etiquetas ni do_not_call.
    const ligado = db.t.customers.find((c) => c.id === 'c-sin-lead')!;
    expect(ligado).toMatchObject({ lead_source: 'import' });
    expect(ligado).not.toHaveProperty('lifecycle_stage'); // no se toca su etapa
    expect(ligado).not.toHaveProperty('tags');
    expect(ligado).not.toHaveProperty('do_not_call');
    expect((ligado.metadata as { lead: Row }).lead).toMatchObject({ titulo: 'Sin Lead' });
    expect(r.resumen).toMatchObject({ crear: 3, ligar: 1, omitir: 2, error: 1 });
  });

  it('idempotente: reimportar el mismo bloque no escribe nada', async () => {
    await importarBloque(ctx(), filas, OPC);
    const antes = db.writes.length;
    const r = await importarBloque(ctx(), filas, OPC);
    expect(db.writes.length).toBe(antes);
    expect(r.resultados.map((x) => [x.fila, x.accion, x.motivo ?? null])).toEqual([
      [2, 'omitir', 'ya_importado'],
      [3, 'omitir', 'duplicado_archivo'],
      [4, 'omitir', 'lead_abierto'],
      [5, 'omitir', 'lead_abierto'],
      [6, 'omitir', 'ya_importado'],
      [7, 'omitir', 'ya_importado'],
      [8, 'error', null],
    ]);
  });

  it('sin id externo, un reintento se detecta por teléfono (lead abierto)', async () => {
    const sinId = filas.slice(0, 1).map((f) => ({ ...f, campos: { ...f.campos, idExterno: undefined } }));
    await importarBloque(ctx(), sinId, OPC);
    const r = await importarBloque(ctx(), sinId, OPC);
    expect(r.resultados[0]).toMatchObject({ accion: 'omitir', motivo: 'lead_abierto', cliente: { por: 'telefono' } });
    expect(inserts('customers')).toHaveLength(1);
  });

  it('si el alta del lead falla, la ficha recién creada se revierte y la fila queda con error', async () => {
    const original = fake(db);
    const conFallo = {
      from: (t: string) => {
        const c = original.from(t) as unknown as Record<string, unknown>;
        if (t !== 'customers') return c;
        const update = c.update as (p: unknown) => Record<string, unknown>;
        c.update = (p: unknown) => {
          const ch = update(p);
          ch.single = async () => ({ data: null, error: { message: 'fallo sintético' } });
          return ch;
        };
        return c;
      },
    } as unknown as SupabaseClient;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await importarBloque({ organizationId: ORG, userId: 'u-200', supabase: conFallo }, filas.slice(0, 1), OPC);
    expect(r.resultados[0]).toMatchObject({ accion: 'error', errores: [{ codigo: 'error_bd' }] });
    expect(db.writes.filter((w) => w.table === 'customers' && w.op === 'delete')).toHaveLength(1);
  });

  it('moneda: si la organización maneja la moneda del archivo, se guarda tal cual', async () => {
    db.t.organization_currencies.push({ organization_id: ORG, currency_code: 'USD', is_base: false });
    await importarBloque(ctx(), filas.slice(0, 1), OPC);
    const ficha = updates('customers').find((u) => 'lead_source' in u)!;
    expect((ficha.metadata as { lead: Row }).lead).toMatchObject({ valor_estimado: { monto: 600, moneda: 'USD' } });
  });
});

// Fixtures históricas del transporte heredado; los contratos RPC se verifican por separado.
beforeEach(() => { process.env.CRM_CALL_ATOMIC_RPC_ENABLED = 'false'; });
afterAll(() => { delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED; });
