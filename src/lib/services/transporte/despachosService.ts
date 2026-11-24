/**
 * Transporte › Viajes › Despachos de hoy: lectura y despacho. Recibe el cliente de Supabase de
 * quien llama (en el navegador, el de la sesión: RLS por pertenencia).
 *
 * - Leer: `trips` del día (columnas del despacho), nombres de conductores desde
 *   `driver_credentials.user_id` (a eso apunta `trips.driver_id`) y el cumplimiento con
 *   `fn_transporte_cumplimiento` (la regla vive en la base).
 * - Despachar: SOLO `transporte_despachar_viaje` (permiso, bloqueo, excepción con PIN y planilla
 *   se resuelven en la base; ver migración 20261123220000).
 * - Planilla: pasajeros del viaje (`trip_tickets` no anulados) y lo necesario para imprimirla.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { leerCumplimientos, leerResultadoDespacho, type Cumplimiento, type ResultadoDespacho } from '@/lib/transporte/despachos';

export interface ViajeDelDia {
  id: string;
  codigo: string;
  fecha: string;
  salida: string;
  llegada: string | null;
  status: string | null;
  sedeId: number | null;
  ruta: { nombre: string; codigo: string } | null;
  vehiculo: { id: string; placa: string; tipo: string; capacidad: number | null; soat: string | null; tecnomecanica: string | null; poliza: string | null; tarjetaOperacion: string | null } | null;
  conductorId: string | null;
  conductor: { nombre: string; documento: string | null; licencia: string | null; licenciaVence: string | null; examenVence: string | null } | null;
  puestos: number;
  disponibles: number;
  tarifa: number;
  moneda: string | null;
  despachadoEn: string | null;
  planilla: string | null;
  excepcion: { motivo: string; por: string | null; en: string | null } | null;
  bloqueo: string | null;
}

interface FilaTrip {
  id: string;
  trip_code: string;
  trip_date: string;
  scheduled_departure: string;
  scheduled_arrival: string | null;
  status: string | null;
  branch_id: number | null;
  driver_id: string | null;
  total_seats: number;
  available_seats: number;
  base_fare: number;
  currency: string | null;
  dispatched_at: string | null;
  dispatch_sheet_number: string | null;
  dispatch_block_reason: string | null;
  dispatch_override_reason: string | null;
  dispatch_override_by: string | null;
  dispatch_override_at: string | null;
  transport_routes: { name: string; code: string } | { name: string; code: string }[] | null;
  vehicles:
    | { id: string; plate: string; vehicle_type: string; passenger_capacity: number | null; soat_expiry: string | null; techno_expiry: string | null; insurance_expiry: string | null; operating_card_expiry: string | null }
    | null;
}

const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export async function listarViajesDelDia(
  db: SupabaseClient,
  opciones: { organizationId: number; fecha: string; branchId?: number | null },
): Promise<ViajeDelDia[]> {
  let q = db
    .from('trips')
    .select(
      `id, trip_code, trip_date, scheduled_departure, scheduled_arrival, status, branch_id, driver_id, total_seats, available_seats, base_fare, currency,
       dispatched_at, dispatch_sheet_number, dispatch_block_reason, dispatch_override_reason, dispatch_override_by, dispatch_override_at,
       transport_routes(name, code),
       vehicles(id, plate, vehicle_type, passenger_capacity, soat_expiry, techno_expiry, insurance_expiry, operating_card_expiry)`,
    )
    .eq('organization_id', opciones.organizationId)
    .eq('trip_date', opciones.fecha)
    .order('scheduled_departure', { ascending: true })
    .limit(500);
  if (opciones.branchId) q = q.eq('branch_id', opciones.branchId);
  const { data, error } = await q;
  if (error) throw error;
  const filas = (data ?? []) as unknown as FilaTrip[];

  const usuarios = Array.from(new Set(filas.map((f) => f.driver_id).filter((x): x is string => !!x)));
  const autorizadores = Array.from(new Set(filas.map((f) => f.dispatch_override_by).filter((x): x is string => !!x)));
  const nombres = new Map<string, string>();
  if (autorizadores.length > 0) {
    // Quien autorizó una excepción no tiene por qué ser conductor: su nombre sale del perfil.
    const { data: perfiles } = await db.from('profiles').select('id, first_name, last_name').in('id', autorizadores);
    for (const p of (perfiles ?? []) as { id: string; first_name: string | null; last_name: string | null }[]) {
      nombres.set(p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim());
    }
  }
  const conductores = new Map<string, NonNullable<ViajeDelDia['conductor']>>();
  if (usuarios.length > 0) {
    // Solo lectura y columnas acotadas (fn_transporte_conductores, permiso transporte.view):
    // la tabla driver_credentials sigue cerrada a quien no gestiona Logística.
    const lista = await listarConductores(db, opciones.organizationId).catch(() => [] as ConductorLectura[]);
    for (const d of lista) {
      if (!d.userId || !usuarios.includes(d.userId)) continue;
      conductores.set(d.userId, {
        nombre: d.nombre,
        documento: d.documento,
        licencia: d.licenciaCategoria,
        licenciaVence: d.licenciaVence,
        examenVence: d.examenVence,
      });
    }
  }

  return filas.map((f) => {
    const v = uno(f.vehicles);
    const r = uno(f.transport_routes);
    return {
      id: f.id,
      codigo: f.trip_code,
      fecha: f.trip_date,
      salida: f.scheduled_departure,
      llegada: f.scheduled_arrival,
      status: f.status,
      sedeId: f.branch_id,
      ruta: r ? { nombre: r.name, codigo: r.code } : null,
      vehiculo: v
        ? { id: v.id, placa: v.plate, tipo: v.vehicle_type, capacidad: v.passenger_capacity, soat: v.soat_expiry, tecnomecanica: v.techno_expiry, poliza: v.insurance_expiry, tarjetaOperacion: v.operating_card_expiry }
        : null,
      conductorId: f.driver_id,
      conductor: f.driver_id ? conductores.get(f.driver_id) ?? null : null,
      puestos: f.total_seats,
      disponibles: f.available_seats,
      tarifa: Number(f.base_fare) || 0,
      moneda: f.currency,
      despachadoEn: f.dispatched_at,
      planilla: f.dispatch_sheet_number,
      excepcion: f.dispatch_override_reason
        ? { motivo: f.dispatch_override_reason, por: f.dispatch_override_by ? nombres.get(f.dispatch_override_by) || null : null, en: f.dispatch_override_at }
        : null,
      bloqueo: f.dispatch_block_reason,
    };
  });
}

/** Conductor tal como lo ve Transporte en solo lectura (`fn_transporte_conductores`). */
export interface ConductorLectura {
  id: string;
  userId: string | null;
  nombre: string;
  documentoTipo: string | null;
  documento: string | null;
  telefono: string | null;
  licenciaCategoria: string | null;
  licenciaVence: string | null;
  examenVence: string | null;
  activo: boolean;
  sedeId: number | null;
}

export async function listarConductores(db: SupabaseClient, organizationId: number): Promise<ConductorLectura[]> {
  const { data, error } = await db.rpc('fn_transporte_conductores', { p_org: organizationId });
  if (error) throw error;
  return ((data ?? []) as {
    id: string;
    user_id: string | null;
    nombre: string | null;
    documento_tipo: string | null;
    documento: string | null;
    telefono: string | null;
    licencia_categoria: string | null;
    licencia_vence: string | null;
    examen_vence: string | null;
    activo: boolean;
    sede_id: number | null;
  }[]).map((d) => ({
    id: d.id,
    userId: d.user_id,
    nombre: d.nombre?.trim() || '',
    documentoTipo: d.documento_tipo,
    documento: d.documento,
    telefono: d.telefono,
    licenciaCategoria: d.licencia_categoria,
    licenciaVence: d.licencia_vence,
    examenVence: d.examen_vence,
    activo: d.activo,
    sedeId: d.sede_id,
  }));
}

/** Quién puede autorizar una excepción de despacho y si tiene PIN (solo el booleano). */
export interface Autorizador {
  userId: string;
  nombre: string;
  tienePin: boolean;
}

export async function listarAutorizadores(db: SupabaseClient, organizationId: number): Promise<Autorizador[]> {
  const { data, error } = await db.rpc('fn_transporte_autorizadores', { p_org: organizationId });
  if (error) throw error;
  return ((data ?? []) as { user_id: string; nombre: string; tiene_pin: boolean }[]).map((a) => ({ userId: a.user_id, nombre: a.nombre, tienePin: a.tiene_pin === true }));
}

export async function cumplimientoDeViajes(db: SupabaseClient, ids: readonly string[]): Promise<Map<string, Cumplimiento>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await db.rpc('fn_transporte_cumplimiento', { p_trips: ids });
  if (error) throw error;
  return leerCumplimientos(data);
}

export class DespachoError extends Error {
  constructor(public readonly codigo: string) {
    super(codigo);
  }
}

/**
 * El PIN viaja a la RPC y se compara ALLÍ con el hash de `hr_credentials` del supervisor elegido;
 * el navegador nunca recibe ni compara hashes.
 */
export async function despacharViaje(db: SupabaseClient, tripId: string, excepcion?: { motivo: string; pin?: string; supervisor?: string | null }): Promise<ResultadoDespacho> {
  const { data, error } = await db.rpc('transporte_despachar_viaje', {
    p_trip: tripId,
    p_motivo: excepcion?.motivo?.trim() || null,
    p_pin: excepcion?.pin || null,
    p_supervisor: excepcion?.supervisor || null,
  });
  if (error) throw new DespachoError(error.code === '42501' ? 'sin_permiso' : error.code === 'P0002' ? 'no_encontrado' : 'error');
  const r = leerResultadoDespacho(data);
  if (!r) throw new DespachoError('error');
  return r;
}

export interface PasajeroPlanilla {
  nombre: string;
  documento: string | null;
  puesto: string | null;
  valor: number;
  abordo: boolean;
}

export async function pasajerosDeViaje(db: SupabaseClient, organizationId: number, tripId: string): Promise<PasajeroPlanilla[]> {
  const { data, error } = await db
    .from('trip_tickets')
    .select('passenger_name, passenger_doc_number, seat_number, total, status, boarded_at')
    .eq('organization_id', organizationId)
    .eq('trip_id', tripId)
    .order('seat_number', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as { passenger_name: string; passenger_doc_number: string | null; seat_number: string | null; total: number; status: string | null; boarded_at: string | null }[])
    .filter((t) => !['cancelled', 'refunded', 'no_show'].includes(t.status ?? ''))
    .map((t) => ({ nombre: t.passenger_name, documento: t.passenger_doc_number, puesto: t.seat_number, valor: Number(t.total) || 0, abordo: !!t.boarded_at }));
}
