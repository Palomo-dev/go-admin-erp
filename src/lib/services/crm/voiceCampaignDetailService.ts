import { hasOrgAdminOrPermission } from "@/lib/utils/orgContext";
import {
  CRM_PERMISOS,
  exigirPermisoCrm,
  exigirUuid,
  type CrmSesion,
} from "./crmRouteSupport";
import { FAILURE_STREAK_TO_STOP } from "./voiceAgentService";
export interface VozCampanaDetalle {
  campaign: {
    id: string;
    name: string;
    status: string;
    agent_name: string;
    objective: string | null;
    emergency_stop: boolean;
    stopped_reason: string | null;
    stopped_at: string | null;
    consecutive_failures: number;
    max_calls_per_day: number;
    max_calls_per_hour: number;
    max_concurrent: number;
    schedule: Record<string, unknown> | null;
    rne_checked_at: string | null;
    rne_valid_until: string | null;
  };
  stats: {
    targets: number;
    attempts: number;
    today: number;
    effective: number;
    meetings: number;
    conversation_minutes: number;
    remaining_minutes: number | null;
    active_total: number;
    pending: number;
    rescheduled: number;
    outcomes: Record<string, number>;
  };
  history: VozCampanaLlamada[];
  active: VozCampanaLlamada[];
  page: number;
  timezone: string;
  canManage: boolean;
  failureThreshold: number;
}
export interface VozCampanaLlamada {
  id: string;
  customer_name: string | null;
  status: string;
  started_at: string;
  duration_seconds?: number | null;
}
export async function obtenerCampanaVoz(
  ctx: CrmSesion,
  id: string,
  page: number,
): Promise<VozCampanaDetalle> {
  await exigirPermisoCrm(
    ctx,
    [CRM_PERMISOS.oportunidadesVer],
    "detalle de campaña",
  );
  const { data, error } = await ctx.supabase.rpc("crm_voice_campaign_detail", {
    p_org: ctx.organizationId,
    p_campaign: exigirUuid(id),
    p_page: page,
  });
  if (error) throw error;
  return {
    ...(data as Omit<VozCampanaDetalle, "canManage" | "failureThreshold">),
    canManage: await hasOrgAdminOrPermission(
      ctx,
      CRM_PERMISOS.campanasGestionar,
    ),
    failureThreshold: FAILURE_STREAK_TO_STOP,
  };
}
