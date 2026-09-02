import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Servicio CRM - Estructura comercial: roles, equipos, miembros y territorios.
 * Tablas: sales_roles, sales_teams, sales_team_members, territories
 */

// ─── Tipos: Sales Roles ──────────────────────────────────────────────────────

export interface SalesRole {
  id: string;
  organization_id: number;
  code: string;
  name: string;
  area: string;
  responsibilities: unknown[];
  is_active: boolean;
  sort_order: number;
  job_position_id: string | null;
  job_positions?: { id: string; name: string } | null;
  created_at: string;
  updated_at: string;
}

export interface SalesRoleInput {
  code: string;
  name: string;
  area: string;
  responsibilities?: unknown[];
  is_active?: boolean;
  sort_order?: number;
  job_position_id?: string | null;
}

export interface SalesRoleUpdateInput {
  code?: string;
  name?: string;
  area?: string;
  responsibilities?: unknown[];
  is_active?: boolean;
  sort_order?: number;
  job_position_id?: string | null;
}

// ─── Tipos: Sales Teams ──────────────────────────────────────────────────────

export interface SalesTeam {
  id: string;
  organization_id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  territory_id: string | null;
  territories?: { id: string; name: string } | null;
  created_at: string;
  updated_at: string;
  members?: SalesTeamMember[];
}

export interface SalesTeamInput {
  name: string;
  description?: string | null;
  is_active?: boolean;
  territory_id?: string | null;
}

export interface SalesTeamUpdateInput {
  name?: string;
  description?: string | null;
  is_active?: boolean;
  territory_id?: string | null;
}

// ─── Tipos: Team Members ─────────────────────────────────────────────────────

export interface SalesTeamMember {
  id: string;
  organization_id: number;
  sales_team_id: string;
  user_id: string;
  sales_role_id: string | null;
  quota_amount: number | null;
  quota_currency: string;
  is_active: boolean;
  territory_id: string | null;
  created_at: string;
  updated_at: string;
  // Joins opcionales
  sales_roles?: { id: string; name: string; code: string } | null;
  profiles?: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
  territories?: { id: string; name: string } | null;
}

export interface TeamMemberInput {
  user_id: string;
  sales_role_id?: string | null;
  quota_amount?: number | null;
  quota_currency?: string;
  is_active?: boolean;
  territory_id?: string | null;
}

export interface TeamMemberUpdateInput {
  sales_role_id?: string | null;
  quota_amount?: number | null;
  quota_currency?: string;
  is_active?: boolean;
  territory_id?: string | null;
}

// ─── Tipos: Territories ──────────────────────────────────────────────────────

export interface Territory {
  id: string;
  organization_id: number;
  name: string;
  criteria: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TerritoryInput {
  name: string;
  criteria?: Record<string, unknown>;
  is_active?: boolean;
}

export interface TerritoryUpdateInput {
  name?: string;
  criteria?: Record<string, unknown>;
  is_active?: boolean;
}

// ─── Sales Roles ─────────────────────────────────────────────────────────────

export async function getSalesRoles(
  orgId: number,
  supabase: SupabaseClient
): Promise<SalesRole[]> {
  const { data, error } = await supabase
    .from('sales_roles')
    .select('*, job_positions(id, name)')
    .eq('organization_id', orgId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.warn('salesStructureService.getSalesRoles - error:', error.message);
    return [];
  }

  return (data || []) as SalesRole[];
}

export async function createSalesRole(
  orgId: number,
  data: SalesRoleInput,
  supabase: SupabaseClient
): Promise<SalesRole | null> {
  const { data: result, error } = await supabase
    .from('sales_roles')
    .insert({
      organization_id: orgId,
      code: data.code,
      name: data.name,
      area: data.area,
      responsibilities: data.responsibilities ?? [],
      is_active: data.is_active ?? true,
      sort_order: data.sort_order ?? 0,
      job_position_id: data.job_position_id ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return result as SalesRole;
}

export async function updateSalesRole(
  id: string,
  orgId: number,
  data: SalesRoleUpdateInput,
  supabase: SupabaseClient
): Promise<SalesRole | null> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.code !== undefined) updateData.code = data.code;
  if (data.name !== undefined) updateData.name = data.name;
  if (data.area !== undefined) updateData.area = data.area;
  if (data.responsibilities !== undefined) updateData.responsibilities = data.responsibilities;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;
  if (data.sort_order !== undefined) updateData.sort_order = data.sort_order;
  if (data.job_position_id !== undefined) updateData.job_position_id = data.job_position_id;

  const { data: result, error } = await supabase
    .from('sales_roles')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .single();

  if (error) throw error;
  return result as SalesRole;
}

export async function deleteSalesRole(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('sales_roles')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) throw error;
}

// ─── Sales Teams ─────────────────────────────────────────────────────────────

export async function getSalesTeams(
  orgId: number,
  supabase: SupabaseClient
): Promise<SalesTeam[]> {
  const { data, error } = await supabase
    .from('sales_teams')
    .select('*, territories(id, name)')
    .eq('organization_id', orgId)
    .order('name', { ascending: true });

  if (error) {
    console.warn('salesStructureService.getSalesTeams - error:', error.message);
    return [];
  }

  const teams = (data || []) as SalesTeam[];
  if (teams.length === 0) return teams;

  // Cargar miembros para cada team
  const teamIds = teams.map((t) => t.id);
  const { data: members, error: memberError } = await supabase
    .from('sales_team_members')
    .select(`
      *,
      sales_roles:sales_role_id(id, name, code),
      profiles:user_id(id, first_name, last_name, email),
      territories:territory_id(id, name)
    `)
    .in('sales_team_id', teamIds)
    .eq('is_active', true);

  if (memberError) {
    console.warn('salesStructureService.getSalesTeams - members error:', memberError.message);
  }

  const membersMap = new Map<string, SalesTeamMember[]>();
  for (const m of members || []) {
    const member = m as SalesTeamMember;
    const list = membersMap.get(member.sales_team_id) || [];
    list.push(member);
    membersMap.set(member.sales_team_id, list);
  }

  return teams.map((team) => ({
    ...team,
    members: membersMap.get(team.id) || [],
  }));
}

export async function createSalesTeam(
  orgId: number,
  data: SalesTeamInput,
  supabase: SupabaseClient
): Promise<SalesTeam | null> {
  const { data: result, error } = await supabase
    .from('sales_teams')
    .insert({
      organization_id: orgId,
      name: data.name,
      description: data.description ?? null,
      is_active: data.is_active ?? true,
      territory_id: data.territory_id ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return result as SalesTeam;
}

export async function updateSalesTeam(
  id: string,
  orgId: number,
  data: SalesTeamUpdateInput,
  supabase: SupabaseClient
): Promise<SalesTeam | null> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;
  if (data.territory_id !== undefined) updateData.territory_id = data.territory_id;

  const { data: result, error } = await supabase
    .from('sales_teams')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .single();

  if (error) throw error;
  return result as SalesTeam;
}

export async function deleteSalesTeam(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('sales_teams')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) throw error;
}

// ─── Team Members ────────────────────────────────────────────────────────────

export async function getTeamMembers(
  teamId: string,
  supabase: SupabaseClient
): Promise<SalesTeamMember[]> {
  const { data, error } = await supabase
    .from('sales_team_members')
    .select(`
      *,
      sales_roles:sales_role_id(id, name, code),
      profiles:user_id(id, first_name, last_name, email),
      territories:territory_id(id, name)
    `)
    .eq('sales_team_id', teamId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('salesStructureService.getTeamMembers - error:', error.message);
    return [];
  }

  return (data || []) as SalesTeamMember[];
}

export async function addTeamMember(
  orgId: number,
  teamId: string,
  data: TeamMemberInput,
  supabase: SupabaseClient
): Promise<SalesTeamMember | null> {
  const { data: result, error } = await supabase
    .from('sales_team_members')
    .insert({
      organization_id: orgId,
      sales_team_id: teamId,
      user_id: data.user_id,
      sales_role_id: data.sales_role_id ?? null,
      quota_amount: data.quota_amount ?? null,
      quota_currency: data.quota_currency ?? 'COP',
      is_active: data.is_active ?? true,
      territory_id: data.territory_id ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return result as SalesTeamMember;
}

export async function updateTeamMember(
  id: string,
  orgId: number,
  data: TeamMemberUpdateInput,
  supabase: SupabaseClient
): Promise<SalesTeamMember | null> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.sales_role_id !== undefined) updateData.sales_role_id = data.sales_role_id;
  if (data.quota_amount !== undefined) updateData.quota_amount = data.quota_amount;
  if (data.quota_currency !== undefined) updateData.quota_currency = data.quota_currency;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;

  const { data: result, error } = await supabase
    .from('sales_team_members')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .single();

  if (error) throw error;
  return result as SalesTeamMember;
}

export async function removeTeamMember(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('sales_team_members')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) throw error;
}

// ─── Territories ─────────────────────────────────────────────────────────────

export async function getTerritories(
  orgId: number,
  supabase: SupabaseClient
): Promise<Territory[]> {
  const { data, error } = await supabase
    .from('territories')
    .select('*')
    .eq('organization_id', orgId)
    .order('name', { ascending: true });

  if (error) {
    console.warn('salesStructureService.getTerritories - error:', error.message);
    return [];
  }

  return (data || []) as Territory[];
}

export async function createTerritory(
  orgId: number,
  data: TerritoryInput,
  supabase: SupabaseClient
): Promise<Territory | null> {
  const { data: result, error } = await supabase
    .from('territories')
    .insert({
      organization_id: orgId,
      name: data.name,
      criteria: data.criteria ?? {},
      is_active: data.is_active ?? true,
    })
    .select()
    .single();

  if (error) throw error;
  return result as Territory;
}

export async function updateTerritory(
  id: string,
  orgId: number,
  data: TerritoryUpdateInput,
  supabase: SupabaseClient
): Promise<Territory | null> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.criteria !== undefined) updateData.criteria = data.criteria;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;

  const { data: result, error } = await supabase
    .from('territories')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .single();

  if (error) throw error;
  return result as Territory;
}

export async function deleteTerritory(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('territories')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) throw error;
}
