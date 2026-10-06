import { supabase } from '@/lib/supabase/config';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { ConteoSegmento } from '@/lib/services/crm/segmentosConteoService';
import { normalizarFiltroSegmento, type FiltroSegmento } from '@/lib/services/crm/segmentosFiltroLogica';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import {
  Segment,
  CreateSegmentInput,
  UpdateSegmentInput,
  SegmentStats,
  FilterRule,
} from './types';

/** Cliente de la vista del segmento (columnas reales de `customers`). */
export interface ClienteSegmento {
  id: string;
  full_name: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  tags?: string[] | null;
  created_at?: string | null;
}

/** Lo que `applyFilter` usa del constructor de consultas de PostgREST. */
interface ConsultaFiltrable<Q> {
  eq(columna: string, valor: unknown): Q;
  neq(columna: string, valor: unknown): Q;
  contains(columna: string, valor: unknown): Q;
  ilike(columna: string, patron: string): Q;
  not(columna: string, operador: string, valor: unknown): Q;
  gt(columna: string, valor: unknown): Q;
  lt(columna: string, valor: unknown): Q;
  is(columna: string, valor: null): Q;
}

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
    } catch {
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
    } catch {
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
    } catch {
      console.error('Error en createSegment');
      return null;
    }
  }

  async updateSegment(id: string, input: UpdateSegmentInput): Promise<Segment | null> {
    try {
      const updateData: Record<string, unknown> = {
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
    } catch {
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
    } catch {
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
    } catch {
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
    } catch {
      console.warn('Error en getStats');
      return { total: 0, dynamic: 0, static: 0, totalCustomers: 0 };
    }
  }

  async getSegmentCustomers(segmentId: string, limit = 50): Promise<ClienteSegmento[]> {
    try {
      const segment = await this.getSegmentById(segmentId);
      if (!segment) return [];

      // Consulta base
      let query = supabase
        .from('customers')
        .select('id, full_name, email, phone, city, tags, created_at')
        .eq('organization_id', this.getOrgId());

      // Con varios grupos (O) PostgREST no puede aplicar el filtro sin
      // interpolar texto en `.or()` (guardarraíl de búsqueda de clientes): se
      // muestra la muestra del servidor. Un formato desconocido no lista a todos.
      const filtro = normalizarFiltroSegmento(segment.filter_json);
      if (!filtro) return [];
      if (filtro.grupos.length > 1) {
        const { muestra } = await this.previewFilter(filtro);
        return muestra.map((m) => ({ id: m.id, full_name: m.nombre }));
      }
      for (const rule of filtro.grupos[0] ?? []) {
        query = this.applyFilter(query, rule as FilterRule);
      }

      const { data, error } = await query.limit(limit);

      if (error) {
        console.warn('Error obteniendo clientes del segmento:', error.message);
        return [];
      }

      return (data || []) as ClienteSegmento[];
    } catch {
      console.warn('Error en getSegmentCustomers');
      return [];
    }
  }

  /**
   * Conteo y muestra en el SERVIDOR (`POST /api/crm/segments/preview` →
   * `crm_segment_preview`). Antes se contaba aquí, en el navegador, solo con Y.
   * Lanza `ErrorApiCrm` (503 sin la migración, 504 si tarda, 400 filtro inválido).
   */
  async previewFilter(filtro: FilterRule[] | FiltroSegmento): Promise<ConteoSegmento> {
    const { data } = await pedirCrm<ConteoSegmento>('/api/crm/segments/preview', { method: 'POST', cuerpo: { filter_json: filtro } });
    return data;
  }

  /** Recalcula `customer_count` en el servidor con el mismo conteo del constructor. */
  async recalculateSegment(id: string): Promise<number> {
    const { data } = await pedirCrm<{ customer_count: number }>(`/api/crm/segments/${encodeURIComponent(id)}/recount`, { method: 'POST' });
    return data.customer_count;
  }

  private applyFilter<Q extends ConsultaFiltrable<Q>>(query: Q, rule: FilterRule): Q {
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
