/**
 * Historial de cajas: consulta con filtros, nombres y máscara del cierre ciego.
 *
 * Una sola implementación con el cliente como parámetro: la usa el servidor
 * (`GET /api/pos/cajas/historial`, cliente de la sesión con RLS) y, sin red en
 * el Desktop, `CajasService` con la réplica local. Antes vivía en
 * `CajasService` y el navegador recibía `difference` y `final_amount` de todas
 * las cajas: con cierre ciego solo se ocultaban al pintar.
 *
 * Con `verImportes = false`:
 * - `final_amount` y `difference` salen `null`;
 * - el filtro «resultado» (faltante/sobrante/cuadrada) y el orden por
 *   diferencia se ignoran: filtrar u ordenar por la cifra la revelaría.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CampoOrdenHistorial, CashHistoryFilters, CashSession, ResultadoCierre } from '@/components/pos/cajas/types';
import { nombreContieneTodas, numeroDeCaja, sanitizarBusqueda } from '@/components/pos/cajas/historialCajas';

type Db = Pick<SupabaseClient, 'from'>;

export interface OpcionesHistorial {
  organizationId: number;
  /** Sucursal del selector: esa más las cajas globales; `null` = todas. */
  sucursalId: number | null;
  verImportes: boolean;
}

/** Filtros efectivos: sin los que dependen de la diferencia cuando está oculta. */
export function filtrosEfectivos(filtros: CashHistoryFilters, verImportes: boolean): CashHistoryFilters {
  if (verImportes) return filtros;
  const { resultado: _r, ...resto } = filtros;
  void _r;
  const orden = filtros.orden?.campo === 'difference' ? undefined : filtros.orden;
  return { ...resto, orden };
}

/**
 * Consulta base. `null` cuando la búsqueda por cajero no encuentra a nadie.
 * Va envuelta en `{ query }`: el builder de PostgREST es «thenable».
 */
export async function consultaHistorial(db: Db, select: string, filtros: CashHistoryFilters, op: OpcionesHistorial, conConteo: boolean) {
  const f = filtrosEfectivos(filtros, op.verImportes);
  let query = db
    .from('cash_sessions')
    .select(select, conConteo ? { count: 'exact' } : undefined)
    .eq('organization_id', op.organizationId);

  if (op.sucursalId) query = query.or(`branch_id.eq.${Number(op.sucursalId)},branch_id.is.null`);
  if (f.status && f.status !== 'all') query = query.eq('status', f.status);
  if (f.desde) query = query.gte('opened_at', f.desde);
  if (f.hasta) query = query.lt('opened_at', f.hasta);

  if (f.resultado === 'faltante') query = query.lte('difference', -0.5);
  else if (f.resultado === 'sobrante') query = query.gte('difference', 0.5);
  else if (f.resultado === 'cuadrada') query = query.gt('difference', -0.5).lt('difference', 0.5);

  const termino = sanitizarBusqueda(f.busqueda);
  if (termino) {
    const numero = numeroDeCaja(termino);
    if (numero !== null) {
      query = query.eq('id', numero);
    } else {
      // Cajero por nombre: cada palabra en nombre o apellido, todas obligatorias.
      const palabras = termino.split(' ').filter(Boolean).slice(0, 3);
      const condiciones = palabras.flatMap((p) => [`first_name.ilike.%${p}%`, `last_name.ilike.%${p}%`]).join(',');
      const { data: perfiles, error } = await db.from('profiles').select('id, first_name, last_name').or(condiciones).limit(200);
      if (error) throw error;
      const ids = ((perfiles ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>)
        .filter((p) => nombreContieneTodas(`${p.first_name ?? ''} ${p.last_name ?? ''}`, palabras))
        .map((p) => p.id);
      if (ids.length === 0) return null;
      query = query.in('opened_by', ids);
    }
  }
  return { query, orden: f.orden ?? { campo: 'opened_at' as const, direccion: 'desc' as const } };
}

/** Nombres de cajero y sucursal (una consulta por tabla para toda la lista). */
export async function enriquecerSesiones(db: Db, sesiones: CashSession[]): Promise<CashSession[]> {
  const nombre = (p?: { first_name: string | null; last_name: string | null }) =>
    p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Usuario' : 'Usuario';

  const userIds = [...new Set(sesiones.flatMap((s) => [s.opened_by, s.closed_by]).filter((id): id is string => !!id))];
  if (userIds.length > 0) {
    const { data } = await db.from('profiles').select('id, first_name, last_name').in('id', userIds);
    const perfiles = new Map(((data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>).map((p) => [p.id, p]));
    for (const s of sesiones) {
      s.opened_by_name = nombre(perfiles.get(s.opened_by));
      if (s.closed_by) s.closed_by_name = nombre(perfiles.get(s.closed_by));
    }
  }

  const branchIds = [...new Set(sesiones.map((s) => s.branch_id).filter((id): id is number => !!id))];
  const sucursales = new Map<number, string>();
  if (branchIds.length > 0) {
    const { data } = await db.from('branches').select('id, name').in('id', branchIds);
    for (const b of (data ?? []) as Array<{ id: number; name: string }>) sucursales.set(b.id, b.name);
  }
  for (const s of sesiones) {
    s.branch_name = s.branch_id ? sucursales.get(s.branch_id) || `#${s.branch_id}` : 'Todas las sucursales';
  }
  return sesiones;
}

/** Cierre ciego sin permiso: sin monto contado ni diferencia. */
export function enmascararHistorial<T extends { final_amount?: number | null; difference?: number | null }>(sesion: T, verImportes: boolean): T {
  return verImportes ? sesion : ({ ...sesion, final_amount: null, difference: null } as T);
}

/** Página del historial (orden y página en la base). */
export async function paginaHistorial(db: Db, filtros: CashHistoryFilters, op: OpcionesHistorial, pagina: number, tamano: number) {
  const base = await consultaHistorial(db, '*', filtros, op, true);
  if (!base) return { data: [] as CashSession[], total: 0 };
  const desde = (pagina - 1) * tamano;
  const { data, count, error } = await base.query
    .order(base.orden.campo, { ascending: base.orden.direccion === 'asc', nullsFirst: false })
    .order('id', { ascending: false })
    .range(desde, desde + tamano - 1);
  if (error) throw error;
  const sesiones = await enriquecerSesiones(db, (data ?? []) as unknown as CashSession[]);
  return { data: sesiones.map((s) => enmascararHistorial(s, op.verImportes)), total: count ?? 0 };
}

/** Diferencias de todas las sesiones filtradas (franja de cifras). Ocultas → lista vacía. */
export async function diferenciasHistorial(db: Db, filtros: CashHistoryFilters, op: OpcionesHistorial): Promise<Array<number | null>> {
  if (!op.verImportes) return [];
  const base = await consultaHistorial(db, 'difference', filtros, op, false);
  if (!base) return [];
  const { data, error } = await base.query.limit(10000);
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{ difference: number | string | null }>).map((r) => (r.difference === null ? null : Number(r.difference)));
}

export const MAX_EXPORTACION_HISTORIAL = 5000;

/** Todas las sesiones filtradas, con nombres (para «Exportar»). Tope: 5.000. */
export async function exportacionHistorial(db: Db, filtros: CashHistoryFilters, op: OpcionesHistorial): Promise<CashSession[]> {
  const base = await consultaHistorial(db, '*', filtros, op, false);
  if (!base) return [];
  const { data, error } = await base.query
    .order(base.orden.campo, { ascending: base.orden.direccion === 'asc', nullsFirst: false })
    .limit(MAX_EXPORTACION_HISTORIAL);
  if (error) throw error;
  const sesiones = await enriquecerSesiones(db, (data ?? []) as unknown as CashSession[]);
  return sesiones.map((s) => enmascararHistorial(s, op.verImportes));
}

// ── Query string del historial (lista blanca) ─────────────────────────────

const ESTADOS = ['open', 'closed', 'all'] as const;
const RESULTADOS: readonly ResultadoCierre[] = ['faltante', 'sobrante', 'cuadrada'];
const CAMPOS: readonly CampoOrdenHistorial[] = ['opened_at', 'closed_at', 'difference'];
const TAMANOS = [10, 20, 50, 100];

function instante(v: string | null): string | undefined {
  if (!v || v.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(v) || Number.isNaN(Date.parse(v))) return undefined;
  return v;
}

export interface ConsultaHistorialUrl {
  filtros: CashHistoryFilters;
  pagina: number;
  tamano: number;
  sucursalId: number | null;
  vista: 'pagina' | 'diferencias' | 'exportar';
}

/** Query string → filtros validados (lo desconocido se descarta). */
export function consultaHistorialDeUrl(url: URL): ConsultaHistorialUrl {
  const q = url.searchParams;
  const status = q.get('status');
  const resultado = q.get('resultado');
  const campo = q.get('orden');
  const busqueda = (q.get('busqueda') ?? '').slice(0, 80) || undefined;
  const pagina = Math.trunc(Number(q.get('pagina')));
  const tamano = Number(q.get('tamano'));
  const sucursal = Number(q.get('sucursal'));
  const vista = q.get('vista');
  return {
    filtros: {
      status: (ESTADOS as readonly string[]).includes(status ?? '') ? (status as CashHistoryFilters['status']) : undefined,
      desde: instante(q.get('desde')),
      hasta: instante(q.get('hasta')),
      busqueda,
      resultado: RESULTADOS.includes(resultado as ResultadoCierre) ? (resultado as ResultadoCierre) : undefined,
      orden: CAMPOS.includes(campo as CampoOrdenHistorial)
        ? { campo: campo as CampoOrdenHistorial, direccion: q.get('dir') === 'asc' ? 'asc' : 'desc' }
        : undefined,
    },
    pagina: Number.isFinite(pagina) && pagina >= 1 ? Math.min(pagina, 100000) : 1,
    tamano: TAMANOS.includes(tamano) ? tamano : 10,
    sucursalId: Number.isInteger(sucursal) && sucursal > 0 ? sucursal : null,
    vista: vista === 'diferencias' || vista === 'exportar' ? vista : 'pagina',
  };
}
