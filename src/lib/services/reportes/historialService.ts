/**
 * Historial del centro de reportes: quién abrió, exportó, envió o programó
 * cada reporte y con qué filtros (`report_executions.accion`).
 *
 * - Escribir: cada quien registra SUS eventos con el cliente de su sesión (la
 *   RLS exige `user_id = auth.uid()` y membresía activa). Los eventos de los
 *   cierres (emitir, recalcular, firmar, reabrir) los escribe la base dentro
 *   de las RPC, no esta capa.
 * - Leer: `fn_reportes_historial`. Con acceso a todas las sucursales ve todo
 *   el historial de la organización; si no, lo suyo y lo de sus sucursales.
 *
 * El registro es de mejor esfuerzo: si falla, se anota en consola y la acción
 * del usuario sigue (ver un reporte no puede romperse por el historial).
 */

import type { ReportesClient } from './types';

export const ACCIONES_HISTORIAL = ['ver', 'exportar', 'enviar', 'programar', 'emitir', 'recalcular', 'firmar', 'reabrir'] as const;
export type AccionHistorial = (typeof ACCIONES_HISTORIAL)[number];

export interface EventoReporte {
  organizationId: number;
  userId: string;
  reportId: string;
  modulo: string;
  accion: Extract<AccionHistorial, 'ver' | 'exportar' | 'enviar' | 'programar'>;
  filtros?: Record<string, unknown>;
  branchId?: number | null;
}

export async function registrarEventoReporte(client: ReportesClient, evento: EventoReporte): Promise<void> {
  const { error } = await client.from('report_executions').insert({
    organization_id: evento.organizationId,
    user_id: evento.userId,
    executed_by: evento.userId,
    module: evento.modulo,
    status: 'completed',
    report_id: evento.reportId,
    accion: evento.accion,
    params: evento.filtros ?? {},
    filters: evento.filtros ?? {},
    branch_id: evento.branchId ?? null,
  });
  if (error) console.warn('[reportes] no se registró el evento del historial', { accion: evento.accion, mensaje: error.message });
}

export interface FilaHistorial {
  id: string;
  report_id: string | null;
  accion: AccionHistorial;
  filtros: Record<string, unknown>;
  branch_id: number | null;
  sucursal: string | null;
  user_id: string;
  usuario: string | null;
  estado: string;
  created_at: string;
}

export async function leerHistorial(
  client: ReportesClient,
  organizationId: number,
  opciones: { limite?: number; antes?: string | null; reportId?: string | null } = {},
): Promise<FilaHistorial[]> {
  const { data, error } = await client.rpc('fn_reportes_historial', {
    p_organization_id: organizationId,
    p_limite: opciones.limite ?? 100,
    p_antes: opciones.antes ?? null,
    p_report_id: opciones.reportId ?? null,
  });
  if (error) throw new Error(`No se pudo leer el historial de reportes: ${error.message}`);
  return (data ?? []) as FilaHistorial[];
}
