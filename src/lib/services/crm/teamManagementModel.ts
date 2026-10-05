import type { LeadAssignmentConfig } from './leadAssignmentConfig';
import type { ConditionGroup } from './automation/conditionsDsl';
export interface TeamTerritory {
  id: string; name: string; is_active: boolean; sort_order: number; updated_at: string;
  criteria: { filter?: ConditionGroup; assigned_user_id?: string; rules?: Record<string, unknown>[] };
  customer_count: number; opportunity_count: number; overlap_count: number;
}
export interface TeamMember {
  id: string; sales_team_id: string; user_id: string; name: string;
  sales_role_id: string | null; role_name: string | null;
  territory_id: string | null; is_active: boolean; updated_at: string;
  quota_amount: number | null; quota_currency: string;
  achieved: number | null; quota_pct: number | null; money_missing: boolean;
}
export interface CommercialTeam {
  id: string; name: string; description: string | null; is_active: boolean;
  territory_id: string | null; updated_at: string;
}
export interface TeamPerformance {
  user_id: string; name: string; won: number | null; currency: string;
  calls: number; meetings: number; won_count: number; lost_count: number;
  cycle_days: number | null; conversion: number; quota_pct: number | null; money_missing: boolean;
}
export interface TeamManagementData {
  teams: CommercialTeam[]; members: TeamMember[]; territories: TeamTerritory[];
  roles: { id: string; name: string }[]; people: { id: string; name: string }[];
  performance: TeamPerformance[]; performance_average?:Omit<TeamPerformance,'name'|'user_id'>|null; ranking: { user_id: string; name: string; quota_pct: number | null }[];
  current_user: string; can_manage: boolean; can_configure: boolean; can_view_all: boolean;
  config: LeadAssignmentConfig; config_updated_at: string | null;
  period_start: string; period_end: string; timezone: string; base_currency: string;
  without_territory: number; ranking_enabled: boolean;
}
export interface AssignmentSimulation {
  sample_count: number; preserved: number; unassigned: number; fallback_count: number;
  distribution: { user_id: string; name: string; current: number; proposed: number }[];
}
