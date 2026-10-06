/**
 * Lecturas de oportunidades para las pantallas de la ola 3B (plan §4.2 y
 * §4.4): lista paginada y filtrada en el servidor, y el resumen (conteos por
 * estado, KPI por moneda, totales por etapa y tasas de cambio) que alimenta
 * `KpiMoneda`, las pestañas de Oportunidades y el encabezado de cada columna
 * del kanban. La organización sale SIEMPRE de la sesión.
 *
 * Columnas verificadas por MCP el 2026-09-30 (`opportunities`, `stages`,
 * `exchange_rates`, `opportunity_stage_history`, `customers.full_name`).
 *
 * Rendimiento (organizaciones grandes): la lista pagina en la base (≤ 100 por
 * página, `count: exact`); el resumen lee solo 7 columnas estrechas en
 * páginas de 1000 hasta `TOPE_RESUMEN` filas y avisa `truncado` si lo supera.
 * El navegador nunca recibe más que la página que pinta.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveOrgCurrency } from '@/lib/services/monedaOrganizacion';
import { UUID_RE, type CrmSesion } from './crmRouteSupport';

export const ESTADOS = ['open', 'won', 'lost'] as const;
export const TEMPERATURAS = ['cold', 'warm', 'hot'] as const;
export const ORDENES = { creada: 'created_at', cierre: 'expected_close_date', monto: 'amount', proximo: 'next_contact_at', nombre: 'name' } as const;
export type OrdenLista = keyof typeof ORDENES;
export const TOPE_RESUMEN = 20_000;
const PAGINA_RESUMEN = 1000;

export interface FiltrosOportunidades {
  status?: (typeof ESTADOS)[number];
  record_type?: 'lead' | 'deal';
  pipeline_id?: string;
  stage_id?: string;
  salesperson_id?: string;
  sin_responsable?: boolean;
  customer_id?: string;
  temperaturas?: (typeof TEMPERATURAS)[number][];
  /** `date` (YYYY-MM-DD) del cierre esperado, en el día de la organización. */
  cierre_desde?: string;
  cierre_hasta?: string;
  q?: string;
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const uuidDe = (v: string | null) => (v && UUID_RE.test(v) ? v : undefined);

/** Query string → filtros válidos (lo inválido se ignora; nunca se confía en el cliente). */
export function filtrosDesdeQuery(sp: URLSearchParams): FiltrosOportunidades {
  const status = sp.get('status');
  const recordType = sp.get('record_type');
  const temperaturas = (sp.get('temperature') ?? '')
    .split(',')
    .filter((t): t is (typeof TEMPERATURAS)[number] => (TEMPERATURAS as readonly string[]).includes(t));
  const desde = sp.get('close_from');
  const hasta = sp.get('close_to');
  const q = sp.get('q')?.trim();
  return {
    status: (ESTADOS as readonly string[]).includes(status ?? '') ? (status as FiltrosOportunidades['status']) : undefined,
    record_type: recordType === 'lead' || recordType === 'deal' ? recordType : undefined,
    pipeline_id: uuidDe(sp.get('pipeline_id')),
    stage_id: uuidDe(sp.get('stage_id')),
    salesperson_id: uuidDe(sp.get('salesperson_id')),
    sin_responsable: sp.get('salesperson_id') === 'none' || undefined,
    customer_id: uuidDe(sp.get('customer_id')),
    temperaturas: temperaturas.length ? temperaturas : undefined,
    cierre_desde: desde && FECHA_RE.test(desde) ? desde : undefined,
    cierre_hasta: hasta && FECHA_RE.test(hasta) ? hasta : undefined,
    q: q ? q.slice(0, 100) : undefined,
  };
}

/** Texto seguro para `ilike` y para una lista `or()` de PostgREST. */
export function textoBusqueda(q: string): string {
  return q.replace(/[,()]/g, ' ').replace(/[\\%_]/g, (c) => `\\${c}`).trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- el constructor de PostgREST no tiene un tipo común exportable
type Consulta = any;

/** Clientes de la organización cuyo nombre coincide (para buscar «por cliente»). */
async function clientesQueCoinciden(ctx: CrmSesion, q: string): Promise<string[]> {
  const { data, error } = await ctx.supabase
    .from('customers')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .ilike('full_name', `%${textoBusqueda(q)}%`)
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as { id: string }[]).map((c) => c.id);
}

/**
 * Aplica los filtros. Devuelve `{ q }` y no el constructor: el constructor de
 * PostgREST es «thenable» y una función `async` que lo devolviera lo
 * EJECUTARÍA al resolverse (sin orden ni rango).
 */
async function aplicarFiltros(ctx: CrmSesion, consulta: Consulta, f: FiltrosOportunidades, conEstado: boolean): Promise<{ q: Consulta }> {
  let q = consulta.eq('organization_id', ctx.organizationId);
  if (conEstado && f.status) q = q.eq('status', f.status);
  if (f.record_type) q = q.eq('record_type', f.record_type);
  if (f.pipeline_id) q = q.eq('pipeline_id', f.pipeline_id);
  if (f.stage_id) q = q.eq('stage_id', f.stage_id);
  if (f.salesperson_id) q = q.eq('salesperson_id', f.salesperson_id);
  else if (f.sin_responsable) q = q.is('salesperson_id', null);
  if (f.customer_id) q = q.eq('customer_id', f.customer_id);
  if (f.temperaturas) q = q.in('temperature', f.temperaturas);
  if (f.cierre_desde) q = q.gte('expected_close_date', f.cierre_desde);
  if (f.cierre_hasta) q = q.lte('expected_close_date', f.cierre_hasta);
  if (f.q) {
    const texto = textoBusqueda(f.q);
    const clientes = await clientesQueCoinciden(ctx, f.q);
    q = clientes.length ? q.or(`name.ilike.%${texto}%,customer_id.in.(${clientes.join(',')})`) : q.ilike('name', `%${texto}%`);
  }
  return { q };
}

const COLUMNAS_LISTA =
  'id, name, customer_id, pipeline_id, stage_id, amount, currency, status, record_type, source, temperature, score_total, icp_band, salesperson_id, created_by, expected_close_date, next_contact_at, next_action, last_contact_at, contact_channel, loss_reason_value, closed_at, created_at, updated_at, cliente:customers(full_name, phone, email, do_not_call), etapa:stages(name, probability, color, position, is_won, is_lost)';

export interface OpcionesLista {
  page: number;
  limit: number;
  orden: OrdenLista;
  ascendente: boolean;
}

export function opcionesDesdeQuery(sp: URLSearchParams): OpcionesLista {
  const limit = Math.min(Math.max(Number.parseInt(sp.get('limit') ?? '25', 10) || 25, 1), 100);
  const page = Math.max(Number.parseInt(sp.get('page') ?? '1', 10) || 1, 1);
  const orden = (sp.get('sort') ?? 'creada') as OrdenLista;
  return { page, limit, orden: orden in ORDENES ? orden : 'creada', ascendente: sp.get('dir') === 'asc' };
}

type FilaApi = Record<string, unknown> & { id: string; record_type?: string; cliente?: { full_name?: string | null } | null };

/** Última entrada a la etapa de cada oportunidad de la página (días en etapa). */
async function entradasEtapa(ctx: CrmSesion, ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (!ids.length) return mapa;
  const { data, error } = await ctx.supabase
    .from('opportunity_stage_history')
    .select('opportunity_id, changed_at')
    .eq('organization_id', ctx.organizationId)
    .in('opportunity_id', ids)
    .order('changed_at', { ascending: false })
    .limit(1000);
  if (error) throw error;
  for (const h of (data ?? []) as { opportunity_id: string; changed_at: string | null }[]) {
    if (h.changed_at && !mapa.has(h.opportunity_id)) mapa.set(h.opportunity_id, h.changed_at);
  }
  return mapa;
}

export async function listarOportunidades(ctx: CrmSesion, f: FiltrosOportunidades, o: OpcionesLista) {
  let { q } = await aplicarFiltros(ctx, ctx.supabase.from('opportunities').select(COLUMNAS_LISTA, { count: 'exact' }), f, true);
  const desde = (o.page - 1) * o.limit;
  q = q.order(ORDENES[o.orden], { ascending: o.ascendente, nullsFirst: false }).order('id', { ascending: true }).range(desde, desde + o.limit - 1);
  const { data, error, count } = await q;
  if (error) throw error;
  const filas = (data ?? []) as FilaApi[];
  const entradas = await entradasEtapa(ctx, filas.map((r) => r.id));
  return {
    filas: filas.map((r) => ({
      ...r,
      cliente_nombre: r.cliente?.full_name ?? null,
      entro_etapa_en: entradas.get(r.id) ?? (r.created_at as string | null) ?? null,
      es_lead: r.record_type === 'lead',
    })),
    total: count ?? filas.length,
  };
}

export interface GrupoMonedaApi {
  moneda: string;
  monto: number;
  cantidad: number;
  /** Solo abiertas: monto × probabilidad de la etapa. */
  ponderado?: number;
}

export interface ResumenOportunidadesApi {
  conteos: { open: number; won: number; lost: number; total: number };
  abiertas: GrupoMonedaApi[];
  por_etapa: Record<string, { cantidad: number; grupos: GrupoMonedaApi[] }>;
  cierran_periodo: number | null;
  ganadas_90: number;
  perdidas_90: number;
  tasas: { base_currency: string; target_currency: string; rate: number; effective_date: string }[];
  truncado: boolean;
}

interface FilaResumen {
  status: string | null;
  stage_id: string;
  amount: number | string | null;
  currency: string | null;
  expected_close_date: string | null;
  closed_at: string | null;
  etapa?: { probability?: number | null } | null;
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

function sumar(grupos: Map<string, GrupoMonedaApi>, moneda: string, monto: number, ponderado?: number) {
  const g = grupos.get(moneda) ?? { moneda, monto: 0, cantidad: 0, ...(ponderado !== undefined ? { ponderado: 0 } : {}) };
  g.monto += monto;
  g.cantidad += 1;
  if (ponderado !== undefined) g.ponderado = (g.ponderado ?? 0) + ponderado;
  grupos.set(moneda, g);
}

/**
 * Agrega en memoria filas ya filtradas (pura; la prueba la usa directo).
 * `periodo` = días `date` del periodo de cierre (el mes de la organización);
 * `desde90` = instante de hace 90 días (tasa de cierre).
 */
export function agregarResumen(filas: readonly FilaResumen[], base: string, periodo: { desde: string; hasta: string } | null, desde90: string | null) {
  const conteos = { open: 0, won: 0, lost: 0, total: filas.length };
  const abiertas = new Map<string, GrupoMonedaApi>();
  const porEtapa = new Map<string, Map<string, GrupoMonedaApi>>();
  let cierran = 0;
  let ganadas90 = 0;
  let perdidas90 = 0;
  for (const r of filas) {
    const estado = r.status === 'won' || r.status === 'lost' ? r.status : 'open';
    conteos[estado] += 1;
    const moneda = (r.currency ?? '').trim().toUpperCase() || base;
    const monto = num(r.amount);
    const etapa = porEtapa.get(r.stage_id) ?? new Map<string, GrupoMonedaApi>();
    sumar(etapa, moneda, monto);
    porEtapa.set(r.stage_id, etapa);
    if (estado === 'open') {
      const prob = Math.min(100, Math.max(0, num(r.etapa?.probability)));
      sumar(abiertas, moneda, monto, (monto * prob) / 100);
      if (periodo && r.expected_close_date && r.expected_close_date >= periodo.desde && r.expected_close_date <= periodo.hasta) cierran += 1;
    } else if (desde90 && r.closed_at && r.closed_at >= desde90) {
      if (estado === 'won') ganadas90 += 1;
      else perdidas90 += 1;
    }
  }
  const por_etapa: ResumenOportunidadesApi['por_etapa'] = {};
  porEtapa.forEach((grupos, id) => {
    const lista = [...grupos.values()];
    por_etapa[id] = { cantidad: lista.reduce((s, g) => s + g.cantidad, 0), grupos: lista };
  });
  return { conteos, abiertas: [...abiertas.values()], por_etapa, cierran_periodo: periodo ? cierran : null, ganadas_90: ganadas90, perdidas_90: perdidas90 };
}

async function tasasDe(ctx: CrmSesion, monedas: string[], hasta: string | null) {
  if (!monedas.length) return [];
  let q = ctx.supabase
    .from('exchange_rates')
    .select('base_currency, target_currency, rate, effective_date')
    .eq('organization_id', ctx.organizationId)
    .or(`base_currency.in.(${monedas.join(',')}),target_currency.in.(${monedas.join(',')})`);
  if (hasta) q = q.lte('effective_date', hasta);
  const { data, error } = await q.order('effective_date', { ascending: false }).limit(200);
  if (error) throw error;
  return ((data ?? []) as ResumenOportunidadesApi['tasas']).map((t) => ({ ...t, base_currency: String(t.base_currency).trim(), target_currency: String(t.target_currency).trim(), rate: num(t.rate) }));
}

/** Moneda base de la organización de la sesión (nunca cableada; la resuelve el servicio único). */
export async function monedaBaseDe(ctx: CrmSesion): Promise<string> {
  return (await resolveOrgCurrency(ctx.supabase as SupabaseClient, ctx.organizationId)).code;
}

export async function resumenOportunidades(
  ctx: CrmSesion,
  f: FiltrosOportunidades,
  opciones: { base: string; periodo: { desde: string; hasta: string } | null; desde90: string | null; hoy: string | null },
): Promise<ResumenOportunidadesApi & { base: string }> {
  const filas: FilaResumen[] = [];
  let truncado = false;
  for (let desde = 0; ; desde += PAGINA_RESUMEN) {
    const { q } = await aplicarFiltros(ctx, ctx.supabase.from('opportunities').select('status, stage_id, amount, currency, expected_close_date, closed_at, etapa:stages(probability)'), f, false);
    const { data, error } = await q.order('id', { ascending: true }).range(desde, desde + PAGINA_RESUMEN - 1);
    if (error) throw error;
    const pagina = (data ?? []) as FilaResumen[];
    filas.push(...pagina);
    if (pagina.length < PAGINA_RESUMEN) break;
    if (filas.length >= TOPE_RESUMEN) {
      truncado = true;
      break;
    }
  }
  const agregado = agregarResumen(filas, opciones.base, opciones.periodo, opciones.desde90);
  const monedas = [...new Set(filas.map((r) => (r.currency ?? '').trim().toUpperCase()).filter((m) => /^[A-Z]{3}$/.test(m) && m !== opciones.base))];
  const tasas = await tasasDe(ctx, monedas.length ? [...monedas, opciones.base] : [], opciones.hoy);
  return { ...agregado, tasas, truncado, base: opciones.base };
}

// ─── Abiertas por pipeline (selector de embudo) ─────────────────────────────

export interface AbiertasPipelineApi {
  cantidad: number;
  grupos: GrupoMonedaApi[];
}

export interface ResumenPipelinesApi {
  base: string;
  /** pipeline_id → abiertas (cantidad y monto por moneda). Un pipeline sin abiertas no aparece. */
  por_pipeline: Record<string, AbiertasPipelineApi>;
  tasas: ResumenOportunidadesApi['tasas'];
  truncado: boolean;
}

/** Agrupa filas abiertas por pipeline y moneda (pura; la prueba la usa directo). */
export function agregarAbiertasPorPipeline(
  filas: readonly { pipeline_id: string; amount: number | string | null; currency: string | null }[],
  base: string,
): Record<string, AbiertasPipelineApi> {
  const mapa = new Map<string, Map<string, GrupoMonedaApi>>();
  for (const r of filas) {
    const grupos = mapa.get(r.pipeline_id) ?? new Map<string, GrupoMonedaApi>();
    sumar(grupos, (r.currency ?? '').trim().toUpperCase() || base, num(r.amount));
    mapa.set(r.pipeline_id, grupos);
  }
  const salida: Record<string, AbiertasPipelineApi> = {};
  mapa.forEach((grupos, id) => {
    const lista = [...grupos.values()];
    salida[id] = { cantidad: lista.reduce((s, g) => s + g.cantidad, 0), grupos: lista };
  });
  return salida;
}

/**
 * «N abiertas · $ monto» de cada pipeline de la organización (Figma 1821:189325,
 * hoja «Embudos» y selector de escritorio). Lee 3 columnas de las abiertas en
 * páginas de 1000 hasta `TOPE_RESUMEN`, igual que el resumen del tablero; el
 * monto se convierte a la base en la interfaz con las tasas que se devuelven.
 */
export async function resumenAbiertasPorPipeline(ctx: CrmSesion, opciones: { base: string; hoy: string | null }): Promise<ResumenPipelinesApi> {
  const filas: { pipeline_id: string; amount: number | string | null; currency: string | null }[] = [];
  let truncado = false;
  for (let desde = 0; ; desde += PAGINA_RESUMEN) {
    const { data, error } = await ctx.supabase
      .from('opportunities')
      .select('pipeline_id, amount, currency')
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'open')
      .order('id', { ascending: true })
      .range(desde, desde + PAGINA_RESUMEN - 1);
    if (error) throw error;
    const pagina = (data ?? []) as typeof filas;
    filas.push(...pagina);
    if (pagina.length < PAGINA_RESUMEN) break;
    if (filas.length >= TOPE_RESUMEN) {
      truncado = true;
      break;
    }
  }
  const monedas = [...new Set(filas.map((r) => (r.currency ?? '').trim().toUpperCase()).filter((m) => /^[A-Z]{3}$/.test(m) && m !== opciones.base))];
  const tasas = await tasasDe(ctx, monedas.length ? [...monedas, opciones.base] : [], opciones.hoy);
  return { base: opciones.base, por_pipeline: agregarAbiertasPorPipeline(filas, opciones.base), tasas, truncado };
}

/** Parámetros de periodo del resumen (`period_from`/`period_to` `date`, `since` instante). */
export function periodoDesdeQuery(sp: URLSearchParams) {
  const desde = sp.get('period_from');
  const hasta = sp.get('period_to');
  const since = sp.get('since');
  const hoy = sp.get('today');
  return {
    periodo: desde && hasta && FECHA_RE.test(desde) && FECHA_RE.test(hasta) ? { desde, hasta } : null,
    desde90: since && !Number.isNaN(Date.parse(since)) ? new Date(since).toISOString() : null,
    hoy: hoy && FECHA_RE.test(hoy) ? hoy : null,
  };
}
