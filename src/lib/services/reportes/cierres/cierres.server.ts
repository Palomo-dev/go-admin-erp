/**
 * Cierres de periodo en el servidor (decisiones 4–8 del plan de reportes v2).
 *
 * Generar (o recalcular) un cierre:
 *   1. plan y alcance de sucursal de la sesión (`resolverAccesoReportes`);
 *   2. los reportes de la plantilla se ejecutan con el cliente de la SESIÓN:
 *      las `fn_reporte_*` aplican su guarda de pertenencia y de sucursal;
 *   3. el resultado se congela (`armarSnapshot`) y lo guarda `fn_cierre_guardar`
 *      con el service role —única vía de escritura—, que valida otra vez
 *      organización, sucursal, duplicado y versión, y pone el número.
 * La vista previa hace 1 y 2 y devuelve el resumen sin guardar nada.
 *
 * Firmar y reabrir llaman a sus RPC con el cliente de la sesión: el permiso
 * (`finance.approve`, `accounting.reverse`) y el alcance los decide la base.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createTranslator, type AbstractIntlMessages } from 'next-intl';
import { getServiceClient } from '@/lib/supabase/server-service';
import { defaultLocale, isValidLocale, type Locale } from '@/i18n/config';
import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import { exigirSucursalPermitida } from '@/lib/security/alcanceSucursal';
import { resolveTimezoneCascade } from '@/lib/utils/branchTimezoneCascade';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { resolverAccesoReportes, type SujetoReportes } from '../acceso.server';
import { cierreAExcel, type TextosCierreExcel } from '../exportarTabla';
import { registrarEventoReporte } from '../historialService';
import { ejecutarReportesSeleccionados } from '../reportesEngine';
import { GRUPOS } from '../reportesCatalogo';
import type { PeriodoCierre, ReportDefinition } from '../types';
import { armarSnapshot, idsDelSnapshot, leerSnapshot, reportesDePlantilla, type PlantillaCierre, type SnapshotCierre } from './snapshot';

/** Error de un cierre con código estable para la interfaz (y el id del cierre vigente si ya existe). */
export class ErrorCierre extends OrgContextError {
  constructor(message: string, statusCode: number, code: string, public readonly existente: string | null = null) {
    super(message, statusCode, code);
  }
}

interface ErrorRpc {
  code?: string;
  message?: string;
  details?: string | null;
}

const MENSAJES: Record<string, string> = {
  cierre_existente: 'Ya hay un cierre emitido para ese periodo y alcance: recalcúlalo para crear una versión nueva',
  cierre_firmado: 'El cierre está firmado: reábrelo antes de recalcular',
  cierre_ya_firmado: 'El cierre ya está firmado',
  cierre_reemplazado: 'Esa versión ya fue reemplazada',
  cierre_no_firmado: 'Solo se reabre un cierre firmado',
  cierre_distinto_periodo: 'Recalcular exige el mismo tipo, periodo y sucursal',
  cierre_incompleto: 'Faltan datos del cierre',
  motivo_requerido: 'Escribe el motivo de la reapertura (mínimo 5 caracteres)',
  cierre_no_encontrado: 'Cierre no encontrado',
  sin_permiso: 'No tienes permiso para esta acción',
  ORG_FORBIDDEN: 'Sin acceso a la organización',
  BRANCH_FORBIDDEN: 'No tienes acceso a esa sucursal',
  BRANCH_SCOPE_REQUIRED: 'Requiere acceso a todas las sucursales',
};

/** Traduce el error de una RPC de cierres a un `ErrorCierre` con su estado HTTP. */
export function errorDeRpcCierre(error: ErrorRpc): ErrorCierre {
  const clave = (error.message ?? '').trim();
  const mensaje = MENSAJES[clave];
  switch (error.code) {
    case '23505':
      return new ErrorCierre(MENSAJES.cierre_existente, 409, 'cierre_existente', error.details?.trim() || null);
    case '55000':
      return new ErrorCierre(mensaje ?? 'El cierre no admite esa acción en su estado', 409, clave || 'estado_invalido');
    case 'P0002':
      return new ErrorCierre(MENSAJES.cierre_no_encontrado, 404, 'no_encontrado');
    case '22023':
      return new ErrorCierre(mensaje ?? 'Datos inválidos', 400, clave || 'datos_invalidos');
    case '42501':
      return new ErrorCierre(mensaje ?? MENSAJES.sin_permiso, 403, clave || 'sin_permiso');
    default:
      console.error('[reportes/cierres] error de RPC', { codigo: error.code, mensaje: error.message });
      return new ErrorCierre('No se pudo completar la operación del cierre', 500, 'error_cierre');
  }
}

export interface EntradaCierre {
  periodo: PeriodoCierre;
  plantilla: PlantillaCierre;
  /** Solo con `personalizada`. */
  reportes?: string[];
  /** null = consolidado (exige acceso a todas las sucursales). */
  branchId: number | null;
  /** Id del cierre emitido que se recalcula. */
  reemplaza?: string | null;
  idioma?: string;
}

export interface ResumenCierre {
  capitulos: Array<{ grupo: string; titulo: string; reportes: Array<{ id: string; titulo: string }> }>;
  kpis: SnapshotCierre['kpisPortada'];
  errores: SnapshotCierre['errores'];
}

export interface CierreGuardado {
  id: string;
  numero: string;
  version: number;
  estado: string;
  resumen: ResumenCierre;
}

function resumir(s: SnapshotCierre): ResumenCierre {
  return {
    capitulos: s.capitulos.map((c) => ({ grupo: c.grupo, titulo: c.titulo, reportes: c.reportes.map((r) => ({ id: r.id, titulo: r.titulo })) })),
    kpis: s.kpisPortada,
    errores: s.errores,
  };
}

const CONCURRENCIA = 4;

/** Corre las definiciones: las de sucursal con la sucursal del cierre; las de toda la organización, sin ella. */
async function ejecutar(defs: ReportDefinition[], orgId: number, periodo: PeriodoCierre, branchId: number | null, client: SupabaseClient) {
  const deSucursal = defs.filter((d) => d.alcance === 'sucursal').map((d) => d.id);
  const deOrganizacion = defs.filter((d) => d.alcance === 'organizacion').map((d) => d.id);
  const [a, b] = await Promise.all([
    ejecutarReportesSeleccionados(deSucursal, orgId, periodo, CONCURRENCIA, branchId, client),
    ejecutarReportesSeleccionados(deOrganizacion, orgId, periodo, CONCURRENCIA, null, client),
  ]);
  return { resultados: [...a.resultados, ...b.resultados], errores: [...a.errores, ...b.errores] };
}

async function armar(sujeto: SujetoReportes, entrada: EntradaCierre): Promise<{ snapshot: SnapshotCierre; zona: string }> {
  const acceso = await resolverAccesoReportes(sujeto);
  exigirSucursalPermitida(acceso.alcance, entrada.branchId);
  const defs = reportesDePlantilla(entrada.plantilla, acceso.disponibles, entrada.reportes ?? []);
  if (defs.length === 0) throw new ErrorCierre('La plantilla no incluye ningún reporte disponible', 400, 'sin_reportes');

  const db = sujeto.supabase;
  const [ejecucion, moneda, orgRes, sucursalRes] = await Promise.all([
    ejecutar(defs, sujeto.organizationId, entrada.periodo, entrada.branchId, db),
    resolverContextoMoneda(db, sujeto.organizationId),
    db.from('organizations').select('timezone').eq('id', sujeto.organizationId).maybeSingle(),
    entrada.branchId
      ? db.from('branches').select('name, timezone').eq('id', entrada.branchId).eq('organization_id', sujeto.organizationId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const sucursal = sucursalRes.data as { name: string | null; timezone: string | null } | null;
  if (entrada.branchId && !sucursal) throw new ErrorCierre('No tienes acceso a esa sucursal', 403, 'BRANCH_FORBIDDEN');
  if (ejecucion.resultados.length === 0) throw new ErrorCierre('Ningún reporte del cierre se pudo calcular', 502, 'cierre_sin_datos');

  const zona = resolveTimezoneCascade({
    branchTimezone: sucursal?.timezone ?? null,
    organizationTimezone: (orgRes.data as { timezone?: string | null } | null)?.timezone ?? null,
  }).timezone;
  const snapshot = armarSnapshot({
    periodo: entrada.periodo,
    plantilla: entrada.plantilla,
    sucursal: entrada.branchId ? { id: entrada.branchId, nombre: sucursal?.name ?? `#${entrada.branchId}` } : null,
    moneda,
    definiciones: defs,
    grupos: GRUPOS,
    resultados: ejecucion.resultados,
    errores: ejecucion.errores,
    generadoEn: new Date().toISOString(),
  });
  return { snapshot, zona };
}

/** Ejecuta la plantilla y devuelve qué quedaría en el cierre, sin guardar. */
export async function vistaPreviaCierre(sujeto: SujetoReportes, entrada: EntradaCierre): Promise<ResumenCierre> {
  const { snapshot } = await armar(sujeto, entrada);
  return resumir(snapshot);
}

/** El service role es la única vía de `fn_cierre_guardar`. Si falta, se corta antes de calcular los reportes. */
function clienteDeGuardado(): SupabaseClient {
  try {
    return getServiceClient();
  } catch (err) {
    if (err instanceof Error && err.message.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      throw new ErrorCierre('No se pudo guardar el cierre', 503, 'servicio_no_configurado');
    }
    throw err;
  }
}

/** Genera y congela el cierre (o su versión nueva si `reemplaza`). */
export async function generarCierre(sujeto: SujetoReportes, entrada: EntradaCierre): Promise<CierreGuardado> {
  const servicio = clienteDeGuardado();
  const { snapshot, zona } = await armar(sujeto, entrada);
  const p = entrada.periodo;
  const { data, error } = await servicio.rpc('fn_cierre_guardar', {
    p_organization_id: sujeto.organizationId,
    p_usuario: sujeto.userId,
    p_datos: {
      tipo: p.tipo,
      plantilla: entrada.plantilla,
      fecha_inicio: p.fechaInicio,
      fecha_fin: p.fechaFin,
      hora_inicio: p.horaInicio ?? null,
      hora_fin: p.horaFin ?? null,
      branch_id: entrada.branchId,
      reportes: idsDelSnapshot(snapshot),
      snapshot,
      idioma: entrada.idioma ?? 'es',
      zona_horaria: zona,
    },
    p_reemplaza: entrada.reemplaza ?? null,
  });
  if (error) throw errorDeRpcCierre(error);
  const r = data as { id: string; numero: string; version: number; estado: string };
  return { ...r, resumen: resumir(snapshot) };
}

export async function firmarCierre(sujeto: Pick<SujetoReportes, 'supabase'>, id: string): Promise<{ id: string; estado: string; cierra_periodo: boolean; fiscal_period_id: string | null }> {
  const { data, error } = await sujeto.supabase.rpc('fn_cierre_firmar', { p_cierre: id });
  if (error) throw errorDeRpcCierre(error);
  return data as { id: string; estado: string; cierra_periodo: boolean; fiscal_period_id: string | null };
}

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface FilaExcel {
  numero: string;
  version: number;
  tipo: string;
  fecha_inicio: string;
  fecha_fin: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  branch_id: number | null;
  snapshot: unknown;
}

function horaCorta(valor: string | null): string | null {
  const m = /^(\d{2}:\d{2})/.exec(valor ?? '');
  return m ? m[1] : null;
}

type TraductorExcel = (clave: string, valores?: Record<string, string | number>) => string;

async function textosDelExcel(idioma: string | null | undefined): Promise<{ t: TraductorExcel; textos: TextosCierreExcel }> {
  const locale: Locale = idioma && isValidLocale(idioma) ? idioma : defaultLocale;
  const mod = (await import(`../../../../../messages/${locale}.json`)) as { default?: AbstractIntlMessages } & AbstractIntlMessages;
  const messages = (mod.default ?? mod) as AbstractIntlMessages;
  // El tipo global de next-intl no conoce estas claves hasta regenerarse: el
  // traductor se usa como función de texto, igual que en la exportación de membresías.
  const t = createTranslator({ locale, messages, namespace: 'reportes.cierreExcel' }) as unknown as TraductorExcel;
  const textos: TextosCierreExcel = {
    portada: t('portada'),
    indicador: t('indicador'),
    valor: t('valor'),
    capitulo: t('capitulo'),
    reportes: t('reportes'),
    errores: t('errores'),
    sinMovimientos: t('sinMovimientos'),
    sinFranja: t('sinFranja'),
    truncado: (mostradas, total) => t('truncado', { mostradas, total }),
  };
  return { t, textos };
}

/** Excel del cierre ya congelado. Lo lee la sesión (RLS de `report_closings`) y registra la exportación. */
export async function excelDelCierre(sujeto: SujetoReportes, id: string, idioma?: string | null): Promise<{ bytes: Uint8Array; nombre: string; tipo: string }> {
  const { data, error } = await sujeto.supabase
    .from('report_closings')
    .select('numero, version, tipo, fecha_inicio, fecha_fin, hora_inicio, hora_fin, branch_id, snapshot')
    .eq('id', id)
    .eq('organization_id', sujeto.organizationId)
    .maybeSingle();
  if (error || !data) throw new ErrorCierre('Cierre no encontrado', 404, 'no_encontrado');
  const fila = data as FilaExcel;
  const snapshot = leerSnapshot(fila.snapshot);
  if (!snapshot) throw new ErrorCierre('Este cierre no se puede exportar a Excel', 422, 'snapshot_invalido');

  const { t, textos } = await textosDelExcel(idioma);
  const desde = formatPlainDate(fila.fecha_inicio);
  const hasta = formatPlainDate(fila.fecha_fin);
  const lineas = [fila.numero, t('periodo', { desde, hasta }), t('sucursal', { nombre: snapshot.sucursal?.nombre ?? t('todas') })];
  const hi = horaCorta(fila.hora_inicio);
  const hf = horaCorta(fila.hora_fin);
  if (hi && hf) lineas.push(t('franja', { desde: hi, hasta: hf }));
  lineas.push(t('plantilla', { nombre: t(`plantillas.${snapshot.plantilla}`) }));

  const bytes = cierreAExcel(snapshot, textos, lineas);
  await registrarEventoReporte(sujeto.supabase, {
    organizationId: sujeto.organizationId,
    userId: sujeto.userId,
    reportId: `cierre-${fila.tipo}`,
    modulo: 'cierres',
    accion: 'exportar',
    filtros: { cierre_id: id, numero: fila.numero, version: fila.version, formato: 'excel' },
    branchId: fila.branch_id,
  });
  const base = `${fila.numero}-v${fila.version}`.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'cierre';
  return { bytes, nombre: `${base}.xlsx`, tipo: TIPO_XLSX };
}

export async function reabrirCierre(sujeto: Pick<SujetoReportes, 'supabase'>, id: string, motivo: string): Promise<{ id: string; estado: string }> {
  const { data, error } = await sujeto.supabase.rpc('fn_cierre_reabrir', { p_cierre: id, p_motivo: motivo });
  if (error) throw errorDeRpcCierre(error);
  return data as { id: string; estado: string };
}
