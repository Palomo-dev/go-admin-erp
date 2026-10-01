/** Verificación RNE: sesión, permiso canónico, audiencia y versión propias. */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hasOrgAdminOrPermission, withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { ultimaVerificacionRne } from '@/lib/services/crm/voiceAgent/cumplimiento';
import { MAX_BYTES_ARCHIVO_RNE, VIGENCIA_RNE_DIAS, verificacionRneRegistradaVigente } from '@/lib/services/crm/voiceAgent/rne';
import { registrarVerificacionRne, RneValidationError } from '@/lib/services/crm/voiceAgent/rneService';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, exigirUuid, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { voiceCampaignVersionSchema } from '@/lib/services/crm/voiceCampaignWriteLogica';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };
const schema = voiceCampaignVersionSchema.extend({ nombre_archivo: z.string().max(255).nullable().optional(), contenido: z.string() }).strict();
async function campaignIdOf(rp?: { params: Promise<Record<string, string | string[] | undefined>> }): Promise<string> {
  const p = rp ? await rp.params : {};
  return exigirUuid(typeof p.id === 'string' ? p.id : '');
}
export const GET = withOrg(async (ctx, _request, rp) => {
  try {
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesVer], 'verificación RNE de voz');
    const id = await campaignIdOf(rp);
    const { data, error } = await ctx.supabase.from('voice_agent_campaigns').select('id').eq('id', id)
      .eq('organization_id', ctx.organizationId).is('stats->>archived_at', null).maybeSingle();
    if (error) throw error;
    if (!data) throw new CrmHttpError(404, 'campana_no_encontrada', 'Campaña no encontrada');
    const [v, puedeVerificar] = await Promise.all([
      ultimaVerificacionRne(ctx.supabase, ctx.organizationId, id),
      hasOrgAdminOrPermission(ctx, CRM_PERMISOS.campanasGestionar),
    ]);
    return NextResponse.json({ success: true, data: v ? { ...v, vigente: verificacionRneRegistradaVigente(v) } : null,
      vigencia_dias: VIGENCIA_RNE_DIAS, puede_verificar: puedeVerificar }, { headers: NO_STORE });
  } catch (e) { return respuestaErrorCrm(e, 'GET /api/crm/voice-agents/campaigns/[id]/rne'); }
});
export const POST = withOrg(async (ctx, request, rp) => {
  try {
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.campanasGestionar], 'importar RNE de voz');
    const id = await campaignIdOf(rp);
    if (Number(request.headers.get('content-length') || 0) > MAX_BYTES_ARCHIVO_RNE * 1.2)
      throw new RneValidationError('El archivo supera 8 MB.', 413);
    const parsed = schema.safeParse(sinClavesDeOrganizacion(await readOrgBody(ctx, request)));
    if (!parsed.success) throw new CrmHttpError(400, 'datos_invalidos', 'Archivo o versión inválidos');
    const data = await registrarVerificacionRne(getServiceClient(), ctx.organizationId, id, ctx.userId, {
      nombre: parsed.data.nombre_archivo ?? null, contenido: parsed.data.contenido,
      ...(parsed.data.expected_updated_at ? { expectedUpdatedAt: parsed.data.expected_updated_at } : {}),
    });
    return NextResponse.json({ success: true, data: { ...data, vigente: verificacionRneRegistradaVigente(data) } }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof RneValidationError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    return respuestaErrorCrm(e, 'POST /api/crm/voice-agents/campaigns/[id]/rne');
  }
});
