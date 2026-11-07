/**
 * Hospedaje en Integraciones › Conexiones (Frente INT, 2026-11-07): calendarios iCal (Airbnb,
 * Booking.com, Expedia, Tripadvisor, Google Vacation Rentals) y modo API de Booking.com/Expedia.
 *
 * - iCal es REAL: el PMS ya exporta `/api/pms/ical/<token>` e importa con `/api/pms/ical/sync`
 *   (tabla `channel_connections`, una fila por organización + espacio + canal). Aquí solo se
 *   guardan los enlaces y se deja una fila en `integration_connections` del conector `<canal>_ical`
 *   para que la conexión se vea en «Mis conexiones».
 * - API: Booking.com y Expedia entregan las credenciales de máquina al PROVEEDOR de conectividad.
 *   Sin la cuenta de socio de GO Admin en el servidor no se crea nada (409 CUENTA_SOCIO): no se
 *   simula una conexión.
 *
 * Todo filtra por la organización de la sesión; el cliente lo crea la ruta tras resolverla.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { ConexionError, type Actor } from './conexiones.server';
import { cuentaDeSocioConfigurada, propiedadDeSettings, type CanalOta } from './credencialesOta';
import { origenPublico } from './urlsWebhook';

type Fila = Record<string, unknown>;
const texto = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

export const CANALES_ICAL = ['airbnb', 'booking', 'expedia', 'tripadvisor', 'google_vacation_rentals'] as const;
export type CanalIcal = (typeof CANALES_ICAL)[number];

/** Valor de `channel_connections.channel` (el que usa el Channel Manager del PMS). */
export const CANAL_EN_PMS: Record<CanalIcal, string> = {
  airbnb: 'airbnb',
  booking: 'booking',
  expedia: 'expedia',
  tripadvisor: 'tripadvisor',
  google_vacation_rentals: 'google_vacation',
};

const NOMBRE_CANAL: Record<CanalIcal, string> = {
  airbnb: 'Airbnb',
  booking: 'Booking.com',
  expedia: 'Expedia',
  tripadvisor: 'Tripadvisor',
  google_vacation_rentals: 'Google Vacation Rentals',
};

export const CONECTOR_OTA: Record<CanalOta, string> = { booking: 'booking_ota', expedia: 'expedia_ota' };

export function esCanalIcal(v: unknown): v is CanalIcal {
  return typeof v === 'string' && (CANALES_ICAL as readonly string[]).includes(v);
}

export interface Espacio {
  id: string;
  nombre: string;
  sucursal: string;
}

/** Espacios (habitaciones) de las sucursales de la organización. */
export async function espaciosDeLaOrganizacion(db: SupabaseClient, organizationId: number): Promise<Espacio[]> {
  const { data: sucursales, error } = await db.from('branches').select('id, name, organization_id').eq('organization_id', organizationId);
  if (error) throw new Error(`branches: ${error.message}`);
  const porId = new Map(
    ((sucursales as Fila[] | null) ?? [])
      .filter((b) => Number(b.organization_id) === organizationId)
      .map((b) => [Number(b.id), texto(b.name)]),
  );
  if (porId.size === 0) return [];
  const { data: espacios, error: errEsp } = await db.from('spaces').select('id, label, branch_id').in('branch_id', [...porId.keys()]);
  if (errEsp) throw new Error(`spaces: ${errEsp.message}`);
  return ((espacios as Fila[] | null) ?? [])
    .filter((s) => porId.has(Number(s.branch_id)))
    .map((s) => ({ id: texto(s.id), nombre: texto(s.label), sucursal: porId.get(Number(s.branch_id)) ?? '' }))
    .sort((a, b) => a.sucursal.localeCompare(b.sucursal, 'es') || a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
}

async function exigirEspacios(db: SupabaseClient, organizationId: number, ids: string[]): Promise<void> {
  const propios = new Set((await espaciosDeLaOrganizacion(db, organizationId)).map((e) => e.id));
  if (ids.some((id) => !propios.has(id))) throw new ConexionError(404, 'ESPACIO', 'Habitación no encontrada.');
}

function urlExportacion(token: unknown): string | null {
  const t = texto(token);
  const origen = origenPublico();
  return t && origen ? `${origen}/api/pms/ical/${t}` : null;
}

// ─── iCal ────────────────────────────────────────────────────────────────────

export interface EnlaceIcal {
  espacioId: string;
  urlImportacion: string | null;
  urlExportacion: string | null;
  ultimaSync: string | null;
  estadoSync: string | null;
  error: string | null;
}

export async function listarIcal(db: SupabaseClient, organizationId: number, canal: CanalIcal): Promise<{ espacios: Espacio[]; enlaces: EnlaceIcal[] }> {
  const espacios = await espaciosDeLaOrganizacion(db, organizationId);
  const { data, error } = await db
    .from('channel_connections')
    .select('space_id, organization_id, ical_import_url, ical_export_token, last_sync_at, last_sync_status, last_sync_error, connection_type')
    .eq('organization_id', organizationId)
    .eq('channel', CANAL_EN_PMS[canal]);
  if (error) throw new Error(`channel_connections: ${error.message}`);
  const enlaces = ((data as Fila[] | null) ?? [])
    .filter((c) => Number(c.organization_id) === organizationId)
    .map((c) => ({
      espacioId: texto(c.space_id),
      urlImportacion: texto(c.ical_import_url) || null,
      urlExportacion: urlExportacion(c.ical_export_token),
      ultimaSync: (c.last_sync_at as string | null) ?? null,
      estadoSync: (c.last_sync_status as string | null) ?? null,
      error: (c.last_sync_error as string | null) ?? null,
    }));
  return { espacios, enlaces };
}

async function asegurarConexion(
  db: SupabaseClient,
  actor: Actor,
  conectorCodigo: string,
  nombreBase: string,
  settings: Record<string, unknown>,
): Promise<string> {
  const { data: conector, error } = await db.from('integration_connectors').select('id, is_active').eq('code', conectorCodigo).maybeSingle();
  if (error) throw new Error(`integration_connectors: ${error.message}`);
  if (!conector || (conector as Fila).is_active === false) throw new ConexionError(409, 'SIN_CONECTOR', 'El canal no está disponible.');
  const conectorId = texto((conector as Fila).id);

  const { data: previas, error: errPrev } = await db
    .from('integration_connections')
    .select('id, organization_id, status, settings')
    .eq('organization_id', actor.organizationId)
    .eq('connector_id', conectorId)
    .neq('status', 'revoked')
    .limit(1);
  if (errPrev) throw new Error(`integration_connections: ${errPrev.message}`);
  const previa = ((previas as Fila[] | null) ?? []).find((c) => Number(c.organization_id) === actor.organizationId);
  const ahora = new Date().toISOString();
  if (previa) {
    const s = previa.settings && typeof previa.settings === 'object' && !Array.isArray(previa.settings) ? (previa.settings as Fila) : {};
    await db
      .from('integration_connections')
      .update({ status: 'connected', settings: { ...s, ...settings }, updated_at: ahora })
      .eq('id', texto(previa.id))
      .eq('organization_id', actor.organizationId);
    return texto(previa.id);
  }

  // `(organization_id, name)` es único: se numera si hace falta.
  let nombre = nombreBase;
  for (let n = 2; n < 20; n += 1) {
    const { data: dup } = await db.from('integration_connections').select('id').eq('organization_id', actor.organizationId).eq('name', nombre).limit(1);
    if (((dup as Fila[] | null) ?? []).length === 0) break;
    nombre = `${nombreBase} (${n})`;
  }
  const { data: nueva, error: errIns } = await db
    .from('integration_connections')
    .insert({
      organization_id: actor.organizationId,
      connector_id: conectorId,
      name: nombre,
      environment: 'production',
      status: 'connected',
      settings,
      connected_at: ahora,
      created_by: actor.userId,
    })
    .select('id')
    .single();
  if (errIns || !nueva) throw new Error(`integration_connections: ${errIns?.message ?? 'sin fila'}`);
  return texto((nueva as Fila).id);
}

export async function guardarIcal(
  db: SupabaseClient,
  actor: Actor,
  canal: CanalIcal,
  enlaces: { espacioId: string; urlImportacion: string }[],
  validarUrl: (url: string) => Promise<unknown>,
): Promise<{ conexionId: string; enlaces: { espacioId: string; urlExportacion: string | null }[] }> {
  if (enlaces.length === 0) throw new ConexionError(400, 'SIN_ENLACES', 'Relaciona al menos una habitación.');
  await exigirEspacios(db, actor.organizationId, enlaces.map((e) => e.espacioId));
  for (const e of enlaces) await validarUrl(e.urlImportacion);

  const ahora = new Date().toISOString();
  const { data, error } = await db
    .from('channel_connections')
    .upsert(
      enlaces.map((e) => ({
        organization_id: actor.organizationId,
        space_id: e.espacioId,
        channel: CANAL_EN_PMS[canal],
        connection_type: 'ical',
        ical_import_url: e.urlImportacion.trim(),
        sync_enabled: true,
        is_active: true,
        updated_at: ahora,
      })),
      { onConflict: 'organization_id,space_id,channel' },
    )
    .select('space_id, ical_export_token');
  if (error) throw new Error(`channel_connections: ${error.message}`);

  const conexionId = await asegurarConexion(db, actor, `${canal}_ical`, `${NOMBRE_CANAL[canal]} · iCal`, { canal, modo: 'ical' });
  return {
    conexionId,
    enlaces: ((data as Fila[] | null) ?? []).map((c) => ({ espacioId: texto(c.space_id), urlExportacion: urlExportacion(c.ical_export_token) })),
  };
}

// ─── API (Booking.com / Expedia) ─────────────────────────────────────────────

export function mensajeCuentaSocio(canal: CanalOta): string {
  const nombre = canal === 'booking' ? 'Booking.com' : 'Expedia';
  return `GO Admin aún no tiene cuenta de proveedor de conectividad con ${nombre}: el modo API no está disponible. Usa el calendario iCal mientras tanto.`;
}

export async function estadoOta(
  db: SupabaseClient,
  organizationId: number,
  canal: CanalOta,
): Promise<{ cuentaSocio: boolean; conexion: { id: string; propiedadId: string; estado: string } | null; espacios: Espacio[] }> {
  const { data: conector } = await db.from('integration_connectors').select('id').eq('code', CONECTOR_OTA[canal]).maybeSingle();
  let conexion: { id: string; propiedadId: string; estado: string } | null = null;
  if (conector) {
    const { data, error } = await db
      .from('integration_connections')
      .select('id, organization_id, status, settings')
      .eq('organization_id', organizationId)
      .eq('connector_id', texto((conector as Fila).id))
      .neq('status', 'revoked')
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(`integration_connections: ${error.message}`);
    const c = ((data as Fila[] | null) ?? []).find((x) => Number(x.organization_id) === organizationId);
    if (c) conexion = { id: texto(c.id), propiedadId: propiedadDeSettings(canal, c.settings), estado: texto(c.status) };
  }
  return { cuentaSocio: cuentaDeSocioConfigurada(canal), conexion, espacios: await espaciosDeLaOrganizacion(db, organizationId) };
}

/** Conexión OTA (API) de la organización; 404 si no existe, es de otra o no es de ese canal. */
export async function conexionOtaPropia(db: SupabaseClient, organizationId: number, conexionId: string): Promise<{ canal: CanalOta; propiedadId: string }> {
  const { data, error } = await db
    .from('integration_connections')
    .select('id, organization_id, connector_id, settings')
    .eq('id', conexionId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw new Error(`integration_connections: ${error.message}`);
  const c = data as Fila | null;
  if (!c || Number(c.organization_id) !== organizationId) throw new ConexionError(404, 'NO_ENCONTRADA', 'Conexión no encontrada.');
  const { data: con } = await db.from('integration_connectors').select('code').eq('id', texto(c.connector_id)).maybeSingle();
  const code = texto((con as Fila | null)?.code);
  const canal = (Object.keys(CONECTOR_OTA) as CanalOta[]).find((k) => CONECTOR_OTA[k] === code);
  if (!canal) throw new ConexionError(404, 'NO_ENCONTRADA', 'Conexión no encontrada.');
  return { canal, propiedadId: propiedadDeSettings(canal, c.settings) };
}

/** Relaciona habitaciones del canal con espacios del PMS (`channel_connections` en modo API). */
export async function guardarHabitaciones(
  db: SupabaseClient,
  organizationId: number,
  conexionId: string,
  relaciones: { espacioId: string; externoId: string }[],
): Promise<{ guardadas: number }> {
  const { canal, propiedadId } = await conexionOtaPropia(db, organizationId, conexionId);
  if (!propiedadId) throw new ConexionError(409, 'SIN_PROPIEDAD', 'La conexión no tiene alojamiento configurado.');
  await exigirEspacios(db, organizationId, relaciones.map((r) => r.espacioId));
  if (relaciones.length === 0) return { guardadas: 0 };
  const ahora = new Date().toISOString();
  const { error } = await db.from('channel_connections').upsert(
    relaciones.map((r) => ({
      organization_id: organizationId,
      space_id: r.espacioId,
      channel: canal,
      connection_type: 'api',
      external_property_id: propiedadId,
      external_room_id: r.externoId.trim(),
      sync_enabled: true,
      is_active: true,
      updated_at: ahora,
    })),
    { onConflict: 'organization_id,space_id,channel' },
  );
  if (error) throw new Error(`channel_connections: ${error.message}`);
  return { guardadas: relaciones.length };
}

export interface ServiciosOta {
  /** Crea la conexión API con el servicio del canal (credenciales de la cuenta de socio). */
  crear: (propiedadId: string) => Promise<{ success: boolean; connectionId?: string; message: string }>;
  /** Pide un token real al canal. */
  token: (connectionId: string) => Promise<string | null>;
}

/**
 * Modo API. Sin cuenta de socio → 409 CUENTA_SOCIO sin crear nada. Con ella: crea la conexión y la
 * verifica pidiendo un token real; si el canal no lo entrega, la conexión queda en `error` (nunca
 * `connected`).
 */
export async function crearConexionOta(
  db: SupabaseClient,
  organizationId: number,
  canal: CanalOta,
  propiedadId: string,
  servicios: ServiciosOta,
): Promise<{ conexionId: string; verificada: boolean }> {
  if (!cuentaDeSocioConfigurada(canal)) throw new ConexionError(409, 'CUENTA_SOCIO', mensajeCuentaSocio(canal));
  const propiedad = propiedadId.trim();
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(propiedad)) throw new ConexionError(400, 'PROPIEDAD', 'Identificador de alojamiento inválido.');
  const creada = await servicios.crear(propiedad);
  if (!creada.success || !creada.connectionId) {
    throw new ConexionError(creada.connectionId ? 409 : 400, creada.connectionId ? 'YA_EXISTE' : 'NO_CREADA', creada.message);
  }
  const conexionId = creada.connectionId;
  const token = await servicios.token(conexionId).catch(() => null);
  const ahora = new Date().toISOString();
  await db
    .from('integration_connections')
    .update(
      token
        ? { status: 'connected', last_health_check_at: ahora, last_error_message: null, updated_at: ahora }
        : { status: 'error', last_health_check_at: ahora, last_error_at: ahora, last_error_message: 'El canal no entregó un token con la cuenta de proveedor de conectividad.', updated_at: ahora },
    )
    .eq('id', conexionId)
    .eq('organization_id', organizationId);
  return { conexionId, verificada: !!token };
}
