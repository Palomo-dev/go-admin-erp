/**
 * Catálogo común › fichas de detalle (Figma «23 Transporte» 2872:1691 vehículo y 2874:2806 persona):
 * lecturas que las listas no necesitan. Recibe el cliente de la sesión (RLS por pertenencia) y
 * filtra además por la organización de la sesión. Solo lee: las escrituras siguen siendo las de
 * `transportService` y `documentosService`.
 *
 * Columnas y FK verificadas con el MCP de Supabase (2026-11-24):
 * - `shipments.driver_id` → `driver_credentials.id` y `shipments.vehicle_id` → `vehicles.id`.
 * - `trips.driver_id` → `auth.users.id` (por eso los viajes de una persona se buscan por su usuario).
 * - `transport_incidents.reference_type` ∈ trip, shipment, manifest, vehicle, route; `reference_id` uuid.
 * - `vehicles.seat_map_id` → `seat_maps(id, name, rows, cols)`.
 *
 * Los envíos se leen aquí con `limit` y conteo exacto en vez de `getAllShipmentsForDriver`
 * (deliveryIntegrationService), que trae TODOS los envíos con sus ítems: la ficha muestra los
 * últimos y el total.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const LIMITE_FICHA = 50;

export interface EnvioFicha {
  id: string;
  shipment_number: string | null;
  status: string;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_contact_name: string | null;
  expected_delivery_date: string | null;
  delivered_at: string | null;
  created_at: string;
  vehicle_id: string | null;
  driver_id: string | null;
}

export interface NovedadFicha {
  id: string;
  title: string;
  incident_type: string;
  severity: string | null;
  status: string;
  reference_type: string;
  reference_id: string | null;
  occurred_at: string | null;
  reported_at: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  currency: string | null;
}

export interface PlanoPuestos {
  id: string;
  name: string;
  rows: number | null;
  cols: number | null;
}

/** Últimos envíos de un domiciliario (`driver_credentials.id`) o de un vehículo, con el total. */
export async function listarEnviosFicha(
  db: SupabaseClient,
  organizationId: number,
  de: { driverId: string } | { vehicleId: string },
): Promise<{ envios: EnvioFicha[]; total: number }> {
  let q = db
    .from('shipments')
    .select('id, shipment_number, status, delivery_address, delivery_city, delivery_contact_name, expected_delivery_date, delivered_at, created_at, vehicle_id, driver_id', {
      count: 'exact',
    })
    .eq('organization_id', organizationId);
  q = 'driverId' in de ? q.eq('driver_id', de.driverId) : q.eq('vehicle_id', de.vehicleId);
  const { data, error, count } = await q.order('created_at', { ascending: false }).limit(LIMITE_FICHA);
  if (error) throw error;
  const envios = (data ?? []) as EnvioFicha[];
  return { envios, total: count ?? envios.length };
}

export type ReferenciaNovedad = { tipo: 'trip' | 'shipment' | 'vehicle'; ids: readonly string[] };

/** Filtro `or` de PostgREST: una condición por tipo de referencia con ids (uuid). */
export function filtroNovedades(refs: readonly ReferenciaNovedad[]): string | null {
  const uuid = /^[0-9a-f-]{36}$/i;
  const partes = refs
    .map((r) => ({ tipo: r.tipo, ids: Array.from(new Set(r.ids.filter((id) => uuid.test(id)))) }))
    .filter((r) => r.ids.length > 0)
    .map((r) => `and(reference_type.eq.${r.tipo},reference_id.in.(${r.ids.join(',')}))`);
  return partes.length ? partes.join(',') : null;
}

/** Novedades e incidentes del vehículo, de sus viajes o de sus envíos (o los de la persona). */
export async function listarNovedadesFicha(db: SupabaseClient, organizationId: number, refs: readonly ReferenciaNovedad[]): Promise<NovedadFicha[]> {
  const filtro = filtroNovedades(refs);
  if (!filtro) return [];
  const { data, error } = await db
    .from('transport_incidents')
    .select('id, title, incident_type, severity, status, reference_type, reference_id, occurred_at, reported_at, estimated_cost, actual_cost, currency')
    .eq('organization_id', organizationId)
    .or(filtro)
    .order('occurred_at', { ascending: false, nullsFirst: false })
    .limit(LIMITE_FICHA);
  if (error) throw error;
  return (data ?? []) as NovedadFicha[];
}

/** Plano de puestos del vehículo (Transporte de pasajeros). */
export async function obtenerPlanoPuestos(db: SupabaseClient, organizationId: number, id: string): Promise<PlanoPuestos | null> {
  const { data, error } = await db.from('seat_maps').select('id, name, rows, cols').eq('organization_id', organizationId).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as PlanoPuestos | null) ?? null;
}

/** Planos de puestos activos de la organización (los que arma Transporte › Pasajes). */
export async function listarPlanosPuestos(db: SupabaseClient, organizationId: number): Promise<(PlanoPuestos & { kind: string; layout: unknown })[]> {
  const { data, error } = await db.from('seat_maps').select('id, name, rows, cols, kind, layout').eq('organization_id', organizationId).eq('is_active', true).order('name');
  if (error) throw error;
  return (data ?? []) as (PlanoPuestos & { kind: string; layout: unknown })[];
}

export interface DocumentoHistorial {
  id: string;
  doc_type: string;
  number: string | null;
  expires_on: string | null;
  is_active: boolean;
  created_at: string;
}

/** Todos los documentos (también los archivados al renovar) de un vehículo o de una persona. */
export async function listarDocumentosHistorial(
  db: SupabaseClient,
  organizationId: number,
  de: { vehicleId: string } | { driverCredentialId: string },
): Promise<DocumentoHistorial[]> {
  let q = db.from('vehicle_documents').select('id, doc_type, number, expires_on, is_active, created_at').eq('organization_id', organizationId);
  q = 'vehicleId' in de ? q.eq('vehicle_id', de.vehicleId) : q.eq('driver_credential_id', de.driverCredentialId);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(LIMITE_FICHA);
  if (error) throw error;
  return (data ?? []) as DocumentoHistorial[];
}

export interface EmpleoCatalogo {
  id: string;
  nombre: string;
  positionId: string | null;
  branchId: number | null;
}

/**
 * Empleos activos de Recursos humanos con su cargo y su sede (formulario de persona). Es la consulta
 * de `transportService.getAvailableEmployeesForDriver` más `position_id` y `branch_id`, filtrada por
 * `employments.organization_id` (columna verificada con el MCP).
 */
export async function listarEmpleosCatalogo(db: SupabaseClient, organizationId: number): Promise<EmpleoCatalogo[]> {
  const { data, error } = await db
    .from('employments')
    .select('id, position_id, branch_id, organization_member:organization_members(profiles(first_name, last_name))')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .limit(1000);
  if (error) throw error;
  type Perfil = { first_name?: string | null; last_name?: string | null };
  const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
  return ((data ?? []) as { id: string; position_id: string | null; branch_id: number | null; organization_member?: unknown }[]).map((e) => {
    const p = uno(uno(e.organization_member as { profiles?: Perfil | Perfil[] } | { profiles?: Perfil | Perfil[] }[] | null)?.profiles);
    return { id: e.id, nombre: `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim(), positionId: e.position_id ?? null, branchId: e.branch_id ?? null };
  });
}
