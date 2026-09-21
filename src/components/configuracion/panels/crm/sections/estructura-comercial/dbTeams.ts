import { supabase } from '@/lib/supabase/config';
import { pickEmbedded, profileDisplayName, type EmbeddedProfile } from '@/lib/utils/embeddedProfile';
import { requireOrgId } from './dbRoles';
import type { OrgMember, SalesTeam, SalesTeamMember } from './types';

/** Capa de datos directa con Supabase cliente (con RLS) — equipos y miembros. */
export const teamsDb = {
  async getTeams(): Promise<SalesTeam[]> {
    const orgId = requireOrgId();
    const { data: teams, error } = await supabase
      .from('sales_teams')
      .select('*, territories(id, name)')
      .eq('organization_id', orgId)
      .order('name', { ascending: true });
    if (error) throw error;
    const teamList = (teams || []) as SalesTeam[];
    if (teamList.length === 0) return teamList;
    const teamIds = teamList.map((t) => t.id);
    const { data: members, error: memberError } = await supabase
      .from('sales_team_members')
      .select(
        `
        *,
        sales_roles:sales_role_id(id, name, code),
        profiles:user_id(id, first_name, last_name, email),
        territories:territory_id(id, name)
      `,
      )
      .eq('organization_id', orgId)
      .in('sales_team_id', teamIds)
      .eq('is_active', true);
    if (memberError) throw memberError;
    const membersMap = new Map<string, SalesTeamMember[]>();
    for (const m of members || []) {
      const member = m as SalesTeamMember;
      const list = membersMap.get(member.sales_team_id) || [];
      list.push(member);
      membersMap.set(member.sales_team_id, list);
    }
    return teamList.map((t) => ({ ...t, members: membersMap.get(t.id) || [] }));
  },
  async createTeam(body: {
    name: string;
    description?: string | null;
    is_active?: boolean;
    territory_id?: string | null;
  }): Promise<SalesTeam> {
    const orgId = requireOrgId();
    const { data, error } = await supabase
      .from('sales_teams')
      .insert({
        organization_id: orgId,
        name: body.name,
        description: body.description ?? null,
        is_active: body.is_active ?? true,
        territory_id: body.territory_id ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as SalesTeam;
  },
  async updateTeam(id: string, body: Partial<SalesTeam>): Promise<SalesTeam> {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.territory_id !== undefined) updateData.territory_id = body.territory_id;
    const { data, error } = await supabase
      .from('sales_teams')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as SalesTeam;
  },
  async deleteTeam(id: string): Promise<void> {
    const { error } = await supabase.from('sales_teams').delete().eq('id', id);
    if (error) throw error;
  },
  // ── Team Members ──
  async addTeamMember(
    teamId: string,
    body: {
      user_id: string;
      sales_role_id?: string | null;
      quota_amount?: number | null;
      quota_currency?: string;
      is_active?: boolean;
      territory_id?: string | null;
    },
  ): Promise<SalesTeamMember> {
    const orgId = requireOrgId();
    const { data, error } = await supabase
      .from('sales_team_members')
      .insert({
        organization_id: orgId,
        sales_team_id: teamId,
        user_id: body.user_id,
        sales_role_id: body.sales_role_id ?? null,
        quota_amount: body.quota_amount ?? null,
        quota_currency: body.quota_currency ?? 'COP',
        is_active: body.is_active ?? true,
        territory_id: body.territory_id ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as SalesTeamMember;
  },
  async removeTeamMember(teamId: string, memberId: string): Promise<void> {
    const { error } = await supabase
      .from('sales_team_members')
      .delete()
      .eq('id', memberId)
      .eq('sales_team_id', teamId);
    if (error) throw error;
  },
  // ── Org Members ──
  async getOrgMembers(): Promise<OrgMember[]> {
    const orgId = requireOrgId();
    const { data, error } = await supabase
      .from('organization_members')
      .select('user_id, profiles:user_id(id, first_name, last_name, email)')
      .eq('organization_id', orgId)
      .eq('is_active', true);
    if (error) throw error;
    // Embebido a-uno: objeto, no array. Con `profiles[0]` la lista mostraba el
    // identificador del usuario recortado en lugar del nombre.
    type Fila = { user_id: string; profiles: EmbeddedProfile | EmbeddedProfile[] | null };
    return ((data || []) as Fila[]).map((m) => {
      const p = pickEmbedded(m.profiles);
      return { id: m.user_id, name: profileDisplayName(m.profiles), email: p?.email || undefined };
    });
  },
};
