/**
 * Lógica de `LeadRow` (Figma 759:444712). Sin React.
 *
 * D2: un lead es un cliente con `customers.lifecycle_stage = 'lead'`. Columnas
 * de `customers` (M1 de la ola 1, migración 20260930160300): `owner_id`,
 * `lead_source` (CHECK de catálogo), `lead_score` 0–100 (D3), `icp_band`,
 * `last_contact_at`, `lead_discarded_at`. `full_name` es GENERATED.
 */
import type { TonoBadge } from '@/components/kit/estadoTono';
import { LEAD_SOURCES, type LeadSource } from '@/lib/crm/enums';
import { diasDesde } from './fechasCrm';

/** Catálogo del CHECK `customers_lead_source_check` (M1), fuente única en `enums.ts` (guardarraíl 9). */
export const ORIGENES_LEAD = LEAD_SOURCES;
export type OrigenLead = LeadSource;

export function origenValido(v: string | null | undefined): OrigenLead | null {
  return (ORIGENES_LEAD as readonly string[]).includes(v ?? '') ? (v as OrigenLead) : null;
}

/** Fila de la tabla de Leads, con los nombres de la base. */
export interface LeadFila {
  id: string;
  full_name: string | null;
  customer_type?: 'person' | 'company' | string | null;
  email?: string | null;
  phone?: string | null;
  lead_source?: string | null;
  lead_score?: number | null;
  tags?: string[] | null;
  last_contact_at?: string | null;
  /** `owner_id` resuelto a nombre por la pantalla. */
  responsable?: { id: string; nombre: string; avatarUrl?: string | null } | null;
  avatar_url?: string | null;
}

export type BandaScore = 'alto' | 'medio' | 'bajo';

/** 70–100 alto · 40–69 medio · 0–39 bajo. */
export function bandaScore(score: number | null | undefined): BandaScore | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  if (score >= 70) return 'alto';
  if (score >= 40) return 'medio';
  return 'bajo';
}

export const TONO_BANDA: Record<BandaScore, TonoBadge> = { alto: 'exito', medio: 'advertencia', bajo: 'neutro' };

/** Etiquetas que caben en la celda (1 en el Figma) y cuántas quedan en «+N». */
export function etiquetasVisibles(tags: readonly string[] | null | undefined, maximo = 1): { visibles: string[]; resto: number } {
  const limpias = (tags ?? []).map((t) => t.trim()).filter(Boolean);
  return { visibles: limpias.slice(0, maximo), resto: Math.max(0, limpias.length - maximo) };
}

/** «ana@correo.co · 300 555 0142» (lo que haya). */
export function detalleContacto(lead: Pick<LeadFila, 'email' | 'phone'>): string {
  return [lead.email?.trim(), lead.phone?.trim()].filter(Boolean).join(' · ');
}

/** Último contacto: `null` = sin contacto; si no, días desde el contacto en la zona. */
export function diasSinContacto(lead: Pick<LeadFila, 'last_contact_at'>, ahora: Date, zona: string): number | null {
  return diasDesde(lead.last_contact_at, ahora, zona);
}

export type AccionLead = 'ver' | 'llamar' | 'whatsapp' | 'asignar' | 'etiquetar' | 'descartar';

export interface PermisosLead {
  editar?: boolean;
  asignar?: boolean;
  /** Calificar crea una oportunidad: `crm.leads.convert`. */
  convertir?: boolean;
}

/** Menú «⋯» del Figma: Ver detalle, Llamar, WhatsApp, Asignar responsable, Etiquetar, Descartar. */
export function accionesLead(lead: Pick<LeadFila, 'phone'>, permisos: PermisosLead = {}): AccionLead[] {
  const salida: AccionLead[] = ['ver'];
  if (lead.phone?.trim()) salida.push('llamar', 'whatsapp');
  if (permisos.asignar !== false) salida.push('asignar');
  if (permisos.editar !== false) salida.push('etiquetar', 'descartar');
  return salida;
}
