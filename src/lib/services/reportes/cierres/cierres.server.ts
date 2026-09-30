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
import { getServiceClient } from '@/lib/supabase/server-service';
import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import { exigirSucursalPermitida } from '@/lib/security/alcanceSucursal';
import { resolveTimezoneCascade } from '@/lib/utils/branchTimezoneCascade';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { resolverAccesoReportes, type SujetoReportes } from '../acceso.server';
import { ejecutarReportesSeleccionados } from '../reportesEngine';
import { GRUPOS } from '../reportesCatalogo';
import type { PeriodoCierre, ReportDefinition } from '../types';
import { armarSnapshot, idsDelSnapshot, reportesDePlantilla, type PlantillaCierre, type SnapshotCierre } from './snapshot';

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

/** Genera y congela el cierre (o su versión nueva si `reemplaza`). */
export async function generarCierre(sujeto: SujetoReportes, entrada: EntradaCierre): Promise<CierreGuardado> {
  const { snapshot, zona } = await armar(sujeto, entrada);
  const p = entrada.periodo;
  const { data, error } = await getServiceClient().rpc('fn_cierre_guardar', {
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

export async function reabrirCierre(sujeto: Pick<SujetoReportes, 'supabase'>, id: string, motivo: string): Promise<{ id: string; estado: string }> {
  const { data, error } = await sujeto.supabase.rpc('fn_cierre_reabrir', { p_cierre: id, p_motivo: motivo });
  if (error) throw errorDeRpcCierre(error);
  return data as { id: string; estado: string };
}
