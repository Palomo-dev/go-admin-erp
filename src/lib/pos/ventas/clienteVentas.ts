'use client';

/**
 * Cliente del navegador para Ventas del POS: solo `fetch` a los route handlers
 * (`/api/pos/ventas/...`), que resuelven la organización de la sesión. El
 * header `x-organization-id` evita la ambigüedad con varias pestañas.
 *
 * Desktop sin red: el servidor no está. El listado se lee entonces de la
 * réplica local con la consulta de siempre sobre `sales` (el resolutor local
 * de la fase 4C añade las ventas del outbox con `status = 'pending_sync'`) y
 * se devuelve con `sinRed: true`: solo fecha, cliente y paginación; la
 * pantalla avisa de que los demás filtros y las cifras esperan a la red.
 */
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getBranchFilter } from '@/lib/hooks/useOrganization';
import { isDesktop } from '@/lib/utils/desktop';
import { isAppOnline } from '@/lib/utils/offlineCache';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { getOperatingHours } from '@/lib/services/organizationOperatingHoursService';
import { getDateRange } from '@/lib/utils/dateRanges';
import { filaVentaLocal, type FilaSalesLocal } from './ventaLocal';
import { filtrosVentas } from './filtrosVentas';
import type { CifrasVentas, FilaVenta, PaginaVentas } from './listadoServidor';
import { SIN_PERMISOS_VENTAS, type PermisosVentas } from './accionesVenta';

export type PaginaVentasCliente = PaginaVentas & { sinRed?: boolean };

export class ErrorPeticionVentas extends Error {
  constructor(
    readonly codigo: string,
    readonly estado: number,
  ) {
    super(codigo);
  }
}

function cabeceras(): HeadersInit {
  const org = getOrganizationId();
  return org > 0 ? { 'x-organization-id': String(org) } : {};
}

async function pedir<T>(ruta: string): Promise<T> {
  const r = await fetch(ruta, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras() });
  const cuerpo = (await r.json().catch(() => null)) as (T & { codigo?: string }) | null;
  if (!r.ok || !cuerpo) throw new ErrorPeticionVentas(cuerpo?.codigo ?? (r.status === 403 ? 'sin_permiso' : 'lectura_fallida'), r.status);
  return cuerpo;
}

const sinRed = () => isDesktop() && !isAppOnline();

/** Listado paginado (la consulta es la query string del listado). */
export async function pedirVentas(consulta: URLSearchParams): Promise<PaginaVentasCliente> {
  if (sinRed()) return ventasSinRed(consulta);
  try {
    return await pedir<PaginaVentas>(`/api/pos/ventas?${consulta.toString()}`);
  } catch (e) {
    // Corte de red a mitad de la petición en el Desktop: la réplica local.
    if (!(e instanceof ErrorPeticionVentas) && isDesktop()) return ventasSinRed(consulta);
    throw e;
  }
}

export async function pedirCifrasVentas(consulta: URLSearchParams): Promise<CifrasVentas | null> {
  if (sinRed()) return null;
  return pedir<CifrasVentas>(`/api/pos/ventas/cifras?${consulta.toString()}`);
}

export async function pedirExportacionVentas(consulta: URLSearchParams): Promise<{ filas: FilaVenta[]; truncado: boolean }> {
  return pedir(`/api/pos/ventas/exportar?${consulta.toString()}`);
}

export async function pedirPermisosVentas(): Promise<PermisosVentas> {
  if (sinRed()) return SIN_PERMISOS_VENTAS;
  return pedir<PermisosVentas>('/api/pos/ventas/permisos');
}

// ── Sin red (Desktop) ──────────────────────────────────────────────────────

async function ventasSinRed(consulta: URLSearchParams): Promise<PaginaVentasCliente> {
  const f = filtrosVentas(Object.fromEntries(consulta.entries()));
  const org = getOrganizationId();
  const sucursal = getBranchFilter();
  let q = supabase
    .from('sales')
    .select('id, sale_date, created_at, total, balance, status, payment_status, source, web_order_id, table_session_id, customer_id, user_id, branch_id', { count: 'exact' })
    .eq('organization_id', org)
    .order('sale_date', { ascending: false })
    .range((f.pagina - 1) * f.tamano, f.pagina * f.tamano - 1);
  if (sucursal) q = q.eq('branch_id', sucursal);
  if (f.clienteId) q = q.eq('customer_id', f.clienteId);
  if (f.desde || f.hasta) {
    const [zona, horas] = await Promise.all([getOrganizationTimezone(org), getOperatingHours(org)]);
    const r = getDateRange(f.desde ?? (f.hasta as string), f.hasta ?? (f.desde as string), zona, horas);
    if (f.desde) q = q.gte('sale_date', r.start);
    if (f.hasta) q = q.lte('sale_date', r.end);
  }
  const { data, count, error } = await q;
  if (error) throw new ErrorPeticionVentas('lectura_fallida', 0);
  const filas = (data ?? []) as FilaSalesLocal[];
  const ids = [...new Set(filas.map((s) => s.customer_id).filter((x): x is string => !!x))];
  const clientes = new Map<string, { nombre: string | null; documento: string | null }>();
  if (ids.length) {
    const { data: cs } = await supabase.from('customers').select('id, full_name, doc_number').in('id', ids);
    for (const c of (cs ?? []) as Array<{ id: string; full_name: string | null; doc_number: string | null }>) {
      clientes.set(c.id, { nombre: c.full_name, documento: c.doc_number });
    }
  }
  return {
    total: count ?? filas.length,
    filas: filas.map((s) => filaVentaLocal(s, s.customer_id ? clientes.get(s.customer_id) : undefined)),
    pagina: f.pagina,
    tamano: f.tamano,
    sinRed: true,
  };
}
