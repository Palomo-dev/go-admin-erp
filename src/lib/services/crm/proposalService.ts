import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { CotizacionesService, type Quotation, type QuotationItem } from '@/lib/services/cotizacionesService';

/**
 * Servicio CRM para generación de propuestas (cotizaciones narradas).
 *
 * Una propuesta es una cotización vinculada a una oportunidad (quotations.opportunity_id)
 * con secciones narrativas editables almacenadas en quotations.sections_json (JSONB).
 *
 * Secciones narrativas (sections_json):
 *   - situacion_actual
 *   - problemas
 *   - solucion
 *   - roi_estimado
 *   - proximo_paso
 *
 * Reusa CotizacionesService existente (generateQuotationNumber, getQuotationById).
 * No crea tablas nuevas: aprovecha quotations.opportunity_id y sections_json (FASE 1).
 *
 * Tablas: quotations, quotation_items, opportunities, opportunity_products
 */

export interface ProposalSections {
  situacion_actual: string;
  problemas: string;
  solucion: string;
  roi_estimado: string;
  proximo_paso: string;
}

export interface Proposal extends Quotation {
  opportunity_id?: string | null;
  sections_json?: ProposalSections | null;
}

export interface GenerateProposalResult {
  quotationId: string;
  quotationNumber: string;
  isNew: boolean;
}

class ProposalService {
  private getOrgId(): number {
    return getOrganizationId();
  }

  /**
   * Devuelve las secciones narrativas por defecto con placeholders editables.
   */
  private getDefaultSections(opportunityName: string): ProposalSections {
    return {
      situacion_actual: `El cliente actualmente gestiona ${opportunityName} con procesos manuales que limitan la visibilidad operativa.`,
      problemas: '',
      solucion: '',
      roi_estimado: '',
      proximo_paso: 'Enviar propuesta y agendar llamada de seguimiento en 48h.',
    };
  }

  /**
   * Genera una propuesta (cotización narrada) desde una oportunidad.
   *
   * 1. Obtiene la oportunidad y sus productos (opportunity_products).
   * 2. Si ya existe una cotización vinculada (opportunity_id), la reutiliza.
   * 3. Si no, crea una nueva cotización con:
   *    - Líneas prefilled desde opportunity_products.
   *    - sections_json con secciones narrativas por defecto.
   *    - opportunity_id vinculado.
   *
   * @param opportunityId - ID de la oportunidad
   * @returns ID de la cotización creada/reutilizada y número
   */
  async generateProposal(opportunityId: string): Promise<GenerateProposalResult> {
    try {
      const orgId = this.getOrgId();
      if (!orgId) {
        throw new Error('No se pudo obtener la organización activa');
      }

      // 1. Obtener la oportunidad
      const { data: opp, error: oppError } = await supabase
        .from('opportunities')
        .select('id, name, customer_id, amount, currency, salesperson_id, pipeline_id')
        .eq('id', opportunityId)
        .maybeSingle();

      if (oppError || !opp) {
        throw new Error('No se encontró la oportunidad especificada');
      }

      const opportunity = opp as {
        id: string;
        name: string;
        customer_id: string | null;
        amount: number;
        currency: string;
        salesperson_id: string | null;
        pipeline_id: string;
      };

      // 2. Verificar si ya existe una cotización vinculada a esta oportunidad
      const { data: existingQuot } = await supabase
        .from('quotations')
        .select('id, number')
        .eq('opportunity_id', opportunityId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingQuot) {
        return {
          quotationId: (existingQuot as { id: string }).id,
          quotationNumber: (existingQuot as { number: string }).number,
          isNew: false,
        };
      }

      // 3. Obtener productos de la oportunidad
      const { data: oppProducts } = await supabase
        .from('opportunity_products')
        .select('product_id, quantity, unit_price, total_price, product:products(name, sku)')
        .eq('opportunity_id', opportunityId);

      // 4. Construir líneas de cotización desde opportunity_products
      const items: QuotationItem[] = (oppProducts || []).map((row: Record<string, unknown>) => {
        const product = row.product as { name?: string; sku?: string } | null;
        const qty = Number(row.quantity) || 1;
        const unitPrice = Number(row.unit_price) || 0;
        const totalLine = Number(row.total_price) || qty * unitPrice;
        const productName = product?.name || `Producto #${row.product_id}`;
        return {
          product_id: row.product_id as number,
          description: productName,
          qty,
          unit_price: unitPrice,
          tax_rate: 0,
          tax_included: false,
          total_line: totalLine,
        };
      });

      // 5. Calcular totales
      const subtotal = items.reduce((sum, item) => sum + item.total_line, 0);
      const taxTotal = 0;
      const discountTotal = 0;
      const total = subtotal + taxTotal - discountTotal;

      // 6. Generar número de cotización
      const quotationNumber = await CotizacionesService.generateQuotationNumber(orgId);

      // 7. Secciones narrativas por defecto
      const sectionsJson = this.getDefaultSections(opportunity.name);

      // 8. Crear la cotización con opportunity_id y sections_json
      const { data: newQuot, error: quotError } = await supabase
        .from('quotations')
        .insert({
          organization_id: orgId,
          number: quotationNumber,
          customer_id: opportunity.customer_id,
          issue_date: new Date().toISOString().split('T')[0],
          valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
          currency: opportunity.currency || 'COP',
          subtotal,
          tax_total: taxTotal,
          discount_total: discountTotal,
          total,
          status: 'draft',
          salesperson_id: opportunity.salesperson_id,
          opportunity_id: opportunityId,
          sections_json: sectionsJson,
        })
        .select('id, number')
        .single();

      if (quotError) throw quotError;

      const quotation = newQuot as { id: string; number: string };

      // 9. Insertar líneas de cotización
      if (items.length > 0) {
        const itemsToInsert = items.map((item) => ({
          ...item,
          quotation_id: quotation.id,
        }));
        const { error: itemsError } = await supabase
          .from('quotation_items')
          .insert(itemsToInsert);
        if (itemsError) throw itemsError;
      }

      // 10. Registrar actividad de propuesta generada
      await this.logProposalActivity(
        opportunityId,
        `Propuesta generada: ${quotationNumber}`,
        { quotation_id: quotation.id, quotation_number: quotationNumber }
      );

      return {
        quotationId: quotation.id,
        quotationNumber: quotation.number,
        isNew: true,
      };
    } catch (err) {
      console.error('Error en proposalService.generateProposal:', err);
      throw err;
    }
  }

  /**
   * Obtiene una propuesta (cotización) con sus secciones narrativas.
   *
   * @param quotationId - ID de la cotización
   * @returns Cotización con sections_json y líneas
   */
  async getProposal(quotationId: string): Promise<Proposal | null> {
    try {
      const quotation = await CotizacionesService.getQuotationById(quotationId);
      if (!quotation) return null;

      // Obtener campos adicionales (opportunity_id, sections_json) no incluidos en Quotation
      const { data: extra } = await supabase
        .from('quotations')
        .select('opportunity_id, sections_json')
        .eq('id', quotationId)
        .maybeSingle();

      const extraData = extra as { opportunity_id?: string | null; sections_json?: ProposalSections | null } | null;

      return {
        ...quotation,
        opportunity_id: extraData?.opportunity_id ?? null,
        sections_json: extraData?.sections_json ?? null,
      };
    } catch (err) {
      console.error('Error en proposalService.getProposal:', err);
      throw err;
    }
  }

  /**
   * Actualiza las secciones narrativas de una propuesta.
   *
   * @param quotationId - ID de la cotización
   * @param sections - Secciones narrativas a guardar
   */
  async updateProposalSections(
    quotationId: string,
    sections: ProposalSections
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('quotations')
        .update({
          sections_json: sections,
          updated_at: new Date().toISOString(),
        })
        .eq('id', quotationId);

      if (error) throw error;
    } catch (err) {
      console.error('Error en proposalService.updateProposalSections:', err);
      throw err;
    }
  }

  /**
   * Vincula una cotización existente a una oportunidad.
   *
   * @param quotationId - ID de la cotización
   * @param opportunityId - ID de la oportunidad
   */
  async linkQuotationToOpportunity(
    quotationId: string,
    opportunityId: string
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('quotations')
        .update({
          opportunity_id: opportunityId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', quotationId);

      if (error) throw error;
    } catch (err) {
      console.error('Error en proposalService.linkQuotationToOpportunity:', err);
      throw err;
    }
  }

  /**
   * Obtiene la última cotización vinculada a una oportunidad.
   *
   * @param opportunityId - ID de la oportunidad
   * @returns Cotización más reciente o null
   */
  async getLatestProposalForOpportunity(
    opportunityId: string
  ): Promise<Proposal | null> {
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
   * Marca la propuesta como enviada: cambia status a 'sent',
   * crea actividad "Propuesta enviada" y programa next_contact_at = +24h.
   *
   * @param quotationId - ID de la cotización
   * @param opportunityId - ID de la oportunidad (para actividad y next_contact)
   */
  async markProposalSent(
    quotationId: string,
    opportunityId: string
  ): Promise<void> {
    try {
      // 1. Cambiar status de la cotización a 'sent'
      await CotizacionesService.changeStatus(quotationId, 'sent');

      // 2. Crear actividad "Propuesta enviada"
      await this.logProposalActivity(
        opportunityId,
        'Propuesta enviada al cliente',
        { quotation_id: quotationId, action: 'sent' }
      );

      // 3. Programar próximo contacto en +24h
      const nextContact = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await supabase
        .from('opportunities')
        .update({
          next_contact_at: nextContact,
          updated_at: new Date().toISOString(),
        })
        .eq('id', opportunityId);
    } catch (err) {
      console.error('Error en proposalService.markProposalSent:', err);
      throw err;
    }
  }

  /**
   * Crea una actividad asociada a la oportunidad.
   */
  private async logProposalActivity(
    opportunityId: string,
    notes: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    try {
      const orgId = this.getOrgId();
      const { data: userData } = await supabase.auth.getUser();

      await supabase.from('activities').insert({
        organization_id: orgId,
        activity_type: 'note',
        user_id: userData.user?.id || null,
        notes,
        related_type: 'opportunity',
        related_id: opportunityId,
        occurred_at: new Date().toISOString(),
        metadata: { source: 'proposal_service', auto_generated: true, ...metadata },
      });
    } catch (err) {
      console.warn('No se pudo registrar actividad de propuesta:', err);
    }
  }
}

export const proposalService = new ProposalService();
export default proposalService;
