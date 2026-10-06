/**
 * Servicio del editor del sitio V2 para lo que no es del núcleo (`siteDocumentService`):
 * revisión con documento, publicaciones programadas e instantáneas del borrador.
 *
 * Solo servidor y con el cliente de la SESIÓN (`ctx.supabase` de `withOrg`): la RLS de las tablas
 * comprueba pertenencia y `fn_website_tiene_permiso` (editar / publicar). Todas las consultas
 * filtran además por la organización de la sesión. Las tablas de programaciones e instantáneas
 * viven en migraciones PENDIENTES (`supabase/pendientes/website_publicaciones_programadas.sql` y
 * `website_instantaneas_borrador.sql`): mientras no se apliquen, estas funciones responden
 * `no_disponible` (503) y el editor apaga «Programar» y los guardados automáticos.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import {
  ErrorSitio,
  errorDesdePostgrest,
  guardarBorrador,
} from '@/lib/services/website/siteDocumentService';
import type { ResultadoGuardado } from '@/lib/website/v2/tipos';
import {
  LIMITES_PROGRAMACION,
  validarFechaProgramacion,
  type InstantaneaBorrador,
  type MotivoInstantanea,
  type ProgramacionPublicacion,
  type RevisionConDocumento,
} from '@/lib/website/v2/tiposEditor';

interface ErrorPg {
  code?: string;
  message?: string;
  details?: string | null;
}

/** La tabla no existe aún (migración pendiente): 42P01 en Postgres, PGRST205 en PostgREST. */
function tablaPendiente(error: ErrorPg): boolean {
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|Could not find the table/i.test(error.message ?? '');
}

function noDisponible(): ErrorSitio {
  return new ErrorSitio('no_disponible', 'Esta función del editor todavía no está activa.');
}

async function exigirSitio(cliente: SupabaseClient, org: number, sitioId: string): Promise<void> {
  const { data, error } = await cliente
    .from('website_site_states')
    .select('id')
    .eq('id', sitioId)
    .eq('organization_id', org)
    .maybeSingle();
  if (error) throw errorDesdePostgrest(error, 'editorSitio.exigirSitio');
  if (!data) throw new ErrorSitio('sitio_no_encontrado', 'El sitio no existe en esta organización.');
}

async function nombres(cliente: SupabaseClient, ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = Array.from(new Set(ids.filter((x): x is string => Boolean(x))));
  const r = new Map<string, string>();
  if (unicos.length === 0) return r;
  const { data } = await cliente.from('profiles').select('id, first_name, last_name').in('id', unicos);
  for (const p of (data ?? []) as { id: string; first_name: string | null; last_name: string | null }[]) {
    const nombre = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    if (nombre) r.set(p.id, nombre);
  }
  return r;
}

// ─── Revisión con documento ─────────────────────────────────────────────────────────────────

export async function obtenerRevision(
  cliente: SupabaseClient,
  org: number,
  sitioId: string,
  revisionId: string,
): Promise<RevisionConDocumento> {
  await exigirSitio(cliente, org, sitioId);
  const { data, error } = await cliente
    .from('website_site_revisions')
    .select('id, revision_number, note, published_at, published_by, document')
    .eq('id', revisionId)
    .eq('site_state_id', sitioId)
    .eq('organization_id', org)
    .maybeSingle();
  if (error) throw errorDesdePostgrest(error, 'editorSitio.obtenerRevision');
  if (!data) throw new ErrorSitio('revision_no_encontrada', 'La versión no existe en este sitio.');
  const fila = data as { id: string; revision_number: number; note: string | null; published_at: string; published_by: string | null; document: unknown };
  const validacion = validarDocumentoSitio(fila.document);
  const autores = await nombres(cliente, [fila.published_by]);
  return {
    id: fila.id,
    numero: fila.revision_number,
    nota: fila.note,
    publicadaEn: fila.published_at,
    autor: fila.published_by ? autores.get(fila.published_by) ?? null : null,
    documento: (validacion.ok ? validacion.documento : fila.document) as DocumentoSitio,
  };
}

// ─── Publicaciones programadas ─────────────────────────────────────────────────────────────

interface FilaProgramacion {
  id: string;
  run_at: string;
  expected_version: number;
  note: string | null;
  status: ProgramacionPublicacion['estado'];
  error: string | null;
  created_at: string;
}

const COLUMNAS_PROGRAMACION = 'id, run_at, expected_version, note, status, error, created_at';

function programacion(f: FilaProgramacion): ProgramacionPublicacion {
  return {
    id: f.id,
    ejecutarEn: f.run_at,
    version: f.expected_version,
    nota: f.note,
    estado: f.status,
    error: f.error,
    creadaEn: f.created_at,
  };
}

/** Programaciones recientes del sitio (la pendiente, si hay, primero). */
export async function listarProgramaciones(cliente: SupabaseClient, org: number, sitioId: string): Promise<ProgramacionPublicacion[]> {
  await exigirSitio(cliente, org, sitioId);
  const { data, error } = await cliente
    .from('website_site_scheduled_publications')
    .select(COLUMNAS_PROGRAMACION)
    .eq('site_state_id', sitioId)
    .eq('organization_id', org)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) {
    if (tablaPendiente(error)) throw noDisponible();
    throw errorDesdePostgrest(error, 'editorSitio.listarProgramaciones');
  }
  const filas = ((data ?? []) as FilaProgramacion[]).map(programacion);
  return [...filas.filter((p) => p.estado === 'pendiente'), ...filas.filter((p) => p.estado !== 'pendiente')];
}

export async function programarPublicacion(
  cliente: SupabaseClient,
  org: number,
  sitioId: string,
  entrada: { version: number; ejecutarEn: string; nota: string | null },
): Promise<ProgramacionPublicacion> {
  if (!Number.isInteger(entrada.version) || entrada.version < 1) throw new ErrorSitio('peticion_invalida', 'Falta la versión del borrador.');
  const cuando = new Date(entrada.ejecutarEn);
  const validez = validarFechaProgramacion(cuando);
  if (validez !== 'ok') {
    throw new ErrorSitio('peticion_invalida', validez === 'muy_lejana' ? 'Programa dentro del próximo año.' : 'Elige una fecha y hora futuras.', { codigo: validez });
  }
  if (entrada.nota !== null && entrada.nota.length > LIMITES_PROGRAMACION.nota) {
    throw new ErrorSitio('peticion_invalida', 'La nota admite hasta 500 caracteres.');
  }
  await exigirSitio(cliente, org, sitioId);
  const { data: borrador, error: errB } = await cliente
    .from('website_site_drafts')
    .select('version')
    .eq('site_state_id', sitioId)
    .eq('organization_id', org)
    .maybeSingle();
  if (errB) throw errorDesdePostgrest(errB, 'editorSitio.programar.borrador');
  const actual = (borrador as { version: number } | null)?.version;
  if (actual !== entrada.version) {
    throw new ErrorSitio('conflicto_version', 'Alguien guardó una versión más nueva del borrador.', { esperada: entrada.version, actual: actual ?? null });
  }
  // Una sola pendiente por sitio (índice único parcial): la anterior se cancela primero.
  const { error: errC } = await cliente
    .from('website_site_scheduled_publications')
    .update({ status: 'cancelada', processed_at: new Date().toISOString() })
    .eq('site_state_id', sitioId)
    .eq('organization_id', org)
    .eq('status', 'pendiente');
  if (errC) {
    if (tablaPendiente(errC)) throw noDisponible();
    throw errorDesdePostgrest(errC, 'editorSitio.programar.cancelarPrevia');
  }
  const { data, error } = await cliente
    .from('website_site_scheduled_publications')
    .insert({
      organization_id: org,
      site_state_id: sitioId,
      expected_version: entrada.version,
      run_at: cuando.toISOString(),
      note: entrada.nota && entrada.nota.trim() ? entrada.nota.trim() : null,
    })
    .select(COLUMNAS_PROGRAMACION)
    .single();
  if (error) {
    if (tablaPendiente(error)) throw noDisponible();
    throw errorDesdePostgrest(error, 'editorSitio.programar');
  }
  return programacion(data as FilaProgramacion);
}

export async function cancelarProgramacion(cliente: SupabaseClient, org: number, sitioId: string, id: string): Promise<void> {
  await exigirSitio(cliente, org, sitioId);
  const { data, error } = await cliente
    .from('website_site_scheduled_publications')
    .update({ status: 'cancelada', processed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('site_state_id', sitioId)
    .eq('organization_id', org)
    .eq('status', 'pendiente')
    .select('id');
  if (error) {
    if (tablaPendiente(error)) throw noDisponible();
    throw errorDesdePostgrest(error, 'editorSitio.cancelarProgramacion');
  }
  if (!data || (data as unknown[]).length === 0) throw new ErrorSitio('peticion_invalida', 'La publicación ya no está programada.');
}

// ─── Instantáneas del borrador ──────────────────────────────────────────────────────────────

interface FilaInstantanea {
  id: string;
  version: number;
  reason: MotivoInstantanea;
  created_at: string;
  created_by: string | null;
}

export async function listarInstantaneas(cliente: SupabaseClient, org: number, sitioId: string, limite = 20): Promise<InstantaneaBorrador[]> {
  await exigirSitio(cliente, org, sitioId);
  const { data, error } = await cliente
    .from('website_site_draft_snapshots')
    .select('id, version, reason, created_at, created_by')
    .eq('site_state_id', sitioId)
    .eq('organization_id', org)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limite, 1), 50));
  if (error) {
    if (tablaPendiente(error)) throw noDisponible();
    throw errorDesdePostgrest(error, 'editorSitio.listarInstantaneas');
  }
  const filas = (data ?? []) as FilaInstantanea[];
  const autores = await nombres(cliente, filas.map((f) => f.created_by));
  return filas.map((f) => ({
    id: f.id,
    version: f.version,
    motivo: f.reason,
    creadaEn: f.created_at,
    autor: f.created_by ? autores.get(f.created_by) ?? null : null,
  }));
}

const MOTIVOS: readonly MotivoInstantanea[] = ['autoguardado', 'descartado', 'antes_de_restaurar'];

export async function crearInstantanea(
  cliente: SupabaseClient,
  org: number,
  sitioId: string,
  entrada: { documento: unknown; version: number; motivo: MotivoInstantanea },
): Promise<InstantaneaBorrador> {
  if (!MOTIVOS.includes(entrada.motivo)) throw new ErrorSitio('peticion_invalida', 'Motivo de la instantánea no válido.');
  const validacion = validarDocumentoSitio(entrada.documento);
  if (!validacion.ok) throw new ErrorSitio('documento_invalido', 'El documento no cumple el contrato.', validacion.errores);
  await exigirSitio(cliente, org, sitioId);
  const { data, error } = await cliente
    .from('website_site_draft_snapshots')
    .insert({
      organization_id: org,
      site_state_id: sitioId,
      version: Math.max(1, Math.floor(entrada.version)),
      document: validacion.documento,
      reason: entrada.motivo,
    })
    .select('id, version, reason, created_at, created_by')
    .single();
  if (error) {
    if (tablaPendiente(error)) throw noDisponible();
    throw errorDesdePostgrest(error, 'editorSitio.crearInstantanea');
  }
  const f = data as FilaInstantanea;
  return { id: f.id, version: f.version, motivo: f.reason, creadaEn: f.created_at, autor: null };
}

/** Copia una instantánea al borrador (compare-and-swap, como restaurar una revisión). */
export async function restaurarInstantanea(
  cliente: SupabaseClient,
  org: number,
  sitioId: string,
  instantaneaId: string,
  versionEsperada: number,
): Promise<ResultadoGuardado> {
  await exigirSitio(cliente, org, sitioId);
  const { data, error } = await cliente
    .from('website_site_draft_snapshots')
    .select('document')
    .eq('id', instantaneaId)
    .eq('site_state_id', sitioId)
    .eq('organization_id', org)
    .maybeSingle();
  if (error) {
    if (tablaPendiente(error)) throw noDisponible();
    throw errorDesdePostgrest(error, 'editorSitio.restaurarInstantanea');
  }
  if (!data) throw new ErrorSitio('revision_no_encontrada', 'El guardado automático no existe en este sitio.');
  return guardarBorrador(cliente, org, sitioId, (data as { document: unknown }).document, versionEsperada);
}
