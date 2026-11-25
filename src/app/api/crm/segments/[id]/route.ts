/**
 * DELETE /api/crm/segments/[id] — elimina un segmento (Figma CRM 1384:17,
 * anotación: «eliminar un segmento en uso pide confirmación y lo impide si hay
 * campaña en curso»).
 *
 * - Organización de la sesión; permiso `crm.segments.manage`.
 * - 409 `segmento_en_campana_en_curso` si una campaña de WhatsApp/correo que
 *   lo usa está enviando, o una de voz está programada o en marcha. El resto
 *   de usos (borradores, terminadas, secuencias) solo se avisa en la pantalla.
 * - El borrado va con la sesión del usuario (RLS de `segments`).
 * Respuesta: `{ success: true }`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, exigirUuid, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { campanaEnCursoDeSegmento } from '@/lib/services/crm/segmentosImportacionService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.segmentosGestionar], 'DELETE /api/crm/segments/[id]');
    const id = exigirUuid((await params).id);
    if (await campanaEnCursoDeSegmento(ctx.supabase, ctx.organizationId, id)) {
      throw new CrmHttpError(409, 'segmento_en_campana_en_curso', 'Hay una campaña en curso con este segmento');
    }
    const { data, error } = await ctx.supabase.from('segments').delete().eq('organization_id', ctx.organizationId).eq('id', id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new CrmHttpError(404, 'segmento_no_encontrado', 'Segmento no encontrado');
    return NextResponse.json({ success: true });
  } catch (error) {
    return respuestaErrorCrm(error, 'DELETE /api/crm/segments/[id]');
  }
}
