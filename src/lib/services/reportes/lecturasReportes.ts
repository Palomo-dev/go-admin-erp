'use client';

/**
 * Lecturas y escrituras del navegador del centro de reportes, con la sesión
 * del usuario (RLS) y la organización activa:
 * - Favoritos y recientes: `saved_reports`, personales (`auth.uid() = user_id`
 *   y miembro activo). Una fila por reporte: el UNIQUE parcial
 *   `(organization_id, user_id, report_id)` no sirve a `onConflict` de
 *   PostgREST, así que se lee y luego se inserta o actualiza.
 * - Cierres: `report_closings` (solo lectura; se escribe por las rutas). La
 *   RLS ya aplica el alcance de sucursal: el consolidado solo lo ve quien
 *   tiene acceso a todas.
 */
import { supabase } from '@/lib/supabase/config';
import { nombreDePerfil } from './programados/programacion';
import { getReporteById } from './reportesCatalogo';

// ── Favoritos y recientes ───────────────────────────────────────────────

/** Filtros que se recuerdan del visor (los mismos parámetros de la URL). */
export type FiltrosRecordados = Record<string, string>;

export interface ReporteGuardado {
  id: string;
  reportId: string;
  favorito: boolean;
  filtros: FiltrosRecordados;
  usadoEn: string | null;
}

interface FilaGuardado {
  id: string;
  report_id: string;
  is_favorite: boolean | null;
  last_filters: unknown;
  last_used_at: string | null;
}

function filtrosDe(valor: unknown): FiltrosRecordados {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
  return Object.fromEntries(Object.entries(valor as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as FiltrosRecordados;
}

/**
 * Comparte una promesa mientras está en vuelo: varias pantallas que piden lo
 * mismo en el mismo montaje (el contador de la pestaña y «Recientes», por
 * ejemplo) hacen una sola petición. No es caché: al resolverse se olvida.
 */
export function compartirEnVuelo<K, T>(enVuelo: Map<K, Promise<T>>, clave: K, crear: () => Promise<T>): Promise<T> {
  const existente = enVuelo.get(clave);
  if (existente) return existente;
  const p = crear().finally(() => enVuelo.delete(clave));
  enVuelo.set(clave, p);
  return p;
}

type UsuarioSesion = { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null } | null;
const usuarioEnVuelo = new Map<'yo', Promise<UsuarioSesion>>();

/** Usuario de la sesión (`auth.getUser`, validado por el servidor de Auth), una petición por montaje. */
export function usuarioDeSesion(): Promise<UsuarioSesion> {
  return compartirEnVuelo(usuarioEnVuelo, 'yo', async () => (await supabase.auth.getUser()).data.user ?? null);
}

async function usuarioActual(): Promise<string> {
  const id = (await usuarioDeSesion())?.id;
  if (!id) throw new Error('Sin sesión');
  return id;
}

export const MAX_GUARDADOS = 200;

const guardadosEnVuelo = new Map<number, Promise<ReporteGuardado[]>>();

/** Favoritos y recientes de la persona, el más reciente primero. */
export function listarGuardados(orgId: number): Promise<ReporteGuardado[]> {
  return compartirEnVuelo(guardadosEnVuelo, orgId, () => leerGuardados(orgId));
}

async function leerGuardados(orgId: number): Promise<ReporteGuardado[]> {
  const userId = await usuarioActual();
  const { data, error } = await supabase
    .from('saved_reports')
    .select('id, report_id, is_favorite, last_filters, last_used_at')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .not('report_id', 'is', null)
    .order('last_used_at', { ascending: false, nullsFirst: false })
    .limit(MAX_GUARDADOS);
  if (error) throw new Error(`No se pudieron leer los favoritos: ${error.message}`);
  return ((data ?? []) as FilaGuardado[])
    .filter((f) => !!getReporteById(f.report_id))
    .map((f) => ({ id: f.id, reportId: f.report_id, favorito: f.is_favorite === true, filtros: filtrosDe(f.last_filters), usadoEn: f.last_used_at }));
}

async function guardar(orgId: number, reportId: string, cambios: { is_favorite?: boolean; last_filters?: FiltrosRecordados; last_used_at?: string }): Promise<void> {
  const def = getReporteById(reportId);
  if (!def) return;
  const userId = await usuarioActual();
  const { data, error } = await supabase
    .from('saved_reports')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .eq('report_id', reportId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el favorito: ${error.message}`);
  const id = (data as { id?: string } | null)?.id;
  const escritura = id
    ? supabase.from('saved_reports').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id)
    : supabase.from('saved_reports').insert({
        organization_id: orgId,
        user_id: userId,
        report_id: reportId,
        name: def.titulo,
        module: def.modulo,
        is_favorite: cambios.is_favorite ?? false,
        last_filters: cambios.last_filters ?? {},
        last_used_at: cambios.last_used_at ?? null,
      });
  const { error: errorEscritura } = await escritura;
  if (errorEscritura) throw new Error(`No se pudo guardar el favorito: ${errorEscritura.message}`);
}

export function marcarFavorito(orgId: number, reportId: string, favorito: boolean): Promise<void> {
  return guardar(orgId, reportId, { is_favorite: favorito });
}

/** El visor lo llama al abrir un reporte: alimenta «Recientes» y los últimos filtros del favorito. */
export function recordarUso(orgId: number, reportId: string, filtros: FiltrosRecordados): Promise<void> {
  return guardar(orgId, reportId, { last_filters: filtros, last_used_at: new Date().toISOString() });
}

// ── Cierres ─────────────────────────────────────────────────────────────

export type EstadoCierre = 'borrador' | 'emitido' | 'firmado' | 'reemplazado';

export interface FilaCierre {
  id: string;
  numero: string;
  version: number;
  tipo: string;
  plantilla: string;
  fechaInicio: string;
  fechaFin: string;
  horaInicio: string | null;
  horaFin: string | null;
  sucursalId: number | null;
  sucursal: string | null;
  reportes: string[];
  estado: EstadoCierre;
  reemplazaA: string | null;
  reemplazadoPor: string | null;
  emitidoPor: string | null;
  emitidoEn: string | null;
  firmadoPor: string | null;
  firmadoEn: string | null;
  cierraPeriodo: boolean;
  reabiertoPor: string | null;
  reabiertoEn: string | null;
  motivoReapertura: string | null;
  creadoEn: string;
}

interface FilaCierreBd {
  id: string;
  numero: string;
  version: number;
  tipo: string;
  plantilla: string;
  fecha_inicio: string;
  fecha_fin: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  branch_id: number | null;
  branches: { name: string | null } | { name: string | null }[] | null;
  reportes: string[] | null;
  estado: EstadoCierre;
  reemplaza_a: string | null;
  reemplazado_por: string | null;
  emitido_por: string | null;
  emitido_en: string | null;
  firmado_por: string | null;
  firmado_en: string | null;
  fiscal_period_id: string | null;
  reabierto_por: string | null;
  reabierto_en: string | null;
  motivo_reapertura: string | null;
  created_at: string;
}

const COLUMNAS_CIERRE =
  'id, numero, version, tipo, plantilla, fecha_inicio, fecha_fin, hora_inicio, hora_fin, branch_id, branches(name), reportes, estado, reemplaza_a, reemplazado_por, emitido_por, emitido_en, firmado_por, firmado_en, fiscal_period_id, reabierto_por, reabierto_en, motivo_reapertura, created_at';

export const MAX_CIERRES = 300;

/**
 * Cierres vigentes (todo lo que no está `reemplazado`), para el contador de
 * la pestaña. Solo cuenta: no baja las filas ni los perfiles de quien firmó.
 */
export async function contarCierresVigentes(orgId: number): Promise<number> {
  const { count, error } = await supabase
    .from('report_closings')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .neq('estado', 'reemplazado');
  if (error) throw new Error(`No se pudieron contar los cierres: ${error.message}`);
  return count ?? 0;
}

/** `HH:mm:ss` de la columna `time` → `HH:mm`. */
const hora = (v: string | null) => (v ? v.slice(0, 5) : null);

/** Cierres de la organización (todas las versiones), el más reciente primero, con el nombre de quien emitió y firmó. */
export async function listarCierres(orgId: number): Promise<FilaCierre[]> {
  const { data, error } = await supabase
    .from('report_closings')
    .select(COLUMNAS_CIERRE)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(MAX_CIERRES);
  if (error) throw new Error(`No se pudieron leer los cierres: ${error.message}`);
  const filas = (data ?? []) as unknown as FilaCierreBd[];
  const ids = [...new Set(filas.flatMap((f) => [f.emitido_por, f.firmado_por, f.reabierto_por]).filter((x): x is string => !!x))];
  const nombres = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: perfiles } = await supabase.from('profiles').select('id, first_name, last_name, email').in('id', ids);
    for (const p of (perfiles ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>) {
      nombres.set(p.id, nombreDePerfil(p));
    }
  }
  const nombre = (id: string | null) => (id ? (nombres.get(id) ?? null) : null);
  return filas.map((f) => {
    const sucursal = Array.isArray(f.branches) ? (f.branches[0] ?? null) : f.branches;
    return {
      id: f.id,
      numero: f.numero,
      version: f.version,
      tipo: f.tipo,
      plantilla: f.plantilla,
      fechaInicio: f.fecha_inicio,
      fechaFin: f.fecha_fin,
      horaInicio: hora(f.hora_inicio),
      horaFin: hora(f.hora_fin),
      sucursalId: f.branch_id,
      sucursal: sucursal?.name ?? null,
      reportes: f.reportes ?? [],
      estado: f.estado,
      reemplazaA: f.reemplaza_a,
      reemplazadoPor: f.reemplazado_por,
      emitidoPor: nombre(f.emitido_por),
      emitidoEn: f.emitido_en,
      firmadoPor: nombre(f.firmado_por),
      firmadoEn: f.firmado_en,
      cierraPeriodo: !!f.fiscal_period_id,
      reabiertoPor: nombre(f.reabierto_por),
      reabiertoEn: f.reabierto_en,
      motivoReapertura: f.motivo_reapertura,
      creadoEn: f.created_at,
    };
  });
}
