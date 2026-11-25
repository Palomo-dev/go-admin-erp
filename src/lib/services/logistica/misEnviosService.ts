/**
 * «Mis envíos» del domiciliario (logística Fase 1): lectura de su ruta, fotos y avisos.
 *
 * Todo lo que mueve estado o dinero es una RPC (`deliveryIntegrationService.changeStatus`,
 * `markAsDelivered`, `registerFailedAttempt`): aquí solo se lee y se suben las fotos al bucket
 * `shipment-pod`. Los avisos al cliente y el fin de jornada van por el servidor (logisticaApi.ts).
 *
 * El código de entrega no se lee nunca (`shipment_delivery_codes` es solo de administradores).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EnvioDomiciliario } from '@/lib/logistica/misEnvios';
import { ESTADOS_EN_RUTA, rutaFotoEnvio } from '@/lib/logistica/misEnvios';
import { barrioDeEnvio } from './despachoService';

export interface ItemEnvio {
  id: string;
  description: string | null;
  qty: number | null;
  total_value: number | null;
}

export type EnvioApp = EnvioDomiciliario & {
  organization_id: number;
  driver_id: string | null;
  /** Vehículo congelado al asignar (Logística 1b). */
  vehicle_id?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Barrio: lo guardan el pedido web y la venta POS en `metadata` (`barrioDeEnvio`). */
  barrio?: string | null;
  customer?: { full_name?: string | null; phone?: string | null } | null;
  shipment_items?: ItemEnvio[];
};

const COLUMNAS =
  'id, organization_id, branch_id, driver_id, shipment_number, status, source_type, source_id, delivery_address, delivery_city, ' +
  'delivery_contact_name, delivery_contact_phone, delivery_instructions, delivery_latitude, delivery_longitude, ' +
  'expected_delivery_date, assigned_at, picked_at, dispatched_at, delivered_at, created_at, updated_at, cod_amount, cod_status, ' +
  'cod_collected_amount, cod_collected_method, cod_collected_at, delivery_code_required, failed_attempts, exception_reason, ' +
  'shipping_fee, payment_status, vehicle_id, metadata, customer:customers(full_name, phone), shipment_items(id, description, qty, total_value)';

/** Barrio de cada envío: la misma lectura que la bandeja de Por despachar. */
function conBarrio(envios: EnvioApp[]): EnvioApp[] {
  return envios.map((e) => ({ ...e, barrio: barrioDeEnvio({ metadata: e.metadata ?? null, delivery_department: null }) }));
}

/** Hora prometida de los pedidos de la tienda (`web_orders.estimated_delivery_at`). */
async function conPromesa(client: SupabaseClient, organizationId: number, envios: EnvioApp[]): Promise<EnvioApp[]> {
  const ids = [...new Set(envios.filter((e) => e.source_type === 'web_order' && e.source_id).map((e) => e.source_id as string))];
  if (ids.length === 0) return envios;
  const { data } = await client.from('web_orders').select('id, estimated_delivery_at').eq('organization_id', organizationId).in('id', ids);
  const promesas = new Map(((data ?? []) as Array<{ id: string; estimated_delivery_at: string | null }>).map((w) => [w.id, w.estimated_delivery_at]));
  return envios.map((e) => ({ ...e, promesa: e.source_id ? promesas.get(e.source_id) ?? null : null }));
}

/**
 * La ruta del domiciliario: lo que está en curso, las novedades, lo cobrado sin cuadrar y lo tocado
 * desde `desde` (inicio de ayer en la zona de la organización, para «Entregados hoy» y la jornada).
 */
export async function listarMisEnvios(client: SupabaseClient, organizationId: number, driverId: string, desde: string): Promise<EnvioApp[]> {
  const enRuta = [...ESTADOS_EN_RUTA, 'failed_attempt'].join(',');
  const { data, error } = await client
    .from('shipments')
    .select(COLUMNAS)
    .eq('organization_id', organizationId)
    .eq('driver_id', driverId)
    .or(`status.in.(${enRuta}),cod_status.eq.collected,updated_at.gte.${desde}`)
    .order('created_at', { ascending: true })
    .limit(300);
  if (error) throw error;
  return conPromesa(client, organizationId, conBarrio((data ?? []) as unknown as EnvioApp[]));
}

/** Una parada del domiciliario. Si el envío no es suyo, null (no se distingue de «no existe»). */
export async function obtenerParada(client: SupabaseClient, organizationId: number, driverId: string, shipmentId: string): Promise<EnvioApp | null> {
  const { data, error } = await client
    .from('shipments')
    .select(COLUMNAS)
    .eq('organization_id', organizationId)
    .eq('driver_id', driverId)
    .eq('id', shipmentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [conHora] = await conPromesa(client, organizationId, conBarrio([data as unknown as EnvioApp]));
  return conHora;
}

/**
 * Sube una foto o la firma a `shipment-pod/{org}/{envío}/…` (política de subida: miembro activo de
 * esa organización que ve el envío) y devuelve la RUTA en el bucket, que es lo que guardan las RPC.
 * El bucket es privado (migración 20261123165515): para verla se pide un enlace firmado al servidor
 * (`useEvidenciasEnvio`). Nunca URL pública.
 */
export async function subirImagenEnvio(
  client: SupabaseClient,
  organizationId: number,
  shipmentId: string,
  archivo: Blob,
  tipo: 'foto' | 'firma' | 'novedad' | 'comprobante',
): Promise<string> {
  const extension = archivo.type === 'image/png' ? 'png' : archivo.type === 'image/webp' ? 'webp' : 'jpg';
  const uuid = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const ruta = rutaFotoEnvio(organizationId, shipmentId, uuid, tipo, extension);
  const { error } = await client.storage.from('shipment-pod').upload(ruta, archivo, {
    contentType: archivo.type || 'image/jpeg',
    upsert: false,
    cacheControl: '31536000',
  });
  if (error) throw error;
  return ruta;
}

/** Cuadre de la jornada (`courier_settlements`): el domiciliario lee los suyos por RLS. */
export interface CuadreJornada {
  id: string;
  status: string;
  difference: number | string | null;
  expected_total: number | string | null;
  received_total: number | string | null;
  opened_at: string;
  closed_at: string | null;
}

/** Los cuadres del domiciliario abiertos desde `desde` (el más reciente primero). */
export async function cuadresDesde(client: SupabaseClient, organizationId: number, driverId: string, desde: string): Promise<CuadreJornada[]> {
  const { data, error } = await client
    .from('courier_settlements')
    .select('id, status, difference, expected_total, received_total, opened_at, closed_at')
    .eq('organization_id', organizationId)
    .eq('driver_id', driverId)
    .gte('opened_at', desde)
    .order('opened_at', { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data ?? []) as CuadreJornada[];
}

/** Vehículo del domiciliario: placa, tipo, dueño, capacidad y vencimientos (SOAT, tecnomecánica). */
export interface VehiculoApp {
  id: string;
  plate: string | null;
  vehicle_type: string;
  ownership: string | null;
  capacity_kg: number | string | null;
  soat_expiry: string | null;
  techno_expiry: string | null;
}

export async function leerVehiculo(client: SupabaseClient, organizationId: number, vehicleId: string): Promise<VehiculoApp | null> {
  const { data, error } = await client
    .from('vehicles')
    .select('id, plate, vehicle_type, ownership, capacity_kg, soat_expiry, techno_expiry')
    .eq('organization_id', organizationId)
    .eq('id', vehicleId)
    .maybeSingle();
  if (error) throw error;
  return (data as VehiculoApp | null) ?? null;
}
