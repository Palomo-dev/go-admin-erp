import { z } from "zod";
import { hasOrgAdminOrPermission } from "@/lib/utils/orgContext";
import {
  CRM_PERMISOS,
  exigirPermisoCrm,
  type CrmSesion,
} from "./crmRouteSupport";
import {
  proyectarCampana,
  type CampanaUnificadaRaw,
} from "./campaignsUnificadasLogica";
export const campanasUnificadasQuery = z.object({
  channel: z
    .enum(["all", "voice", "messages", "whatsapp", "email"])
    .default("all"),
  q: z.string().trim().max(200).default(""),
  status: z
    .enum([
      "draft",
      "scheduled",
      "running",
      "paused",
      "completed",
      "sending",
      "sent",
      "stopped",
      "blocked",
      "canceled",
      "materializing",
    ])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export async function listarCampanasUnificadas(
  ctx: CrmSesion,
  filters: z.infer<typeof campanasUnificadasQuery>,
) {
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesVer], "ver campañas");
  const { data, error } = await ctx.supabase.rpc("crm_campaigns_unificadas", {
    p_org: ctx.organizationId,
  });
  if (error) throw error;
  const now = new Date();
  const rows = (data as CampanaUnificadaRaw[])
    .map((r) => proyectarCampana(r, now))
    .filter(
      (c) =>
        (filters.channel === "all" ||
          (filters.channel === "messages"
            ? c.source === "message"
            : c.channel === filters.channel)) &&
        (!filters.q ||
          c.name.toLocaleLowerCase().includes(filters.q.toLocaleLowerCase())) &&
        (!filters.status || c.status === filters.status),
    );
  const canManage = await hasOrgAdminOrPermission(ctx, "crm.campaigns.manage");
  return {
    rows: rows.slice((filters.page - 1) * 25, filters.page * 25),
    total: rows.length,
    canManage,
  };
}
