import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * F1 — configuración de la asignación automática de leads por organización.
 *
 * No hay columna de estrategia en `sales_teams` ni tabla propia (verificado
 * por MCP el 2026-09-21: `sales_teams`, `sales_team_members`, `territories`
 * no la tienen). Se guarda SIN migración en `organization_settings`
 * (`UNIQUE (organization_id, key)`, RLS por pertenencia), la misma convención
 * que F14 usa para `crm_revenue_math` y el POS para `pos_*`:
 *
 *   key      = 'crm_lead_assignment'
 *   settings = { enabled?: boolean, strategy?: AssignmentStrategy, team_id?: uuid | null }
 *
 * Sin fila (el caso de todas las organizaciones hoy) la asignación está
 * ACTIVA con `round_robin` sobre el primer equipo activo de la organización:
 * sin equipos o sin miembros no cambia nada (el lead queda sin asignar), así
 * que activar la función es tan simple como crear un equipo con miembros.
 */

export const LEAD_ASSIGNMENT_SETTINGS_KEY = 'crm_lead_assignment';

export const LEAD_ASSIGNMENT_STRATEGIES = ['round_robin', 'territory', 'load_balance'] as const;
export type LeadAssignmentStrategy = (typeof LEAD_ASSIGNMENT_STRATEGIES)[number];

export const DEFAULT_LEAD_ASSIGNMENT_STRATEGY: LeadAssignmentStrategy = 'round_robin';

export interface LeadAssignmentConfig {
  /** `false` apaga la asignación automática (el lead queda sin asignar salvo `salesperson_id` explícito). */
  enabled: boolean;
  strategy: LeadAssignmentStrategy;
  /** Equipo sobre el que se asigna; `null` = primer equipo activo de la organización. */
  team_id: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DEFAULT_LEAD_ASSIGNMENT_CONFIG: LeadAssignmentConfig = Object.freeze({
  enabled: true,
  strategy: DEFAULT_LEAD_ASSIGNMENT_STRATEGY,
  team_id: null,
});

/**
 * Interpreta el jsonb de `organization_settings.settings`. Tolerante: cualquier
 * valor inválido cae al valor por defecto de ese campo, nunca lanza.
 */
export function parseLeadAssignmentConfig(settings: unknown): LeadAssignmentConfig {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return { ...DEFAULT_LEAD_ASSIGNMENT_CONFIG };
  }
  const s = settings as Record<string, unknown>;
  const strategy = (LEAD_ASSIGNMENT_STRATEGIES as readonly string[]).includes(String(s.strategy))
    ? (s.strategy as LeadAssignmentStrategy)
    : DEFAULT_LEAD_ASSIGNMENT_STRATEGY;
  const teamId = typeof s.team_id === 'string' && UUID_RE.test(s.team_id) ? s.team_id : null;
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : true,
    strategy,
    team_id: teamId,
  };
}

/**
 * Lee la configuración de la organización. Si la lectura falla se registra y
 * se devuelve la configuración por defecto: un fallo de configuración no debe
 * impedir ni el alta del lead ni la asignación.
 */
export async function getLeadAssignmentConfig(
  organizationId: number,
  supabase: SupabaseClient,
): Promise<LeadAssignmentConfig> {
  const { data, error } = await supabase
    .from('organization_settings')
    .select('settings')
    .eq('organization_id', organizationId)
    .eq('key', LEAD_ASSIGNMENT_SETTINGS_KEY)
    .maybeSingle();
  if (error) {
    console.warn('[leadAssignmentConfig] no se pudo leer la configuración de la org %s: %s', organizationId, error.message);
    return { ...DEFAULT_LEAD_ASSIGNMENT_CONFIG };
  }
  return parseLeadAssignmentConfig(data?.settings);
}
