import { supabase } from '@/lib/supabase/config';
import { getOrganizationId as getOrganizationIdFromContext } from '@/lib/hooks/useOrganization';

/**
 * Servicio CRM para gestionar el catálogo de razones de pérdida.
 * Tabla: loss_reasons (id, organization_id, code, reason, label, is_active, is_global, created_at, updated_at)
 * - Las razones globales tienen organization_id IS NULL
 * - Las razones por org tienen organization_id = id de la organización
 *
 * Nota: `reason` es el campo principal en BD. `label` se incluye como alias
 * para compatibilidad con componentes que lo consumen (StructuredLossDialog).
 */

export interface LossReason {
  id: string;
  organization_id: number | null;
  code: string | null;
  reason: string;
  label?: string;
  is_active: boolean;
  is_global: boolean;
  created_at: string;
  updated_at: string;
}

export interface LossReasonInput {
  reason: string;
  is_global?: boolean;
}

export interface LossReasonUpdateInput {
  reason?: string;
  is_active?: boolean;
}

class LossReasonsService {
  private orgId: number;

  constructor(organizationId?: number) {
    this.orgId = organizationId ?? getOrganizationIdFromContext();
  }

  private getOrgId(): number {
    return this.orgId;
  }

  /**
   * Normaliza un registro de BD para asegurar que `label` esté presente.
   * Si `label` no existe en BD, se usa `reason` como label.
   */
  private normalizeReason(row: Record<string, unknown>): LossReason {
    const reason = (row.reason as string) || '';
    return {
      ...row,
      reason,
      label: (row.label as string) || reason,
    } as LossReason;
  }

  /**
   * Obtiene las razones de pérdida: globales (organization_id IS NULL) + de la org actual.
   * @param includeInactive - Si true, incluye razones inactivas
   */
  async getLossReasons(includeInactive = false): Promise<LossReason[]> {
    try {
      const orgId = this.getOrgId();
      let query = supabase
        .from('loss_reasons')
        .select('*')
        .or(`organization_id.is.null,organization_id.eq.${orgId}`);

      if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query.order('reason');

      if (error) {
        console.warn('Advertencia obteniendo razones de pérdida:', error.message);
        return [];
      }
      return (data || []).map((row) => this.normalizeReason(row as Record<string, unknown>));
    } catch (err) {
      console.warn('Error en lossReasonsService.getLossReasons:', err);
      return [];
    }
  }

  /**
   * Alias de getLossReasons(false) — razones activas (globales + de la org).
   */
  async list(): Promise<LossReason[]> {
    return this.getLossReasons(false);
  }

  /**
   * Crea una nueva razón de pérdida para la organización actual.
   */
  async createLossReason(input: LossReasonInput): Promise<LossReason | null> {
    try {
      const orgId = this.getOrgId();
      const isGlobal = input.is_global ?? false;
      const code = input.reason.toLowerCase().replace(/\s+/g, '_').substring(0, 50);

      const { data, error } = await supabase
        .from('loss_reasons')
        .insert({
          organization_id: isGlobal ? null : orgId,
          code,
          reason: input.reason,
          label: input.reason,
          is_active: true,
          is_global: isGlobal,
        })
        .select()
        .single();

      if (error) throw error;
      return this.normalizeReason(data as Record<string, unknown>);
    } catch (err) {
      console.error('Error en lossReasonsService.createLossReason:', err);
      throw err;
    }
  }

  /**
   * Alias de createLossReason — crea una razón por org.
   */
  async create(input: LossReasonInput): Promise<LossReason | null> {
    return this.createLossReason(input);
  }

  /**
   * Actualiza una razón de pérdida existente.
   */
  async updateLossReason(id: string, data: LossReasonUpdateInput): Promise<LossReason | null> {
    try {
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (data.reason !== undefined) {
        updateData.reason = data.reason;
        updateData.label = data.reason;
      }
      if (data.is_active !== undefined) updateData.is_active = data.is_active;

      const { data: result, error } = await supabase
        .from('loss_reasons')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return this.normalizeReason(result as Record<string, unknown>);
    } catch (err) {
      console.error('Error en lossReasonsService.updateLossReason:', err);
      throw err;
    }
  }

  /**
   * Alias de updateLossReason.
   */
  async update(id: string, data: LossReasonUpdateInput): Promise<LossReason | null> {
    return this.updateLossReason(id, data);
  }

  /**
   * Elimina (soft delete) una razón de pérdida marcándola como inactiva.
   */
  async deleteLossReason(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('loss_reasons')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error('Error en lossReasonsService.deleteLossReason:', err);
      throw err;
    }
  }

  /**
   * Activa o desactiva una razón de pérdida (toggle).
   */
  async toggleActive(id: string): Promise<LossReason | null> {
    try {
      const { data: current, error: fetchError } = await supabase
        .from('loss_reasons')
        .select('is_active')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      if (!current) throw new Error('Razón de pérdida no encontrada');

      const newActive = !(current as { is_active: boolean }).is_active;

      const { data: result, error } = await supabase
        .from('loss_reasons')
        .update({
          is_active: newActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return this.normalizeReason(result as Record<string, unknown>);
    } catch (err) {
      console.error('Error en lossReasonsService.toggleActive:', err);
      throw err;
    }
  }
}

export const lossReasonsService = new LossReasonsService();
export default LossReasonsService;
