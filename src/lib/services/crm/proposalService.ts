import { supabase } from '@/lib/supabase/config';
import { CotizacionesService, type Quotation } from '@/lib/services/cotizacionesService';
import type { ProposalSections } from '@/lib/services/crm/proposalNarrative';

/**
 * Servicio CRM (navegador) para propuestas = cotizaciones enlazadas a una
 * oportunidad (`quotations.opportunity_id` + `sections_json`).
 *
 * F10 (2026-09-15): la ÚNICA implementación de generar/editar/marcar enviada
 * vive en el servidor (`proposalServerService` tras `/api/crm/proposals`), con
 * la organización resuelta de la sesión. Este servicio solo LEE con la sesión
 * del usuario (RLS) y delega las escrituras a esas rutas: nada de segunda
 * implementación (regla 7). `sections_json` usa las cinco secciones canónicas
 * `situacion | problemas | solucion | roi | pricing` de `proposalNarrative`.
 *
 * Consumidores: `WonCloseModal` (getLatestProposalForOpportunity) y la
 * pestaña «Cierre» (vía `proposalApi`, que llama a las mismas rutas).
 */

export type { ProposalSections };

export interface Proposal extends Quotation {
  opportunity_id?: string | null;
  sections_json?: ProposalSections | null;
}

export interface GenerateProposalResult {
  quotationId: string;
  quotationNumber: string;
  isNew: boolean;
}

async function callProposalsApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: T; error?: string };
  if (!res.ok || json.success === false) throw new Error(json.error || `Error ${res.status}`);
  return json.data as T;
}

class ProposalService {
  /**
   * Genera (o reutiliza) la propuesta de una oportunidad. Delegado en
   * `POST /api/crm/proposals` (organización de la sesión, narrativa desde
   * discovery/objeciones/pricing).
   */
  async generateProposal(opportunityId: string): Promise<GenerateProposalResult> {
    const data = await callProposalsApi<{ id: string; number: string; isNew: boolean }>('/api/crm/proposals', {
      method: 'POST',
      body: JSON.stringify({ opportunity_id: opportunityId }),
    });
    return { quotationId: data.id, quotationNumber: data.number, isNew: data.isNew };
  }

  /** Cotización con sus secciones narrativas (lectura con sesión, RLS). */
  async getProposal(quotationId: string): Promise<Proposal | null> {
    try {
      const quotation = await CotizacionesService.getQuotationById(quotationId);
      if (!quotation) return null;
      const { data: extra } = await supabase
        .from('quotations')
        .select('opportunity_id, sections_json')
        .eq('id', quotationId)
        .maybeSingle();
      const extraData = extra as { opportunity_id?: string | null; sections_json?: ProposalSections | null } | null;
      return { ...quotation, opportunity_id: extraData?.opportunity_id ?? null, sections_json: extraData?.sections_json ?? null };
    } catch (err) {
      console.error('Error en proposalService.getProposal:', err);
      throw err;
    }
  }

  /** Edita secciones. Delegado en `PATCH /api/crm/proposals/[id]` (valida forma y organización). */
  async updateProposalSections(quotationId: string, sections: Partial<ProposalSections>): Promise<void> {
    await callProposalsApi(`/api/crm/proposals/${encodeURIComponent(quotationId)}`, { method: 'PATCH', body: JSON.stringify({ sections }) });
  }

  /** Vincula una cotización existente a una oportunidad (sesión, RLS). */
  async linkQuotationToOpportunity(quotationId: string, opportunityId: string): Promise<void> {
    const { error } = await supabase
      .from('quotations')
      .update({ opportunity_id: opportunityId, updated_at: new Date().toISOString() })
      .eq('id', quotationId);
    if (error) throw error;
  }

  /** Última cotización enlazada a la oportunidad (sesión, RLS) o null. */
  async getLatestProposalForOpportunity(opportunityId: string): Promise<Proposal | null> {
    try {
      const { data, error } = await supabase
        .from('quotations')
        .select('id')
        .eq('opportunity_id', opportunityId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      return await this.getProposal((data as { id: string }).id);
    } catch (err) {
      console.error('Error en proposalService.getLatestProposalForOpportunity:', err);
      return null;
    }
  }

  /**
   * Marca la propuesta como enviada (status `sent`, actividad «propuesta
   * enviada», `next_contact_at` +24 h). Delegado en `POST /api/crm/proposals/[id]/sent`.
   */
  async markProposalSent(quotationId: string, _opportunityId?: string): Promise<void> {
    await callProposalsApi(`/api/crm/proposals/${encodeURIComponent(quotationId)}/sent`, { method: 'POST', body: '{}' });
  }
}

export const proposalService = new ProposalService();
export default proposalService;
