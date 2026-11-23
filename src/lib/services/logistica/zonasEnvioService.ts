/**
 * Zonas y tarifas de envío y reglas de despacho (logística Fase 1): CRUD.
 *
 * Tablas shipping_zones, shipping_zone_locations y delivery_rules (migración 20261123145549).
 * Escribir exige ser administrador o tener «Configuración de la organización»; lo garantiza RLS
 * (fn_caja_puede(org, 'organization_settings')), no este archivo.
 *
 * Recibe el cliente Supabase: el del navegador (`@/lib/supabase/config`) en la pantalla o el de
 * la sesión del servidor (`getServerUserClient`) en un route handler. Nunca service role.
 * La organización sale siempre de la sesión de quien llama, no del body.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  prepararUbicacion,
  validarZona,
  type ReglaDespacho,
  type ReglaDespachoEntrada,
  type UbicacionZona,
  type UbicacionZonaEntrada,
  type ZonaEnvio,
  type ZonaEnvioEntrada,
} from '@/lib/logistica/zonas';

export class ZonaEnvioError extends Error {
  constructor(public readonly codigo: string, mensaje?: string) {
    super(mensaje ?? codigo);
    this.name = 'ZonaEnvioError';
  }
}

export interface ZonaConUbicaciones extends ZonaEnvio {
  ubicaciones: UbicacionZona[];
}

const COLUMNAS_ZONA =
  'id, organization_id, branch_id, name, description, is_active, is_fallback, priority, fee, currency, ' +
  'promise_min_minutes, promise_max_minutes, promise_text, min_order_amount, free_shipping_from, ' +
  'free_shipping_applies_to, cutoff_time, delivery_days, metadata, created_at, updated_at';

function exigirSinErrores(zona: ZonaEnvioEntrada) {
  const errores = validarZona(zona);
  if (errores.length > 0) throw new ZonaEnvioError(errores[0], errores.join(', '));
}

/** Zonas de la organización; con `branchId`, las de esa sede y las de toda la organización. */
export async function listarZonas(
  client: SupabaseClient,
  organizationId: number,
  opciones: { branchId?: number | null; soloActivas?: boolean } = {},
): Promise<ZonaConUbicaciones[]> {
  let q = client
    .from('shipping_zones')
    .select(`${COLUMNAS_ZONA}, ubicaciones:shipping_zone_locations(*)`)
    .eq('organization_id', organizationId)
    .order('is_fallback', { ascending: true })
    .order('priority', { ascending: true })
    .order('name', { ascending: true });
  if (opciones.branchId != null) q = q.or(`branch_id.is.null,branch_id.eq.${Number(opciones.branchId)}`);
  if (opciones.soloActivas) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as ZonaConUbicaciones[];
}

export async function obtenerZona(client: SupabaseClient, organizationId: number, zonaId: string): Promise<ZonaConUbicaciones | null> {
  const { data, error } = await client
    .from('shipping_zones')
    .select(`${COLUMNAS_ZONA}, ubicaciones:shipping_zone_locations(*)`)
    .eq('organization_id', organizationId)
    .eq('id', zonaId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ZonaConUbicaciones | null) ?? null;
}

export async function crearZona(client: SupabaseClient, organizationId: number, zona: ZonaEnvioEntrada): Promise<ZonaEnvio> {
  exigirSinErrores(zona);
  const { data, error } = await client
    .from('shipping_zones')
    .insert({ ...zona, name: zona.name.trim(), organization_id: organizationId })
    .select(COLUMNAS_ZONA)
    .single();
  if (error) {
    if (error.code === '23505') throw new ZonaEnvioError('zona_duplicada', 'Ya existe una zona con ese nombre o una tarifa general en esa sede');
    throw error;
  }
  return data as unknown as ZonaEnvio;
}

export async function actualizarZona(
  client: SupabaseClient,
  organizationId: number,
  zonaId: string,
  cambios: Partial<ZonaEnvioEntrada>,
): Promise<ZonaEnvio> {
  const { data: actual, error: errLectura } = await client
    .from('shipping_zones')
    .select(COLUMNAS_ZONA)
    .eq('organization_id', organizationId)
    .eq('id', zonaId)
    .single();
  if (errLectura) throw errLectura;
  exigirSinErrores({ ...(actual as unknown as ZonaEnvio), ...cambios } as ZonaEnvioEntrada);
  // organization_id nunca viaja en un cambio: la zona no cambia de dueño.
  const { organization_id: _ignorado, ...seguros } = cambios as Record<string, unknown>;
  void _ignorado;
  const { data, error } = await client
    .from('shipping_zones')
    .update(seguros)
    .eq('organization_id', organizationId)
    .eq('id', zonaId)
    .select(COLUMNAS_ZONA)
    .single();
  if (error) throw error;
  return data as unknown as ZonaEnvio;
}

/** Borra la zona y su cobertura (los envíos cotizados con ella quedan con shipping_zone_id NULL). */
export async function eliminarZona(client: SupabaseClient, organizationId: number, zonaId: string): Promise<void> {
  const { error } = await client.from('shipping_zones').delete().eq('organization_id', organizationId).eq('id', zonaId);
  if (error) throw error;
}

export async function agregarUbicaciones(
  client: SupabaseClient,
  organizationId: number,
  zonaId: string,
  ubicaciones: UbicacionZonaEntrada[],
): Promise<UbicacionZona[]> {
  const filas = ubicaciones.map((u) => {
    const r = prepararUbicacion(u);
    if (!r.ok) throw new ZonaEnvioError(r.error);
    return { ...r.fila, organization_id: organizationId, zone_id: zonaId };
  });
  if (filas.length === 0) return [];
  const { data, error } = await client.from('shipping_zone_locations').insert(filas).select('*');
  if (error) throw error;
  return (data ?? []) as UbicacionZona[];
}

export async function eliminarUbicacion(client: SupabaseClient, organizationId: number, ubicacionId: string): Promise<void> {
  const { error } = await client
    .from('shipping_zone_locations')
    .delete()
    .eq('organization_id', organizationId)
    .eq('id', ubicacionId);
  if (error) throw error;
}

// ── Reglas de despacho ─────────────────────────────────────────────────────────────────────────

export async function listarReglas(client: SupabaseClient, organizationId: number): Promise<ReglaDespacho[]> {
  const { data, error } = await client
    .from('delivery_rules')
    .select('*')
    .eq('organization_id', organizationId)
    .order('priority', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReglaDespacho[];
}

export async function crearRegla(client: SupabaseClient, organizationId: number, regla: ReglaDespachoEntrada): Promise<ReglaDespacho> {
  if (!(regla.name ?? '').trim()) throw new ZonaEnvioError('nombre_requerido');
  if (regla.action && regla.action !== 'own') throw new ZonaEnvioError('accion_no_disponible', 'Fase 1: solo domiciliario propio');
  const { data, error } = await client
    .from('delivery_rules')
    .insert({ ...regla, name: regla.name.trim(), action: 'own', organization_id: organizationId })
    .select('*')
    .single();
  if (error) throw error;
  return data as ReglaDespacho;
}

export async function actualizarRegla(
  client: SupabaseClient,
  organizationId: number,
  reglaId: string,
  cambios: Partial<ReglaDespachoEntrada>,
): Promise<ReglaDespacho> {
  if (cambios.action && cambios.action !== 'own') throw new ZonaEnvioError('accion_no_disponible', 'Fase 1: solo domiciliario propio');
  const { organization_id: _ignorado, ...seguros } = cambios as Record<string, unknown>;
  void _ignorado;
  const { data, error } = await client
    .from('delivery_rules')
    .update(seguros)
    .eq('organization_id', organizationId)
    .eq('id', reglaId)
    .select('*')
    .single();
  if (error) throw error;
  return data as ReglaDespacho;
}

export async function eliminarRegla(client: SupabaseClient, organizationId: number, reglaId: string): Promise<void> {
  const { error } = await client.from('delivery_rules').delete().eq('organization_id', organizationId).eq('id', reglaId);
  if (error) throw error;
}
