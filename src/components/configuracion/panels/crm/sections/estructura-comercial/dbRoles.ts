import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { JobPosition, SalesRole } from './types';

/**
 * Helper para obtener el orgId actual. Lanza si no hay contexto.
 */
export function requireOrgId(): number {
  const orgId = getOrganizationId();
  if (!orgId) throw new Error('No se pudo determinar la organización');
  return orgId;
}

/**
 * Capa de datos directa con Supabase cliente (con RLS) — roles y cargos HRM.
 * Evita el round-trip server-side de getServerOrgContext que hacía
 * 2 llamadas extra (auth.getUser + organization_members) por cada request.
 */
export const rolesDb = {
  async getRoles(): Promise<SalesRole[]> {
    const orgId = requireOrgId();
    const { data, error } = await supabase
      .from('sales_roles')
      .select('*, job_positions(id, name)')
      .eq('organization_id', orgId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    return (data || []) as SalesRole[];
  },
  async createRole(
    body: Partial<SalesRole> & { code: string; name: string; area: string },
  ): Promise<SalesRole> {
    const orgId = requireOrgId();
    const { data, error } = await supabase
      .from('sales_roles')
      .insert({
        organization_id: orgId,
        code: body.code,
        name: body.name,
        area: body.area,
        responsibilities: body.responsibilities ?? [],
        is_active: body.is_active ?? true,
        sort_order: body.sort_order ?? 0,
        job_position_id: body.job_position_id ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as SalesRole;
  },
  async updateRole(id: string, body: Partial<SalesRole>): Promise<SalesRole> {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.code !== undefined) updateData.code = body.code;
    if (body.name !== undefined) updateData.name = body.name;
    if (body.area !== undefined) updateData.area = body.area;
    if (body.responsibilities !== undefined) updateData.responsibilities = body.responsibilities;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.sort_order !== undefined) updateData.sort_order = body.sort_order;
    if (body.job_position_id !== undefined) updateData.job_position_id = body.job_position_id;
    const { data, error } = await supabase
      .from('sales_roles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as SalesRole;
  },
  async deleteRole(id: string): Promise<void> {
    const { error } = await supabase.from('sales_roles').delete().eq('id', id);
    if (error) throw error;
  },
  // ── Job Positions (HRM) ──
  async getJobPositions(): Promise<JobPosition[]> {
    const orgId = requireOrgId();
    const { data, error } = await supabase
      .from('job_positions')
      .select('id, name')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) throw error;
    return (data || []) as JobPosition[];
  },
};
