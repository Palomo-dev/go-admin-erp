/**
 * Llamadas del asistente de importación de leads a `POST /api/crm/leads/importar`.
 * La organización la decide el servidor (sesión); el header solo dice cuál es
 * la activa en esta pestaña y el servidor lo valida contra la membresía.
 */

import type { FilaLeadEntrada, OpcionesImportacionLeads, PoliticaMoneda, ResultadoFilaLead, ResumenImportacionLeads } from '@/lib/crm/importacionLeads/tipos';

export class ErrorImportacion extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ErrorImportacion';
  }
}

async function llamar<T>(orgId: number | undefined, cuerpo: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (orgId) headers['x-organization-id'] = String(orgId);
  const res = await fetch('/api/crm/leads/importar', { method: 'POST', headers, body: JSON.stringify(cuerpo) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ErrorImportacion(json.error || `HTTP ${res.status}`, res.status);
  return json;
}

export interface RespuestaValidacion {
  resultados: ResultadoFilaLead[];
  resumen: ResumenImportacionLeads;
  moneda: PoliticaMoneda;
}

export function validarLeads(orgId: number | undefined, filas: FilaLeadEntrada[], opciones: OpcionesImportacionLeads): Promise<RespuestaValidacion> {
  return llamar(orgId, { accion: 'validar', filas, opciones });
}

export function importarBloqueLeads(orgId: number | undefined, filas: FilaLeadEntrada[], opciones: OpcionesImportacionLeads): Promise<{ resultados: ResultadoFilaLead[]; resumen: ResumenImportacionLeads }> {
  return llamar(orgId, { accion: 'importar', filas, opciones });
}
