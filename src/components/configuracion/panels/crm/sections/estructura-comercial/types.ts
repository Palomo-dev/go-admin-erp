/**
 * Tipos de la Estructura comercial (espejo del servicio): roles, equipos,
 * miembros y territorios. Extraídos de `EstructuraComercialManager.tsx` en el
 * cierre de F1 sin cambiar ningún campo.
 */

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
  profiles?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
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

export interface JobPosition {
  id: string;
  name: string;
}

export interface OrgMember {
  id: string;
  name: string;
  email?: string;
}

export type SubSection = 'roles' | 'teams' | 'territories';
