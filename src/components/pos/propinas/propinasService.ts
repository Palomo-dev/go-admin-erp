import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { 
  Tip, 
  TipSummary,
  CreateTipData, 
  UpdateTipData,
  TipFilters
} from './types';

export class PropinasService {
  /**
   * Obtener todas las propinas
   */
  static async getAll(filters: TipFilters = {}): Promise<Tip[]> {
    try {
      const organizationId = getOrganizationId();
      const branchId = getCurrentBranchId();
      
      let query = supabase
        .from('tips')
        .select(`
          *,
          sale:sales (
            id,
            total,
            sale_date
          )
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      if (filters.server_id) {
        query = query.eq('server_id', filters.server_id);
      }

      if (filters.is_distributed !== undefined) {
        query = query.eq('is_distributed', filters.is_distributed);
      }

      if (filters.tip_type) {
        query = query.eq('tip_type', filters.tip_type);
      }

      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }

      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo + 'T23:59:59');
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching tips:', error);
        throw new Error(`Error al obtener propinas: ${error.message}`);
      }

      // Obtener información de los servidores
      const serverIds = Array.from(new Set(data?.map(t => t.server_id) || []));
      let serversMap: Record<string, any> = {};

      if (serverIds.length > 0) {
        const { data: members } = await supabase
          .from('organization_members')
          .select('user_id, profiles:user_id (id, email, first_name, last_name)')
          .in('user_id', serverIds);

        if (members) {
          members.forEach(m => {
            if (m.profiles) {
              serversMap[m.user_id] = m.profiles;
            }
          });
        }
      }

      return (data || []).map(tip => ({
        ...tip,
        server: serversMap[tip.server_id] || null
      }));
    } catch (error) {
      console.error('Error in getAll:', error);
      throw error;
    }
  }

  /**
   * Obtener propinas del día actual
   */
  static async getTodayTips(): Promise<Tip[]> {
    const today = new Date().toISOString().split('T')[0];
    return this.getAll({ dateFrom: today, dateTo: today });
  }

  /**
   * Obtener resumen de propinas por mesero
   */
  static async getSummaryByServer(filters: TipFilters = {}): Promise<TipSummary[]> {
    try {
      const tips = await this.getAll(filters);
      
      const summaryMap: Record<string, TipSummary> = {};

      tips.forEach(tip => {
        const serverId = tip.server_id;
        
        if (!summaryMap[serverId]) {
          const firstName = tip.server?.first_name || '';
          const lastName = tip.server?.last_name || '';
          const serverName = [firstName, lastName].filter(Boolean).join(' ') || 'Sin nombre';
          
          summaryMap[serverId] = {
            server_id: serverId,
            server_name: serverName,
            server_email: tip.server?.email || '',
            total_tips: 0,
            tips_count: 0,
            distributed_amount: 0,
            pending_amount: 0,
            cash_tips: 0,
            card_tips: 0,
            transfer_tips: 0,
            online_tips: 0
          };
        }

        const amount = Number(tip.amount);
        summaryMap[serverId].total_tips += amount;
        summaryMap[serverId].tips_count += 1;

        if (tip.is_distributed) {
          summaryMap[serverId].distributed_amount += amount;
        } else {
          summaryMap[serverId].pending_amount += amount;
        }

        switch (tip.tip_type) {
          case 'cash':
            summaryMap[serverId].cash_tips += amount;
            break;
          case 'card':
            summaryMap[serverId].card_tips += amount;
            break;
          case 'transfer':
            summaryMap[serverId].transfer_tips += amount;
            break;
          case 'online':
            summaryMap[serverId].online_tips += amount;
            break;
        }
      });

      return Object.values(summaryMap).sort((a, b) => b.total_tips - a.total_tips);
    } catch (error) {
      console.error('Error in getSummaryByServer:', error);
      throw error;
    }
  }

  /**
   * Crear propina
   */
  static async create(data: CreateTipData): Promise<Tip> {
    try {
      const organizationId = getOrganizationId();
      const branchId = getCurrentBranchId();

      if (!branchId) {
        throw new Error('No se pudo obtener el branch_id');
      }

      const { data: result, error } = await supabase
        .from('tips')
        .insert([{
          organization_id: organizationId,
          branch_id: branchId,
          sale_id: data.sale_id || null,
          payment_id: data.payment_id || null,
          server_id: data.server_id,
          amount: data.amount,
          tip_type: data.tip_type,
          notes: data.notes || null,
          is_distributed: false
        }])
        .select()
        .single();

      if (error) {
        console.error('Error creating tip:', error);
        throw new Error(`Error al crear propina: ${error.message}`);
      }

      return result;
    } catch (error) {
      console.error('Error in create:', error);
      throw error;
    }
  }

  /**
   * Actualizar propina
   */
  static async update(id: string, data: UpdateTipData): Promise<Tip> {
    try {
      const updateData: any = { ...data };
      
      if (data.is_distributed) {
        updateData.distributed_at = new Date().toISOString();
      }

      const { data: result, error } = await supabase
        .from('tips')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating tip:', error);
        throw new Error(`Error al actualizar propina: ${error.message}`);
      }

      return result;
    } catch (error) {
      console.error('Error in update:', error);
      throw error;
    }
  }

  /**
   * Eliminar propina
   */
  static async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('tips')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting tip:', error);
        throw new Error(`Error al eliminar propina: ${error.message}`);
      }
    } catch (error) {
      console.error('Error in delete:', error);
      throw error;
    }
  }

  /**
   * Marcar propina como distribuida
   */
  static async markAsDistributed(id: string): Promise<Tip> {
    return this.update(id, { is_distributed: true });
  }

  /**
   * Marcar múltiples propinas como distribuidas
   */
  static async markMultipleAsDistributed(ids: string[]): Promise<void> {
    try {
      const batchId = crypto.randomUUID();
      const now = new Date().toISOString();

      const { error } = await supabase
        .from('tips')
        .update({
          is_distributed: true,
          distributed_at: now,
          distribution_batch_id: batchId
        })
        .in('id', ids);

      if (error) {
        console.error('Error distributing tips:', error);
        throw new Error(`Error al distribuir propinas: ${error.message}`);
      }
    } catch (error) {
      console.error('Error in markMultipleAsDistributed:', error);
      throw error;
    }
  }

  /**
   * Obtener lista de meseros activos
   */
  static async getServers(): Promise<{ id: string; name: string; email: string }[]> {
    try {
      const organizationId = getOrganizationId();

      const { data, error } = await supabase
        .from('organization_members')
        .select('user_id, profiles:user_id (id, email, first_name, last_name)')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (error) {
        console.error('Error fetching servers:', error);
        throw new Error(`Error al obtener meseros: ${error.message}`);
      }

      return (data || []).map(m => {
        const profile = m.profiles as any;
        const firstName = profile?.first_name || '';
        const lastName = profile?.last_name || '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Sin nombre';
        
        return {
          id: m.user_id,
          name: fullName,
          email: profile?.email || ''
        };
      });
    } catch (error) {
      console.error('Error in getServers:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas del día
   */
  static async getDayStats(): Promise<{
    total: number;
    distributed: number;
    pending: number;
    byType: { cash: number; card: number; transfer: number; online: number };
    count: number;
  }> {
    try {
      const tips = await this.getTodayTips();
      
      const stats = {
        total: 0,
        distributed: 0,
        pending: 0,
        byType: { cash: 0, card: 0, transfer: 0, online: 0 },
        count: tips.length
      };

      tips.forEach(tip => {
        const amount = Number(tip.amount);
        stats.total += amount;
        
        if (tip.is_distributed) {
          stats.distributed += amount;
        } else {
          stats.pending += amount;
        }

        if (tip.tip_type in stats.byType) {
          stats.byType[tip.tip_type as keyof typeof stats.byType] += amount;
        }
      });

      return stats;
    } catch (error) {
      console.error('Error in getDayStats:', error);
      throw error;
    }
  }
}
