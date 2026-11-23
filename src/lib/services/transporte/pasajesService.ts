/**
 * Transporte › Boletos › Pasajes (Fase 2, migración 20261124001000). Recibe el cliente de la
 * sesión. Todo lo que cambia puestos y boletos pasa por las RPC (organización y permiso en la
 * base): retener con los minutos del canal, emitir, cambiar y anular con las reglas de
 * Configuración › Transporte. Este servicio NO cobra: el cobro con la caja del POS queda
 * pendiente de integrar con posService (nunca una segunda implementación de caja).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { leerPuestos, leerRespuesta, puestosDe, type PlanoDibujo, type PuestoViaje, type RespuestaPasaje } from '@/lib/transporte/pasajes';

export type CanalVenta = 'taquilla' | 'web' | 'pos';

export interface ViajeVendible {
  id: string;
  codigo: string;
  fecha: string;
  salida: string;
  status: string | null;
  rutaId: string;
  ruta: string | null;
  vehiculoId: string | null;
  placa: string | null;
  tarifaBase: number;
  moneda: string | null;
  libres: number;
  puestos: number;
}

export async function viajesVendibles(db: SupabaseClient, organizationId: number, desde: string): Promise<ViajeVendible[]> {
  const { data, error } = await db
    .from('trips')
    .select('id, trip_code, trip_date, scheduled_departure, status, route_id, vehicle_id, base_fare, currency, available_seats, total_seats, transport_routes(name, code), vehicles(plate)')
    .eq('organization_id', organizationId)
    .gte('trip_date', desde)
    .in('status', ['scheduled', 'boarding', 'delayed'])
    .order('scheduled_departure', { ascending: true })
    .limit(200);
  if (error) throw error;
  const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
  return ((data ?? []) as unknown as {
    id: string;
    trip_code: string;
    trip_date: string;
    scheduled_departure: string;
    status: string | null;
    route_id: string;
    vehicle_id: string | null;
    base_fare: number;
    currency: string | null;
    available_seats: number;
    total_seats: number;
    transport_routes: { name: string; code: string } | { name: string; code: string }[] | null;
    vehicles: { plate: string } | { plate: string }[] | null;
  }[]).map((t) => {
    const r = uno(t.transport_routes);
    return {
      id: t.id,
      codigo: t.trip_code,
      fecha: t.trip_date,
      salida: t.scheduled_departure,
      status: t.status,
      rutaId: t.route_id,
      ruta: r ? `${r.code} · ${r.name}` : null,
      vehiculoId: t.vehicle_id,
      placa: uno(t.vehicles)?.plate ?? null,
      tarifaBase: Number(t.base_fare) || 0,
      moneda: t.currency,
      libres: t.available_seats,
      puestos: t.total_seats,
    };
  });
}

export interface TarifaPasaje {
  id: string;
  nombre: string;
  valor: number;
}

export async function tarifasDeRuta(db: SupabaseClient, organizationId: number, rutaId: string): Promise<TarifaPasaje[]> {
  const { data, error } = await db
    .from('transport_fares')
    .select('id, fare_name, amount, route_id, display_order')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .or(`route_id.eq.${rutaId},route_id.is.null`)
    .order('display_order', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as { id: string; fare_name: string; amount: number }[]).map((f) => ({ id: f.id, nombre: f.fare_name, valor: Number(f.amount) || 0 }));
}

export async function puestosDeViaje(db: SupabaseClient, tripId: string): Promise<PuestoViaje[]> {
  const { data, error } = await db.rpc('fn_transporte_puestos_viaje', { p_trip: tripId });
  if (error) throw error;
  return leerPuestos(data);
}

async function llamar(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<RespuestaPasaje> {
  const { data, error } = await db.rpc(fn, args);
  if (error) return { estado: 'error' };
  return leerRespuesta(data);
}

export const retenerPuesto = (db: SupabaseClient, tripId: string, etiqueta: string, canal: CanalVenta = 'taquilla') =>
  llamar(db, 'fn_transporte_retener_puesto', { p_trip: tripId, p_etiqueta: etiqueta, p_canal: canal });

export async function soltarPuesto(db: SupabaseClient, tripId: string, etiqueta: string): Promise<boolean> {
  const { data, error } = await db.rpc('fn_transporte_soltar_puesto', { p_trip: tripId, p_etiqueta: etiqueta });
  return !error && data === true;
}

export interface DatosPasajero {
  nombre: string;
  docTipo?: string | null;
  documento?: string | null;
  telefono?: string | null;
  sube?: string | null;
  baja?: string | null;
  tarifa: number;
  tarifaNombre?: string | null;
  pagado: boolean;
  canal?: CanalVenta;
}

export const emitirBoleto = (db: SupabaseClient, tripId: string, etiqueta: string, d: DatosPasajero) =>
  llamar(db, 'fn_transporte_emitir_boleto', {
    p_trip: tripId,
    p_etiqueta: etiqueta,
    p_datos: {
      nombre: d.nombre.trim(),
      doc_tipo: d.docTipo ?? '',
      documento: d.documento?.trim() ?? '',
      telefono: d.telefono?.trim() ?? '',
      sube: d.sube ?? '',
      baja: d.baja ?? '',
      tarifa: String(d.tarifa),
      tarifa_nombre: d.tarifaNombre ?? null,
      pago: d.pagado ? 'paid' : 'pending',
      canal: d.canal ?? 'taquilla',
    },
  });

export const cambiarBoleto = (db: SupabaseClient, ticketId: string, tripId: string, etiqueta: string) =>
  llamar(db, 'fn_transporte_cambiar_boleto', { p_ticket: ticketId, p_trip: tripId, p_etiqueta: etiqueta });

export const anularBoleto = (db: SupabaseClient, ticketId: string, motivo: string) =>
  llamar(db, 'fn_transporte_anular_boleto', { p_ticket: ticketId, p_motivo: motivo });

/** Crea el plano desde una plantilla y lo aplica al vehículo (exige transporte.manage). */
export async function aplicarPlantilla(db: SupabaseClient, organizationId: number, vehiculoId: string, nombre: string, plano: PlanoDibujo): Promise<boolean> {
  const existente = await db.from('seat_maps').select('id').eq('organization_id', organizationId).eq('name', nombre).maybeSingle();
  let id = (existente.data as { id: string } | null)?.id ?? null;
  if (!id) {
    const { data, error } = await db
      .from('seat_maps')
      .insert({ organization_id: organizationId, name: nombre, kind: plano.kind, rows: plano.rows, cols: plano.cols, layout: plano.layout })
      .select('id')
      .single();
    if (error) return false;
    id = (data as { id: string }).id;
  }
  const { error } = await db.rpc('fn_transporte_plano_aplicar', { p_vehicle: vehiculoId, p_map: id });
  if (error) return false;
  // El viaje toma los puestos del vehículo al abrir el plano (fn_transporte_puestos_viaje).
  return puestosDe(plano) > 0;
}
