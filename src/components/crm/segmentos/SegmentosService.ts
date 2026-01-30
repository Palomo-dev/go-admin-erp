import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import {
  Segment,
  CreateSegmentInput,
  UpdateSegmentInput,
  SegmentStats,
  FilterRule,
} from './types';

class SegmentosServiceClass {
  private getOrgId(): number {
    return getOrganizationId();
  }

  async getSegments(): Promise<Segment[]> {
    try {
      const { data, error } = await supabase
        .from('segments')
        .select('*')
        .eq('organization_id', this.getOrgId())
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Error obteniendo segmentos:', error.message);
        return [];
      }

      return data || [];
    } catch (error) {
      console.warn('Error en getSegments');
      return [];
    }
  }

  async getSegmentById(id: string): Promise<Segment | null> {
    try {
      const { data, error } = await supabase
        .from('segments')
        .select('*')
        .eq('id', id)
        .eq('organization_id', this.getOrgId())
        .single();

      if (error) {
        console.warn('Error obteniendo segmento:', error.message);
        return null;
      }

      return data;
    } catch (error) {
      console.warn('Error en getSegmentById');
      return null;
    }
  }

  async createSegment(input: CreateSegmentInput): Promise<Segment | null> {
    try {
      const { data: userData } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('segments')
        .insert({
          organization_id: this.getOrgId(),
          name: input.name,
          description: input.description || null,
          filter_json: input.filter_json || [],
          is_dynamic: input.is_dynamic ?? true,
          customer_count: 0,
          created_by: userData?.user?.id || null,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creando segmento:', error.message);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error en createSegment');
      return null;
    }
  }

  async updateSegment(id: string, input: UpdateSegmentInput): Promise<Segment | null> {
    try {
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.filter_json !== undefined) updateData.filter_json = input.filter_json;
      if (input.is_dynamic !== undefined) updateData.is_dynamic = input.is_dynamic;

      const { data, error } = await supabase
        .from('segments')
        .update(updateData)
        .eq('id', id)
        .eq('organization_id', this.getOrgId())
        .select()
        .single();

      if (error) {
        console.error('Error actualizando segmento:', error.message);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error en updateSegment');
      return null;
    }
  }

  async deleteSegment(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('segments')
        .delete()
        .eq('id', id)
        .eq('organization_id', this.getOrgId());

      if (error) {
        console.error('Error eliminando segmento:', error.message);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error en deleteSegment');
      return false;
    }
  }

  async duplicateSegment(id: string): Promise<Segment | null> {
    try {
      const original = await this.getSegmentById(id);
      if (!original) return null;

      return await this.createSegment({
        name: `${original.name} (copia)`,
        description: original.description || undefined,
        filter_json: original.filter_json || undefined,
        is_dynamic: original.is_dynamic,
      });
    } catch (error) {
      console.error('Error en duplicateSegment');
      return null;
    }
  }

  async getStats(): Promise<SegmentStats> {
    try {
      const segments = await this.getSegments();
      
      return {
        total: segments.length,
        dynamic: segments.filter(s => s.is_dynamic).length,
        static: segments.filter(s => !s.is_dynamic).length,
        totalCustomers: segments.reduce((sum, s) => sum + (s.customer_count || 0), 0),
      };
    } catch (error) {
      console.warn('Error en getStats');
      return { total: 0, dynamic: 0, static: 0, totalCustomers: 0 };
    }
  }

  async getSegmentCustomers(segmentId: string, limit = 50): Promise<any[]> {
    try {
      const segment = await this.getSegmentById(segmentId);
      if (!segment) return [];

      // Consulta base
      let query = supabase
        .from('customers')
        .select('id, full_name, email, phone, city, tags, created_at')
        .eq('organization_id', this.getOrgId());

      // Aplicar filtros del segmento
      if (segment.filter_json && Array.isArray(segment.filter_json)) {
        for (const rule of segment.filter_json) {
          query = this.applyFilter(query, rule);
        }
      }

      const { data, error } = await query.limit(limit);

      if (error) {
        console.warn('Error obteniendo clientes del segmento:', error.message);
        return [];
      }

      return data || [];
    } catch (error) {
      console.warn('Error en getSegmentCustomers');
      return [];
    }
  }

  async previewFilter(filters: FilterRule[], limit = 20): Promise<{ customers: any[]; count: number }> {
    try {
      let query = supabase
        .from('customers')
        .select('id, full_name, email, phone, city, tags', { count: 'exact' })
        .eq('organization_id', this.getOrgId());

      for (const rule of filters) {
        query = this.applyFilter(query, rule);
      }

      const { data, count, error } = await query.limit(limit);

      if (error) {
        console.warn('Error en preview:', error.message);
        return { customers: [], count: 0 };
      }

      return { customers: data || [], count: count || 0 };
    } catch (error) {
      console.warn('Error en previewFilter');
      return { customers: [], count: 0 };
    }
  }

  async recalculateSegment(id: string): Promise<number> {
    try {
      const segment = await this.getSegmentById(id);
      if (!segment) return 0;

      const { count } = await this.previewFilter(segment.filter_json || []);

      await supabase
        .from('segments')
        .update({
          customer_count: count,
          last_run_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      return count;
    } catch (error) {
      console.error('Error en recalculateSegment');
      return 0;
    }
  }

  private applyFilter(query: any, rule: FilterRule): any {
    const { field, operator, value } = rule;

    switch (operator) {
      case 'equals':
        return query.eq(field, value);
      case 'not_equals':
        return query.neq(field, value);
      case 'contains':
        if (field === 'tags') {
          return query.contains(field, [value]);
        }
        return query.ilike(field, `%${value}%`);
      case 'not_contains':
        return query.not(field, 'ilike', `%${value}%`);
      case 'starts_with':
        return query.ilike(field, `${value}%`);
      case 'ends_with':
        return query.ilike(field, `%${value}`);
      case 'greater_than':
        return query.gt(field, value);
      case 'less_than':
        return query.lt(field, value);
      case 'is_empty':
        return query.is(field, null);
      case 'is_not_empty':
        return query.not(field, 'is', null);
      default:
        return query;
    }
  }
}

export const SegmentosService = new SegmentosServiceClass();
