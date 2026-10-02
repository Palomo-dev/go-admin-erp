import { LEAD_SOURCES, type LeadSource } from '@/lib/crm/enums';
import { clean } from './leadCustomer';
import type { CreateLeadBody, LeadCreateExtras } from './leadCreateService';

export const MANUAL_LEAD_SOURCE: LeadSource = 'manual';
const ALIAS_ORIGEN: Record<string, LeadSource> = {
  manual_erp: 'manual', website: 'web_form', web: 'web_form', formulario_web: 'web_form',
  referido: 'referral', importacion: 'import', whatsapp_qr: 'whatsapp',
  llamada_entrante: 'inbound_call', evento: 'event', correo: 'email', otro: 'other',
};
export function normalizarOrigenLead(source: string | null | undefined): LeadSource {
  const s = (source ?? '').trim().toLowerCase();
  if (!s) return MANUAL_LEAD_SOURCE;
  return (LEAD_SOURCES as readonly string[]).includes(s) ? s as LeadSource : ALIAS_ORIGEN[s] ?? 'other';
}
const sinNulos = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ''));

/** Preparación única de la ficha del lead, usada por alta manual, importación y conversión atómica. */
export function prepararDatosLead(
  ficha: { lead_source?: unknown; owner_id?: unknown; metadata?: unknown },
  body: CreateLeadBody, actor: string, owner: string | null, extras?: LeadCreateExtras,
  now: string = new Date().toISOString(),
): Record<string, unknown> {
  const metadata = ficha.metadata && typeof ficha.metadata === 'object' && !Array.isArray(ficha.metadata) ? ficha.metadata as Record<string, unknown> : {};
  const previo = metadata.lead && typeof metadata.lead === 'object' && !Array.isArray(metadata.lead) ? metadata.lead as Record<string, unknown> : {};
  const amount = body.amount == null ? null : Number(body.amount);
  const currency = clean(body.currency)?.toUpperCase() ?? null;
  return {
    lead_source: ficha.lead_source ?? normalizarOrigenLead(body.source), owner_id: ficha.owner_id ?? owner,
    metadata: { ...metadata, lead: { ...previo, ...sinNulos({
      titulo: clean(body.name), valor_estimado: amount !== null ? sinNulos({ monto: amount, moneda: currency }) : null,
      deal_type: clean(body.deal_type), temperatura: clean(body.temperature), proximo_contacto: clean(body.next_contact_at),
      cierre_esperado: clean(body.expected_close_date), origen_texto: clean(body.source), capturado_por: actor,
    }), ...(extras?.lead?.metadata ?? {}) } },
    lead_discarded_at: null, lead_discard_reason: null, lead_discarded_by: null, updated_at: now,
  };
}
