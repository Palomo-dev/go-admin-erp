// Tipos compartidos del módulo Equipo Comercial

export interface SalesRole {
  id: string;
  code: string;
  name: string;
  area: string;
  responsibilities: unknown[];
  is_active: boolean;
  sort_order: number;
  job_position_id: string | null;
  job_positions?: { id: string; name: string } | null;
}

export interface SalesTeamMember {
  id: string;
  sales_team_id: string;
  user_id: string;
  sales_role_id: string | null;
  quota_amount: number | null;
  quota_currency: string;
  is_active: boolean;
  territory_id: string | null;
  sales_roles?: { id: string; name: string; code: string } | null;
  profiles?: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
  territories?: { id: string; name: string } | null;
}

export interface SalesTeam {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  territory_id: string | null;
  territories?: { id: string; name: string } | null;
  members?: SalesTeamMember[];
}

export interface Territory {
  id: string;
  name: string;
  criteria: Record<string, unknown>;
  is_active: boolean;
}

export interface OrgMember {
  id: string;
  name: string;
  email?: string;
}

export interface Opportunity {
  id: string;
  name: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  stage_id: string | null;
  salesperson_id: string | null;
  sales_team_id: string | null;
  territory_id: string | null;
  customer_id: string | null;
  expected_close_date: string | null;
  customers?: { full_name: string }[] | null;
  stages?: { name: string; probability: number }[] | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function memberName(m: SalesTeamMember): string {
  const p = m.profiles;
  if (!p) return m.user_id.slice(0, 8);
  const full = [p.first_name, p.last_name].filter(Boolean).join(' ');
  return full || p.email || m.user_id.slice(0, 8);
}

export function memberInitials(m: SalesTeamMember): string {
  return memberName(m).charAt(0).toUpperCase();
}
