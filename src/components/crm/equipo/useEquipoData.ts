'use client';

import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { SalesRole, SalesTeam, Territory, OrgMember, SalesTeamMember } from './types';

export function requireOrgId(): number {
  const orgId = getOrganizationId();
  if (!orgId) throw new Error('No se pudo determinar la organización');
  return orgId;
}

/**
 * Carga equipos con sus miembros, roles, territorios y miembros de la org.
 * Reutilizable por EquiposTab y otros componentes.
 */
export async function loadTeamsWithMembers(orgId: number) {
  const [teamsRes, rolesRes, territoriesRes, membersRes] = await Promise.all([
    supabase
      .from('sales_teams')
      .select('*, territories(id, name)')
      .eq('organization_id', orgId)
      .order('name'),
    supabase
      .from('sales_roles')
      .select('*, job_positions(id, name)')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('territories')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('organization_members')
      .select('user_id, profiles:user_id(id, first_name, last_name, email)')
      .eq('organization_id', orgId)
      .eq('is_active', true),
  ]);

  if (teamsRes.error) throw teamsRes.error;
  if (rolesRes.error) throw rolesRes.error;
  if (territoriesRes.error) throw territoriesRes.error;
  if (membersRes.error) throw membersRes.error;

  const teamList = (teamsRes.data || []) as SalesTeam[];
  const roleList = (rolesRes.data || []) as SalesRole[];
  const territoryList = (territoriesRes.data || []) as Territory[];

  // Cargar miembros de los equipos
  if (teamList.length > 0) {
    const teamIds = teamList.map((t) => t.id);
    const { data: membersData, error: memberErr } = await supabase
      .from('sales_team_members')
      .select(
        `*, sales_roles:sales_role_id(id, name, code), profiles:user_id(id, first_name, last_name, email), territories:territory_id(id, name)`
      )
      .in('sales_team_id', teamIds)
      .eq('is_active', true);
    if (memberErr) throw memberErr;

    const membersMap = new Map<string, SalesTeamMember[]>();
    for (const m of membersData || []) {
      const member = m as SalesTeamMember;
      const list = membersMap.get(member.sales_team_id) || [];
      list.push(member);
      membersMap.set(member.sales_team_id, list);
    }
    teamList.forEach((t) => (t.members = membersMap.get(t.id) || []));
  }

  const orgMemberList = (
    membersRes.data || [] as {
      user_id: string;
      profiles: { id: string; first_name: string | null; last_name: string | null; email: string | null }[];
    }[]
  ).map((m) => {
    const p = m.profiles?.[0] || null;
    const full = p ? [p.first_name, p.last_name].filter(Boolean).join(' ') : '';
    return { id: m.user_id, name: full || p?.email || m.user_id.slice(0, 8), email: p?.email || undefined };
  }) as OrgMember[];

  return { teams: teamList, roles: roleList, territories: territoryList, orgMembers: orgMemberList };
}
