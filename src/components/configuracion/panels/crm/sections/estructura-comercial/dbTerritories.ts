import { supabase } from '@/lib/supabase/config';
import { requireOrgId } from './dbRoles';
import type { Territory } from './types';

/** Capa de datos directa con Supabase cliente (con RLS) — territorios. */
export const territoriesDb = {
  async getTerritories(): Promise<Territory[]> {
    const orgId = requireOrgId();
    const { data, error } = await supabase
      .from('territories')
      .select('*')
      .eq('organization_id', orgId)
      .order('name', { ascending: true });
    if (error) throw error;
    return (data || []) as Territory[];
  },
  async createTerritory(body: {
    name: string;
    criteria?: Record<string, unknown>;
    is_active?: boolean;
  }): Promise<Territory> {
    const orgId = requireOrgId();
    const { data, error } = await supabase
      .from('territories')
      .insert({
        organization_id: orgId,
        name: body.name,
        criteria: body.criteria ?? {},
        is_active: body.is_active ?? true,
      })
      .select()
      .single();
    if (error) throw error;
    return data as Territory;
  },
  async updateTerritory(id: string, body: Partial<Territory>): Promise<Territory> {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.criteria !== undefined) updateData.criteria = body.criteria;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    const { data, error } = await supabase
      .from('territories')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Territory;
  },
  async deleteTerritory(id: string): Promise<void> {
    const { error } = await supabase.from('territories').delete().eq('id', id);
    if (error) throw error;
  },
};
