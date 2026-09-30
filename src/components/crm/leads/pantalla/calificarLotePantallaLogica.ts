/**
 * «Calificar en lote» en la pantalla de Leads, sin React. Reutiliza el paso 1
 * (`QualifyLeadDialog`) y el paso 2 (`OpportunityForm Origen=lead`) del flujo
 * de un lead; aquí se arma el cuerpo de `POST /api/crm/leads/qualify-bulk`.
 */
import type { LeadFila } from '@/components/crm/kit/leadRowLogica';
import { MARCADOR_CLIENTE } from '@/lib/services/crm/calificarLoteLogica';
import { cuerpoCalificar } from './calificarLogica';

/** Valor del responsable «El de cada lead»: no se envía y el servidor usa el del lead. */
export const RESPONSABLE_DE_CADA_LEAD = '__cada_lead__';

/** Fase del diálogo en lote. */
export type FaseLote = 'datos' | 'formulario' | 'enviando' | 'resultado';

/**
 * Lead «plantilla» del paso 1: su nombre es el marcador, así el nombre
 * sugerido queda «<necesidad> · {cliente}». Su id (el primero del lote) solo
 * satisface la validación del formulario: el cuerpo lo quita.
 */
export function leadPlantillaLote(primerId: string): LeadFila {
  return { id: primerId, full_name: MARCADOR_CLIENTE, lead_source: null };
}

export interface CuerpoLote {
  customer_ids: string[];
  patron_nombre: string;
  plantilla: Record<string, unknown>;
}

/**
 * Cuerpo del lote desde el del formulario: el nombre pasa a ser el patrón; sin
 * cliente, origen ni organización (los fija el servidor). Lo que debe salir de
 * cada lead no se envía: el responsable «El de cada lead», y el monto (con su
 * moneda) si quedó en 0, para que cada lead conserve su valor estimado.
 */
export function cuerpoLote(cuerpo: Record<string, unknown>, ids: readonly string[]): CuerpoLote {
  const { name, ...resto } = cuerpoCalificar(cuerpo);
  const plantilla: Record<string, unknown> = { ...resto };
  if (plantilla.salesperson_id === RESPONSABLE_DE_CADA_LEAD) delete plantilla.salesperson_id;
  if (!plantilla.amount) {
    delete plantilla.amount;
    delete plantilla.currency;
  }
  if (plantilla.source === null) delete plantilla.source;
  return { customer_ids: Array.from(new Set(ids)), patron_nombre: typeof name === 'string' ? name : '', plantilla };
}

/** Avatares visibles del lote y cuántos quedan en «+N». */
export function avataresLote(leads: readonly LeadFila[], total: number, maximo = 5): { visibles: LeadFila[]; resto: number } {
  const visibles = leads.slice(0, maximo);
  return { visibles, resto: Math.max(0, total - visibles.length) };
}

/** Códigos de fallo con mensaje propio en `crm.pantallaLeads.lote.motivos`. */
const MOTIVOS = ['no_encontrado', 'no_es_lead', 'sin_permiso', 'sin_embudo_ventas', 'responsable_no_miembro', 'error_interno'] as const;
export type MotivoLote = (typeof MOTIVOS)[number] | 'otro';

export function motivoLote(codigo: string): MotivoLote {
  return (MOTIVOS as readonly string[]).includes(codigo) ? (codigo as MotivoLote) : 'otro';
}

/** Respuesta de `POST /api/crm/leads/qualify-bulk` (`data`). */
export interface ResultadoLote {
  creadas: Array<{ customer_id: string; opportunity_id: string | null; nombre: string }>;
  fallidas: Array<{ customer_id: string; nombre: string | null; codigo: string; mensaje: string }>;
}
