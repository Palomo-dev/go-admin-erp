/**
 * Listas de precios — cliente del navegador.
 *
 * - `resolverPreciosCliente`: la RPC única `resolve_customer_prices` (POS, cotizaciones y
 *   facturas). La llama la sesión del usuario: la base comprueba que es miembro de la organización
 *   (y en la fase 2, desde la tienda, que el cliente es el de la sesión).
 * - El resto (pantallas de gestión y ficha del cliente) va por /api/listas-precios/**, que toma
 *   la organización de la sesión.
 */
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { normalizarFilaPrecio, type CanalLista, type PrecioClienteFila } from '@/lib/listasPrecios/precioLista';
import type {
  CandidatoCliente,
  CandidatoGrupo,
  ClienteDeLista,
  DatosLista,
  DetalleLista,
  InfoListaCliente,
  ResultadoImportacion,
  ResumenListas,
} from '@/lib/listasPrecios/tipos';
import type { FilaArchivoPrecios } from '@/lib/listasPrecios/archivoPrecios';

export async function resolverPreciosCliente(opciones: {
  organizationId: number;
  customerId: string | null;
  productIds: readonly number[];
  canal: CanalLista;
  branchId?: number | null;
}): Promise<PrecioClienteFila[]> {
  const ids = Array.from(new Set(opciones.productIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (ids.length === 0) return [];
  const filas: PrecioClienteFila[] = [];
  // La RPC acepta hasta 2000 productos por llamada.
  for (let i = 0; i < ids.length; i += 2000) {
    const { data, error } = await supabase.rpc('resolve_customer_prices', {
      p_org: opciones.organizationId,
      p_customer: opciones.customerId,
      p_product_ids: ids.slice(i, i + 2000),
      p_channel: opciones.canal,
      p_branch: opciones.branchId ?? null,
    });
    if (error) throw error;
    for (const raw of (data ?? []) as Record<string, unknown>[]) filas.push(normalizarFilaPrecio(raw));
  }
  return filas;
}

/** Permiso resuelto en el servidor (`fn_tiene_permiso`), nunca por el nombre del rol. */
export async function tienePermisoLista(codigo: 'pos.listas_precios.gestionar' | 'pos.precios.cambiar_en_venta'): Promise<boolean> {
  const { data, error } = await supabase.rpc('fn_tiene_permiso', { p_organization_id: getOrganizationId(), p_code: codigo });
  return !error && data === true;
}

export class ErrorPeticionLista extends Error {
  constructor(public readonly codigo: string, public readonly estado: number) {
    super(codigo);
  }
}

async function pedir<T>(url: string, init: RequestInit = {}): Promise<T> {
  const org = getOrganizationId();
  const r = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(org > 0 ? { 'x-organization-id': String(org) } : {}),
    },
  });
  const cuerpo = (await r.json().catch(() => null)) as ({ codigo?: string } & Record<string, unknown>) | null;
  if (!r.ok) throw new ErrorPeticionLista(cuerpo?.codigo ?? 'error_desconocido', r.status);
  return cuerpo as T;
}

const base = '/api/listas-precios';
const json = (body: unknown) => JSON.stringify(body);

export const ListasPreciosService = {
  resumen: () => pedir<ResumenListas>(base),
  detalle: (id: string) => pedir<DetalleLista>(`${base}/${encodeURIComponent(id)}`),
  crear: (datos: DatosLista) => pedir<{ id: string }>(base, { method: 'POST', body: json(datos) }),
  guardar: (id: string, datos: DatosLista) => pedir<{ id: string }>(`${base}/${encodeURIComponent(id)}`, { method: 'PUT', body: json(datos) }),
  duplicar: (id: string, nombre: string) =>
    pedir<{ id: string }>(`${base}/${encodeURIComponent(id)}`, { method: 'POST', body: json({ accion: 'duplicar', nombre }) }),
  eliminar: (id: string) => pedir<{ ok: true }>(`${base}/${encodeURIComponent(id)}`, { method: 'DELETE', body: '{}' }),
  ordenar: (ids: string[]) => pedir<{ ok: true }>(`${base}/orden`, { method: 'POST', body: json({ ids }) }),
  clientes: (id: string, q: string, pagina: number, tamano: number) => {
    const p = new URLSearchParams({ pagina: String(pagina), tamano: String(tamano) });
    if (q.trim()) p.set('q', q.trim());
    return pedir<{ total: number; clientes: ClienteDeLista[] }>(`${base}/${encodeURIComponent(id)}/clientes?${p}`);
  },
  candidatosClientes: (id: string, q: string) => {
    const p = new URLSearchParams({ candidatos: 'clientes' });
    if (q.trim()) p.set('q', q.trim());
    return pedir<CandidatoCliente[]>(`${base}/${encodeURIComponent(id)}/clientes?${p}`);
  },
  candidatosGrupos: (id: string) => pedir<CandidatoGrupo[]>(`${base}/${encodeURIComponent(id)}/clientes?candidatos=grupos`),
  asignarClientes: (id: string, customerIds: string[]) =>
    pedir<{ asignados: number }>(`${base}/${encodeURIComponent(id)}/clientes`, { method: 'POST', body: json({ customer_ids: customerIds }) }),
  asignarGrupo: (id: string, segmentId: string) =>
    pedir<{ asignados: null }>(`${base}/${encodeURIComponent(id)}/clientes`, { method: 'POST', body: json({ segment_id: segmentId }) }),
  quitar: (id: string, destino: { customer_id: string } | { segment_id: string }) =>
    pedir<{ ok: true }>(`${base}/${encodeURIComponent(id)}/clientes`, { method: 'DELETE', body: json(destino) }),
  importar: (id: string, filas: FilaArchivoPrecios[], reemplazar: boolean, aplicar: boolean) =>
    pedir<ResultadoImportacion>(`${base}/${encodeURIComponent(id)}/importar`, { method: 'POST', body: json({ filas, reemplazar, aplicar }) }),
  infoCliente: (customerId: string) => pedir<InfoListaCliente>(`${base}/cliente/${encodeURIComponent(customerId)}`),
  cambiarListaCliente: (customerId: string, listaId: string | null) =>
    pedir<{ ok: true }>(`${base}/cliente/${encodeURIComponent(customerId)}`, { method: 'PUT', body: json({ price_list_id: listaId }) }),
};
