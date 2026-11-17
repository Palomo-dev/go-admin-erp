'use client';

/**
 * Nómina desde el navegador, SIEMPRE por `/api/hrm/nomina/**`: la organización y
 * el actor salen de la sesión en el servidor, el cálculo lo hace el motor del
 * servidor (ADR-003) y los permisos los decide la base. Aquí no se calcula nada.
 */
import { ErrorPersonas, pedir, useCarga } from '../personas/apiPersonas';
import type { AlertaNomina, FilaPeriodo, ItemColilla, PermisosNomina, EmbargoFuente } from './nominaLogica';

export { ErrorPersonas as ErrorNomina };

export const RUTA_NOMINA = '/app/hrm/nomina';
export const rutaPeriodo = (id: string) => `${RUTA_NOMINA}/periodos/${encodeURIComponent(id)}`;
export const rutaEmpleadoPeriodo = (id: string, vinculo: string) => `${rutaPeriodo(id)}/empleados/${encodeURIComponent(vinculo)}`;
export const rutaColilla = (id: string, vinculo: string) => `${rutaPeriodo(id)}/colillas/${encodeURIComponent(vinculo)}`;
export const rutaPrestamo = (id: string) => `${RUTA_NOMINA}/prestamos/${encodeURIComponent(id)}`;
export const RUTA_NUEVO_PRESTAMO = `${RUTA_NOMINA}/prestamos/nuevo`;

/* ── Respuestas ─────────────────────────────────────────────────────────── */

export interface EstadoPlan {
  estado: string;
  cuentas_a_crear: number;
  terceros_incompletos: number;
  preparada_at: string;
  aprobada_at: string | null;
}

export interface ResumenNomina {
  usuario_id: string;
  permisos: PermisosNomina;
  habilitada: boolean;
  plan: EstadoPlan | null;
  periodos: FilaPeriodo[];
}

export interface ColillaPeriodo {
  id: string;
  vinculo_id: string;
  nombre: string | null;
  sede_id: number | null;
  estado: string;
  devengado: number;
  deducciones: number;
  neto: number;
  costo_empleador: number | null;
  alertas: AlertaNomina[] | null;
  bases: Record<string, unknown> | null;
  items: ItemColilla[];
}

export interface VersionPeriodo {
  id: string;
  numero: number;
  tipo: 'calculo' | 'ajuste' | string;
  estado: string | null;
  motor: string | null;
  reemplazada_por: string | null;
  motivo: string | null;
  ejecutada: string | null;
  alertas: AlertaNomina[] | null;
}

export interface NovedadPeriodo {
  id: string;
  employment_id: string;
  concept_code: string;
  amount: number | null;
  quantity: number | null;
  description: string | null;
  status: string;
  tercero_nit: string | null;
  tercero_nombre: string | null;
}

export interface DetallePeriodo {
  periodo: {
    id: string;
    name: string | null;
    kind: 'ordinaria' | 'prima' | 'cesantias';
    frequency: string;
    period_start: string;
    period_end: string;
    payment_date: string | null;
    status: string;
    total_employees: number | null;
    total_gross: number | null;
    total_deductions: number | null;
    total_net: number | null;
    total_employer_cost: number | null;
    approved_at: string | null;
    updated_at: string | null;
  };
  nomina_habilitada: boolean;
  versiones: VersionPeriodo[];
  colillas: ColillaPeriodo[];
  novedades: NovedadPeriodo[];
}

export interface BloqueoCierreFila {
  codigo: string;
  cantidad?: number;
  estado?: string;
  faltan?: string[];
  severidad?: string;
  detalle?: Record<string, unknown>;
}

export interface RevisionPeriodo {
  usuario_id: string;
  permisos: PermisosNomina;
  habilitada: boolean;
  bloqueos: BloqueoCierreFila[];
  preliquidado_por: string | null;
  enviado_por: string | null;
  es_preparador: boolean;
  aprobacion: { id: string; estado: string; paso: number | null; solicitada: string | null; decidida: string | null } | null;
  ajustes: Array<{ id: string; numero: number; estado: string | null; motivo: string | null; ejecutado: string | null }>;
}

export interface PersonaNomina {
  vinculo_id: string;
  persona_id: string;
  nombre: string | null;
  cargo: string | null;
  area: string | null;
  sede: string | null;
  ingreso: string | null;
  estado: string;
}

export interface ConfiguracionNomina {
  permisos: PermisosNomina;
  habilitada: boolean;
  habilitada_desde: string | null;
  motivo: string | null;
  plan: {
    estado: string;
    preparada_at: string;
    aprobada_at: string | null;
    aprobada_empresa_por: string | null;
    aprobada_contador_por: string | null;
    cuentas_a_crear: Array<{ cuenta: string; nombre: string | null; cuenta_mayor: string | null; estado: string | null }>;
    bloqueos: unknown[];
    terceros_incompletos: Array<{ tercero: string; falta: string; vinculo_id: string | null; nombre: string | null }>;
  } | null;
  conceptos: Array<{
    codigo: string;
    nombre: string;
    tipo: string;
    salarial: boolean;
    prestacional: boolean;
    base_ss: boolean;
    cuenta_debito: string | null;
    cuenta_credito: string | null;
  }>;
}

export interface CuentaBancaria {
  id: number;
  nombre: string;
  banco: string | null;
  ultimos: string | null;
  moneda: string | null;
}

export interface ResultadoPreliquidacion {
  run_id: string;
  reutilizado: boolean;
  version?: number;
  totales: { empleados: number; devengado: number; deducciones: number; neto: number; costo_empleador: number };
  bloqueos: AlertaNomina[];
  solo_preliquidacion: boolean;
}

/* ── Lecturas ───────────────────────────────────────────────────────────── */

export const URL_RESUMEN = '/api/hrm/nomina';
export const urlPeriodo = (id: string) => `/api/hrm/nomina/periodos/${encodeURIComponent(id)}`;
export const urlRevision = (id: string) => `${urlPeriodo(id)}/revision`;

export function useResumenNomina() {
  return useCarga<ResumenNomina>(URL_RESUMEN);
}

export function usePeriodo(id: string | null) {
  return useCarga<DetallePeriodo>(id ? urlPeriodo(id) : null);
}

export function useRevision(id: string | null) {
  return useCarga<RevisionPeriodo>(id ? urlRevision(id) : null);
}

export function usePersonasNomina() {
  return useCarga<{ personas: PersonaNomina[] }>('/api/hrm/nomina/personas');
}

export function useEmbargos(activo: boolean) {
  return useCarga<{ embargos: EmbargoFuente[] }>(activo ? '/api/hrm/nomina/embargos' : null);
}

export function useConfiguracionNomina(activo = true) {
  return useCarga<ConfiguracionNomina>(activo ? '/api/hrm/nomina/configuracion' : null);
}

export function leerCuentasBancarias() {
  return pedir<{ cuentas: CuentaBancaria[] }>('/api/hrm/nomina/cuentas-bancarias');
}

/* ── Escrituras (cada una la valida la base) ────────────────────────────── */

export interface DatosPeriodoNuevo {
  tipo: 'ordinaria' | 'prima' | 'cesantias';
  frecuencia: 'weekly' | 'biweekly' | 'monthly';
  desde: string;
  hasta: string;
  fecha_pago: string | null;
  nombre: string | null;
}

export function crearPeriodo(datos: DatosPeriodoNuevo) {
  return pedir<{ id: string }>('/api/hrm/nomina/periodos', { metodo: 'POST', cuerpo: datos });
}

/** Preliquida o recalcula en el servidor: motor puro + RPC transaccional e idempotente. */
export function preliquidar(id: string) {
  return pedir<ResultadoPreliquidacion>(`${urlPeriodo(id)}/preliquidar`, { metodo: 'POST', cuerpo: {} });
}

export function enviarRevision(id: string) {
  return pedir<{ estado: string; aprobacion: string | null }>(urlRevision(id), { metodo: 'POST', cuerpo: {} });
}

export function cerrarPeriodo(id: string) {
  return pedir<Record<string, unknown>>(`${urlPeriodo(id)}/cerrar`, { metodo: 'POST', cuerpo: {} });
}

export function pagarPeriodo(id: string, datos: { cuenta_bancaria_id: number; fecha: string; referencia: string | null }) {
  return pedir<{ payment_id: string; total: number; colillas: number; comisiones_pagadas: number; comisiones_pendientes: string[] }>(
    `${urlPeriodo(id)}/pagar`,
    { metodo: 'POST', cuerpo: datos }
  );
}

export function contabilizarPeriodo(id: string) {
  return pedir<{ contabilizado: boolean; faltan?: unknown[] }>(`${urlPeriodo(id)}/contabilizar`, { metodo: 'POST', cuerpo: {} });
}

export function ajustarPeriodo(id: string, datos: { vinculo_id: string; motivo: string; novedades: Array<{ concepto: string; valor: number | null; cantidad: number | null }> }) {
  return pedir<Record<string, unknown>>(`${urlPeriodo(id)}/ajustes`, { metodo: 'POST', cuerpo: datos });
}

export async function eliminarPeriodo(id: string): Promise<void> {
  const r = await fetch(urlPeriodo(id), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}', cache: 'no-store' });
  if (!r.ok) {
    const d = (await r.json().catch(() => null)) as { code?: string } | null;
    throw new ErrorPersonas(r.status, d?.code ?? 'error_hrm');
  }
}

export interface ErrorArchivoBanco {
  vinculo_id: string;
  nombre: string | null;
  codigo: 'sin_cuenta' | 'sin_documento' | 'valor_invalido' | 'tipo_cuenta_invalido' | 'cuenta_invalida' | string;
}

export type ResultadoArchivo = { ok: true; nombre: string; blob: Blob } | { ok: false; errores: ErrorArchivoBanco[] };

/** Archivo del banco: con una fila mala la ruta responde 422 con los hallazgos y sin archivo. */
export async function archivoBanco(id: string, formato = 'csv_generico'): Promise<ResultadoArchivo> {
  const r = await fetch(`${urlPeriodo(id)}/archivo-banco`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formato }),
    cache: 'no-store',
  });
  if (r.status === 422) {
    const d = (await r.json().catch(() => null)) as { errores?: ErrorArchivoBanco[] } | null;
    return { ok: false, errores: Array.isArray(d?.errores) ? d.errores : [] };
  }
  if (!r.ok) {
    const d = (await r.json().catch(() => null)) as { code?: string } | null;
    throw new ErrorPersonas(r.status, d?.code ?? 'error_hrm');
  }
  const cd = r.headers.get('Content-Disposition') ?? '';
  const nombre = /filename="([^"]+)"/.exec(cd)?.[1] ?? 'nomina.csv';
  return { ok: true, nombre, blob: await r.blob() };
}

export function codigoDeError(e: unknown): string {
  return e instanceof ErrorPersonas ? e.codigo : 'error_hrm';
}

/** Cierra un ajuste (sus colillas quedan aprobadas y se asientan). `hr.payroll.close` y nómina encendida. */
export function cerrarAjuste(runId: string) {
  return pedir<Record<string, unknown>>(`/api/hrm/nomina/ajustes/${encodeURIComponent(runId)}/cerrar`, { metodo: 'POST', cuerpo: {} });
}
