import { z } from "zod";
import {
  createCampaign,
  updateCampaign,
  deleteCampaign,
  type CampaignInput,
} from "./voiceAgentService";
import { requireOrgAdminOrPermission } from "@/lib/utils/orgContext";
import { getServiceClient } from "@/lib/supabase/server-service";
import {
  CRM_PERMISOS,
  CrmHttpError,
  exigirUuid,
  type CrmSesion,
} from "./crmRouteSupport";
import { voiceCampaignCreateSchema, voiceCampaignUpdateSchema } from "./voiceCampaignWriteLogica";
export { voiceCampaignCreateSchema, voiceCampaignUpdateSchema } from "./voiceCampaignWriteLogica";
async function validarReferencias(
  ctx: CrmSesion,
  input: Partial<CampaignInput>,
) {
  if (input.voice_agent_id) {
    const { data, error } = await ctx.supabase
      .from("voice_agents")
      .select("id")
      .eq("id", input.voice_agent_id)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!data)
      throw new CrmHttpError(
        404,
        "agente_no_encontrado",
        "Agente no encontrado",
      );
  }
  if (input.max_concurrent !== undefined) {
    // comm_settings contiene secretos y solo admite service_role. Esta lectura
    // devuelve únicamente el tope del canal de la organización ya autorizada.
    const { data, error } = await getServiceClient()
      .from("comm_settings")
      .select("voice_max_concurrent_calls")
      .eq("organization_id", ctx.organizationId)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (input.max_concurrent > Number(data?.voice_max_concurrent_calls ?? 0))
      throw new CrmHttpError(
        400,
        "concurrencia_invalida",
        "Supera el límite de concurrencia del canal",
      );
  }
  if (input.target_source === "segment") {
    const id = exigirUuid(
      typeof input.target_config?.segment_id === "string"
        ? input.target_config.segment_id
        : "",
    );
    const { data, error } = await ctx.supabase
      .from("segments")
      .select("id")
      .eq("id", id)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!data)
      throw new CrmHttpError(
        404,
        "segmento_no_encontrado",
        "Segmento no encontrado",
      );
  }
  if (input.target_source === "pipeline_stage") {
    const id = exigirUuid(
      typeof input.target_config?.stage_id === "string"
        ? input.target_config.stage_id
        : "",
    );
    const { data: stage, error } = await ctx.supabase
      .from("stages")
      .select("pipeline_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!stage)
      throw new CrmHttpError(404, "etapa_no_encontrada", "Etapa no encontrada");
    const { data: pipeline, error: pe } = await ctx.supabase
      .from("pipelines")
      .select("id")
      .eq("id", stage.pipeline_id)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (pe) throw pe;
    if (!pipeline)
      throw new CrmHttpError(404, "etapa_no_encontrada", "Etapa no encontrada");
  }
  if (
    input.target_source === "manual_list" &&
    input.target_config?.customer_ids !== undefined
  ) {
    const parsed = z
      .array(z.string().uuid())
      .max(500)
      .safeParse(input.target_config.customer_ids);
    if (!parsed.success)
      throw new CrmHttpError(400, "audiencia_invalida", "Audiencia inválida");
    const ids = [...new Set(parsed.data)];
    if (ids.length) {
      const { data, error } = await ctx.supabase
        .from("customers")
        .select("id")
        .eq("organization_id", ctx.organizationId)
        .in("id", ids);
      if (error) throw error;
      if (data?.length !== ids.length)
        throw new CrmHttpError(
          404,
          "cliente_no_encontrado",
          "Cliente no encontrado",
        );
    }
  }
}
export async function guardarCampanaVoz(
  ctx: CrmSesion,
  body: unknown,
  id?: string,
) {
  await requireOrgAdminOrPermission(ctx, CRM_PERMISOS.campanasGestionar);
  const parsed = (
    id ? voiceCampaignUpdateSchema : voiceCampaignCreateSchema
  ).safeParse(body);
  if (!parsed.success)
    throw new CrmHttpError(
      400,
      "datos_invalidos",
      "Datos de campaña inválidos",
    );
  const input = parsed.data as CampaignInput;
  // Un PATCH conserva la fuente y sus referencias: validarlas solo cuando
  // ambas claves llegan en el cuerpo permitiría cambiar a un segmento ajeno.
  let effective: Partial<CampaignInput> = input;
  if (id) {
    const { data: previous, error } = await ctx.supabase
      .from("voice_agent_campaigns")
      .select("voice_agent_id, target_source, target_config, max_concurrent")
      .eq("id", exigirUuid(id))
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!previous)
      throw new CrmHttpError(
        404,
        "campana_no_encontrada",
        "Campaña no encontrada",
      );
    effective = { ...previous, ...input };
    // Pausar o detener sigue disponible si el canal bajó su límite o una
    // audiencia antigua dejó de existir. Los cambios sí vuelven a validarse.
    if (input.max_concurrent === undefined)
      effective.max_concurrent = undefined;
    if (
      input.target_source === undefined &&
      input.target_config === undefined
    ) {
      effective.target_source = undefined;
      effective.target_config = undefined;
    }
  } else {
    effective = { target_source: "manual_list", max_concurrent: 3, ...input };
  }
  await validarReferencias(ctx, effective);
  const result = id
    ? await updateCampaign(
        exigirUuid(id),
        ctx.organizationId,
        input,
        ctx.supabase,
      )
    : await createCampaign(ctx.organizationId, input, ctx.supabase);
  if (!result)
    throw new CrmHttpError(
      404,
      "campana_no_encontrada",
      "Campaña no encontrada",
    );
  return result;
}
export async function eliminarCampanaVoz(ctx: CrmSesion, id: string) {
  await requireOrgAdminOrPermission(ctx, CRM_PERMISOS.campanasGestionar);
  await deleteCampaign(exigirUuid(id), ctx.organizationId, ctx.supabase);
}
