import { supabase } from '@/lib/supabase/config';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import { requireOrgId } from './dbRoles';
import type { Territory } from './types';

/** Reads remain scoped; mutations use the audited server API. */
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
    return (await pedirCrm<Territory>('/api/crm/territories',{method:'POST',cuerpo:body})).data;
  },
  async updateTerritory(id:string,body:Partial<Territory>):Promise<Territory> {
    return (await pedirCrm<Territory>(`/api/crm/territories/${encodeURIComponent(id)}`,{method:'PATCH',cuerpo:body})).data;
  },
  async deleteTerritory(id:string):Promise<void> {
    await pedirCrm(`/api/crm/territories/${encodeURIComponent(id)}`,{method:'DELETE'});
  },
};
