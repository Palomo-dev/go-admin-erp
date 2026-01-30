import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import {
  Activity,
  ActivityFilters,
  ActivityStats,
  CreateActivityInput,
  UpdateActivityInput,
  ActivityType,
} from './types';

class ActividadesService {
  private getOrgId(): number {
    return getOrganizationId();
  }

  async getActivities(filters?: ActivityFilters): Promise<Activity[]> {
    try {
      let query = supabase
        .from('activities')
        .select('*')
        .eq('organization_id', this.getOrgId())
        .order('occurred_at', { ascending: false });

      if (filters?.activity_type) {
        query = query.eq('activity_type', filters.activity_type);
      }

      if (filters?.user_id) {
        query = query.eq('user_id', filters.user_id);
      }

      if (filters?.related_type) {
        query = query.eq('related_type', filters.related_type);
      }

      if (filters?.related_id) {
        query = query.eq('related_id', filters.related_id);
      }

      if (filters?.date_from) {
        query = query.gte('occurred_at', filters.date_from);
      }

      if (filters?.date_to) {
        query = query.lte('occurred_at', filters.date_to);
      }

      if (filters?.search) {
        query = query.ilike('notes', `%${filters.search}%`);
      }

      const { data, error } = await query.limit(100);

      if (error) {
        console.warn('Error obteniendo actividades:', error.message);
        return [];
      }

      // Cargar datos relacionados en batch
      const activities = data || [];
      const customerIds = activities
        .filter(a => a.related_type === 'customer' && a.related_id)
        .map(a => a.related_id);
      const opportunityIds = activities
        .filter(a => a.related_type === 'opportunity' && a.related_id)
        .map(a => a.related_id);

      let customersMap: Record<string, any> = {};
      let opportunitiesMap: Record<string, any> = {};

      if (customerIds.length > 0) {
        const { data: customers } = await supabase
          .from('customers')
          .select('id, full_name, email, phone')
          .in('id', customerIds);
        if (customers) {
          customersMap = Object.fromEntries(customers.map(c => [c.id, c]));
        }
      }

      if (opportunityIds.length > 0) {
        const { data: opportunities } = await supabase
          .from('opportunities')
          .select('id, name, amount')
          .in('id', opportunityIds);
        if (opportunities) {
          opportunitiesMap = Object.fromEntries(
            opportunities.map(o => [o.id, { id: o.id, title: o.name, amount: o.amount }])
          );
        }
      }

      return activities.map(a => ({
        ...a,
        customer: a.related_type === 'customer' ? customersMap[a.related_id] : undefined,
        opportunity: a.related_type === 'opportunity' ? opportunitiesMap[a.related_id] : undefined,
      }));
    } catch (error) {
      console.warn('Error en getActivities');
      return [];
    }
  }

  async getActivityById(id: string): Promise<Activity | null> {
    try {
      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('id', id)
        .eq('organization_id', this.getOrgId())
        .single();

      if (error) {
        console.warn('Error obteniendo actividad:', error.message);
        return null;
      }

      // Cargar datos relacionados si existen
      if (data && data.related_type && data.related_id) {
        if (data.related_type === 'customer') {
          const { data: customer } = await supabase
            .from('customers')
            .select('id, full_name, email, phone')
            .eq('id', data.related_id)
            .single();
          if (customer) data.customer = customer;
        } else if (data.related_type === 'opportunity') {
          const { data: opportunity } = await supabase
            .from('opportunities')
            .select('id, name, amount')
            .eq('id', data.related_id)
            .single();
          if (opportunity) {
            data.opportunity = { id: opportunity.id, title: opportunity.name, amount: opportunity.amount };
          }
        }
      }

      return data;
    } catch (error) {
      console.warn('Error en getActivityById');
      return null;
    }
  }

  async createActivity(input: CreateActivityInput): Promise<Activity | null> {
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('activities')
        .insert({
          organization_id: this.getOrgId(),
          activity_type: input.activity_type,
          notes: input.notes || null,
          related_type: input.related_type || null,
          related_id: input.related_id || null,
          occurred_at: input.occurred_at || new Date().toISOString(),
          metadata: input.metadata || {},
          user_id: userData?.user?.id || null,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creando actividad:', error.message);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error en createActivity');
      return null;
    }
  }

  async updateActivity(id: string, input: UpdateActivityInput): Promise<Activity | null> {
    try {
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (input.activity_type !== undefined) updateData.activity_type = input.activity_type;
      if (input.notes !== undefined) updateData.notes = input.notes;
      if (input.related_type !== undefined) updateData.related_type = input.related_type;
      if (input.related_id !== undefined) updateData.related_id = input.related_id;
      if (input.occurred_at !== undefined) updateData.occurred_at = input.occurred_at;
      if (input.metadata !== undefined) updateData.metadata = input.metadata;

      const { data, error } = await supabase
        .from('activities')
        .update(updateData)
        .eq('id', id)
        .eq('organization_id', this.getOrgId())
        .select()
        .single();

      if (error) {
        console.error('Error actualizando actividad:', error.message);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error en updateActivity');
      return null;
    }
  }

  async deleteActivity(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('activities')
        .delete()
        .eq('id', id)
        .eq('organization_id', this.getOrgId());

      if (error) {
        console.error('Error eliminando actividad:', error.message);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error en deleteActivity');
      return false;
    }
  }

  async duplicateActivity(id: string): Promise<Activity | null> {
    try {
      const original = await this.getActivityById(id);
      if (!original) return null;

      return await this.createActivity({
        activity_type: original.activity_type,
        notes: original.notes || undefined,
        related_type: original.related_type || undefined,
        related_id: original.related_id || undefined,
        occurred_at: new Date().toISOString(),
        metadata: original.metadata,
      });
    } catch (error) {
      console.error('Error en duplicateActivity');
      return null;
    }
  }

  async getStats(): Promise<ActivityStats> {
    try {
      const { data, error } = await supabase
        .from('activities')
        .select('activity_type')
        .eq('organization_id', this.getOrgId());

      if (error || !data) {
        return { total: 0, calls: 0, emails: 0, meetings: 0, notes: 0, visits: 0, whatsapp: 0 };
      }

      const stats: ActivityStats = {
        total: data.length,
        calls: data.filter(a => a.activity_type === 'call').length,
        emails: data.filter(a => a.activity_type === 'email').length,
        meetings: data.filter(a => a.activity_type === 'meeting').length,
        notes: data.filter(a => a.activity_type === 'note').length,
        visits: data.filter(a => a.activity_type === 'visit').length,
        whatsapp: data.filter(a => a.activity_type === 'whatsapp').length,
      };

      return stats;
    } catch (error) {
      console.warn('Error en getStats');
      return { total: 0, calls: 0, emails: 0, meetings: 0, notes: 0, visits: 0, whatsapp: 0 };
    }
  }

  async getCustomers(): Promise<{ id: string; full_name: string; email?: string }[]> {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, email')
        .eq('organization_id', this.getOrgId())
        .order('full_name')
        .limit(100);

      if (error) {
        console.warn('Error obteniendo clientes:', error.message);
        return [];
      }

      return data || [];
    } catch (error) {
      console.warn('Error en getCustomers');
      return [];
    }
  }

  async getOpportunities(): Promise<{ id: string; title: string }[]> {
    try {
      const { data, error } = await supabase
        .from('opportunities')
        .select('id, name')
        .eq('organization_id', this.getOrgId())
        .order('name')
        .limit(100);

      if (error) {
        console.warn('Error obteniendo oportunidades:', error.message);
        return [];
      }

      // Mapear name a title para mantener compatibilidad
      return (data || []).map(o => ({ id: o.id, title: o.name || 'Sin nombre' }));
    } catch (error) {
      console.warn('Error en getOpportunities');
      return [];
    }
  }

  async getUsers(): Promise<{ id: string; email: string; full_name?: string }[]> {
    try {
      const { data, error } = await supabase
        .from('organization_members')
        .select(`
          user_id,
          users:user_id (
            id,
            email
          )
        `)
        .eq('organization_id', this.getOrgId())
        .eq('is_active', true);

      if (error) {
        console.warn('Error obteniendo usuarios:', error.message);
        return [];
      }

      return (data || []).map((m: any) => ({
        id: m.user_id,
        email: m.users?.email || '',
        full_name: m.users?.email?.split('@')[0] || '',
      }));
    } catch (error) {
      console.warn('Error en getUsers');
      return [];
    }
  }
}

export const actividadesService = new ActividadesService();
