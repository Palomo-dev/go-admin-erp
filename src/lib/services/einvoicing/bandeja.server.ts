/**
 * Lecturas de la bandeja de envíos a la DIAN, en el servidor: listado con
 * filtros (vista, estado, tipo, búsqueda, periodo, sucursal), KPIs contados en
 * la base (antes se bajaban todos los envíos al navegador) y el detalle de un
 * envío con su línea de tiempo. SOLO LECTURA: reintentar, cancelar y liberar
 * siguen en `/api/factus/jobs` y `/api/factus/config`, y la emisión en
 * `colaFacturacion.server.ts`, sin cambios.
 *
 * Lee con el cliente de la sesión (`ctx.supabase`, RLS de solo lectura de la
 * cola) y siempre filtra por la organización de la sesión.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { buscarClientes } from '@/lib/services/customers/busquedaClientesService';
import { nextPlainDay, startOfDayInstant, todayInTz } from '@/lib/utils/dateCore';
import {
  diaValido,
  esEstadoEnvio,
  esTipoDocumento,
  esVista,
  filtrosEstado,
  filtrosVista,
  inicioMes,
  limpiarBusqueda,
  normalizarJob,
  type ConteosBandeja,
  type EstadoEnvio,
  type EventoCrudo,
  type FilaEnvio,
  type FiltroCola,
  type JobCrudo,
  type ProveedorBandeja,
  type TipoDocumentoFe,
  type Vista,
} from '@/lib/finanzas/facturacionElectronica/bandejaLogica';

export const SELECT_JOB = `
  *,
  invoice:invoice_sales(
    id,
    number,
    total,
    currency,
    branch_id,
    issue_date,
    customer_id,
    customer:customers(first_name, last_name, company_name, full_name, doc_number)
  ),
  support_document:support_documents(id, number, reference_code, total, currency, branch_id, issue_date, supplier_id)
`;

/** Constructor de consulta de PostgREST, tipado lo justo para aplicar filtros. */
interface Consulta {
  eq(col: string, val: unknown): Consulta;
  in(col: string, val: readonly unknown[]): Consulta;
  is(col: string, val: null): Consulta;
  not(col: string, op: string, val: unknown): Consulta;
  gt(col: string, val: unknown): Consulta;
  gte(col: string, val: unknown): Consulta;
  lt(col: string, val: unknown): Consulta;
  or(filtro: string): Consulta;
}

export function aplicarFiltros<Q>(q: Q, filtros: readonly FiltroCola[]): Q {
  let c = q as unknown as Consulta;
  for (const f of filtros) {
    if (f.op === 'eq') c = c.eq(f.col, f.val);
    else if (f.op === 'in') c = c.in(f.col, f.val);
    else if (f.op === 'is_null') c = c.is(f.col, null);
    else if (f.op === 'not_null') c = c.not(f.col, 'is', null);
    else if (f.op === 'gt') c = c.gt(f.col, f.val);
    else if (f.op === 'or') c = c.or(f.val);
  }
  return c as unknown as Q;
}

export interface ParametrosListado {
  vista: Vista;
  estado: EstadoEnvio | null;
  /** Estado crudo de la cola (`?status=`), como antes. */
  estadoCola: string | null;
  tipo: TipoDocumentoFe | null;
  q: string | null;
  desde: string | null;
  hasta: string | null;
  sucursal: number | null;
  limit: number;
  offset: number;
}

/**
 * Documentos de la organización que coinciden con la búsqueda o la sucursal.
 * null = sin restricción; [] = ninguno coincide.
 */
async function documentosCandidatos(
  db: SupabaseClient,
  org: number,
  q: string | null,
  sucursal: number | null,
): Promise<{ facturas: string[]; soportes: string[] } | null> {
  if (!q && sucursal === null) return null;

  // Clientes por la búsqueda única (RPC fn_clientes_buscar): el texto viaja como
  // parámetro, nunca interpolado en un `.or()` sobre columnas de clientes.
  let clientes: string[] = [];
  if (q) {
    try {
      const r = await buscarClientes(db, { organizationId: org, texto: q, limite: 100 });
      clientes = r.filas.map((c) => c.id);
    } catch {
      clientes = [];
    }
  }

  let facturas = db.from('invoice_sales').select('id').eq('organization_id', org);
  if (sucursal !== null) facturas = facturas.eq('branch_id', sucursal);
  if (q) facturas = facturas.or([`number.ilike.%${q}%`, ...(clientes.length ? [`customer_id.in.(${clientes.join(',')})`] : [])].join(','));
  let soportes = db.from('support_documents').select('id').eq('organization_id', org);
  if (sucursal !== null) soportes = soportes.eq('branch_id', sucursal);
  if (q) soportes = soportes.or(`number.ilike.%${q}%,reference_code.ilike.%${q}%`);

  const [f, s] = await Promise.all([facturas.limit(300), soportes.limit(300)]);
  return {
    facturas: ((f.data ?? []) as Array<{ id: string }>).map((x) => x.id),
    soportes: ((s.data ?? []) as Array<{ id: string }>).map((x) => x.id),
  };
}

async function proveedoresDe(db: SupabaseClient, org: number, filas: readonly JobCrudo[]): Promise<Map<number, ProveedorBandeja>> {
  const ids = new Set<number>();
  for (const j of filas) {
    const s = Array.isArray(j.support_document) ? j.support_document[0] : j.support_document;
    if (s?.supplier_id != null) ids.add(Number(s.supplier_id));
  }
  if (ids.size === 0) return new Map();
  const { data } = await db.from('suppliers').select('id, name, nit').eq('organization_id', org).in('id', Array.from(ids));
  return new Map(((data ?? []) as Array<{ id: number; name: string | null; nit: string | null }>).map((p) => [Number(p.id), { nombre: p.name, nit: p.nit }]));
}

export interface ResultadoListado {
  data: JobCrudo[];
  filas: FilaEnvio[];
  total: number;
}

export async function listarEnvios(db: SupabaseClient, org: number, p: ParametrosListado): Promise<ResultadoListado> {
  const candidatos = await documentosCandidatos(db, org, p.q, p.sucursal);
  const porCufe = p.q && p.sucursal === null ? `cufe.ilike.%${p.q}%` : null;
  if (candidatos && candidatos.facturas.length === 0 && candidatos.soportes.length === 0 && !porCufe) {
    return { data: [], filas: [], total: 0 };
  }

  let query = db
    .from('electronic_invoicing_jobs')
    .select(SELECT_JOB, { count: 'exact' })
    .eq('organization_id', org)
    .order('created_at', { ascending: false })
    .range(p.offset, p.offset + p.limit - 1);

  if (p.estadoCola && p.estadoCola !== 'all') query = query.eq('status', p.estadoCola);
  query = aplicarFiltros(query, filtrosVista(p.vista));
  if (p.estado) query = aplicarFiltros(query, filtrosEstado(p.estado));
  if (p.tipo) query = query.eq('document_type', p.tipo);

  if (p.desde || p.hasta) {
    const tz = await getOrganizationTimezone(org, db);
    if (p.desde) query = query.gte('created_at', startOfDayInstant(p.desde, tz).toISOString());
    if (p.hasta) query = query.lt('created_at', startOfDayInstant(nextPlainDay(p.hasta), tz).toISOString());
  }

  if (candidatos) {
    const partes = [
      ...(candidatos.facturas.length ? [`invoice_id.in.(${candidatos.facturas.join(',')})`] : []),
      ...(candidatos.soportes.length ? [`support_document_id.in.(${candidatos.soportes.join(',')})`] : []),
      ...(porCufe ? [porCufe] : []),
    ];
    query = query.or(partes.join(','));
  }

  const { data, error, count } = await query;
  if (error) throw error;
  const crudos = (data ?? []) as unknown as JobCrudo[];
  const proveedores = await proveedoresDe(db, org, crudos);
  return { data: crudos, filas: crudos.map((j) => normalizarJob(j, proveedores)), total: count ?? 0 };
}

/** Lee los parámetros de la URL (los viejos `status`, `limit`, `offset` siguen valiendo). */
export function leerParametros(sp: URLSearchParams): ParametrosListado {
  const tamano = sp.get('tamano');
  const pagina = sp.get('pagina');
  const limit = Math.min(200, Math.max(1, parseInt(tamano ?? sp.get('limit') ?? '50', 10) || 50));
  const offset = pagina ? (Math.max(1, parseInt(pagina, 10) || 1) - 1) * limit : Math.max(0, parseInt(sp.get('offset') ?? '0', 10) || 0);
  const sucursal = Number(sp.get('sucursal'));
  const vista = sp.get('vista');
  const estado = sp.get('estado');
  const tipo = sp.get('tipo');
  return {
    vista: esVista(vista) ? vista : 'todos',
    estado: esEstadoEnvio(estado) ? estado : null,
    estadoCola: sp.get('status'),
    tipo: esTipoDocumento(tipo) ? tipo : null,
    q: limpiarBusqueda(sp.get('q')),
    desde: diaValido(sp.get('desde')),
    hasta: diaValido(sp.get('hasta')),
    sucursal: Number.isInteger(sucursal) && sucursal > 0 ? sucursal : null,
    limit,
    offset,
  };
}

// ── KPIs ──────────────────────────────────────────────────────────────────────

async function contar(db: SupabaseClient, org: number, filtros: readonly FiltroCola[], extra?: (q: Consulta) => Consulta): Promise<number> {
  let q = db.from('electronic_invoicing_jobs').select('id', { count: 'exact', head: true }).eq('organization_id', org);
  q = aplicarFiltros(q, filtros);
  if (extra) q = extra(q as unknown as Consulta) as unknown as typeof q;
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export async function resumenBandeja(db: SupabaseClient, org: number): Promise<{ conteos: ConteosBandeja; mes: string }> {
  const tz = await getOrganizationTimezone(org, db);
  const hoy = todayInTz(tz);
  const mes = inicioMes(hoy);
  const desdeMes = startOfDayInstant(mes, tz).toISOString();
  const enMes = (col: string) => (q: Consulta) => q.gte(col, desdeMes);

  const [enColaPend, enVuelo, retenidos, aceptadosMes, rechazadosMes, erroresMes, rechazados, fallidos, reintento, todos, atender, aceptados] =
    await Promise.all([
      contar(db, org, filtrosEstado('en_cola')),
      contar(db, org, [{ op: 'in', col: 'status', val: ['processing', 'sent'] }]),
      contar(db, org, filtrosEstado('retenido')),
      contar(db, org, filtrosEstado('aceptado'), enMes('processed_at')),
      contar(db, org, filtrosEstado('rechazado'), enMes('updated_at')),
      contar(db, org, filtrosEstado('error'), enMes('updated_at')),
      contar(db, org, filtrosEstado('rechazado')),
      contar(db, org, filtrosEstado('error')),
      contar(db, org, filtrosEstado('reintento')),
      contar(db, org, filtrosVista('todos')),
      contar(db, org, filtrosVista('atender')),
      contar(db, org, filtrosVista('aceptados')),
    ]);

  return {
    mes,
    conteos: {
      enCola: enColaPend + enVuelo,
      retenidos,
      aceptadosMes,
      rechazadosMes,
      erroresMes,
      rechazados,
      conError: fallidos + reintento,
      todos,
      atender,
      aceptados,
    },
  };
}

// ── Detalle ───────────────────────────────────────────────────────────────────

export async function detalleEnvio(
  db: SupabaseClient,
  org: number,
  id: string,
): Promise<{ fila: FilaEnvio; eventos: EventoCrudo[]; crudo: JobCrudo } | null> {
  const { data, error } = await db.from('electronic_invoicing_jobs').select(SELECT_JOB).eq('id', id).eq('organization_id', org).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const crudo = data as unknown as JobCrudo;
  const [proveedores, eventos] = await Promise.all([
    proveedoresDe(db, org, [crudo]),
    db
      .from('electronic_invoicing_events')
      .select('id, event_type, event_code, event_message, created_at')
      .eq('job_id', id)
      .order('created_at', { ascending: true })
      .limit(50),
  ]);
  return { fila: normalizarJob(crudo, proveedores), eventos: ((eventos.data ?? []) as EventoCrudo[]), crudo };
}
