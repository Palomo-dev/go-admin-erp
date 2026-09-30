import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import {
  CRM_PERMISOS,
  CrmHttpError,
  exigirPermisoCrm,
  exigirUuid,
  respuestaErrorCrm,
  sinClavesDeOrganizacion,
} from '@/lib/services/crm/crmRouteSupport';
type Contexto = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Contexto) {
  try {
    const ctx = await getServerOrgContext(request);
    await exigirPermisoCrm(
      ctx,
      [CRM_PERMISOS.clientesEditar],
      'PATCH /api/crm/customer-identities/[id]',
    );
    const body = sinClavesDeOrganizacion(await readOrgBody(ctx, request));
    const parsed = z
      .object({
        identity_value: z.string().trim().min(1).max(256).optional(),
        verified: z.boolean().optional(),
      })
      .strict()
      .refine((v) => Object.keys(v).length > 0)
      .safeParse(body);
    if (!parsed.success)
      throw new CrmHttpError(
        400,
        'cuerpo_invalido',
        'Revisa el valor de la identidad',
      );
    const id = exigirUuid((await params).id);
    const { data, error } = await ctx.supabase
      .from('customer_channel_identities')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('organization_id', ctx.organizationId)
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data)
      throw new CrmHttpError(
        404,
        'identidad_no_encontrada',
        'Identidad no encontrada',
      );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorCrm(error, 'PATCH /api/crm/customer-identities/[id]');
  }
}
export async function DELETE(request: NextRequest, { params }: Contexto) {
  try {
    const ctx = await getServerOrgContext(request);
    await exigirPermisoCrm(
      ctx,
      [CRM_PERMISOS.clientesEditar],
      'DELETE /api/crm/customer-identities/[id]',
    );
    await readOrgBody(ctx, request);
    const id = exigirUuid((await params).id);
    const { data, error } = await ctx.supabase
      .from('customer_channel_identities')
      .delete()
      .eq('organization_id', ctx.organizationId)
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data)
      throw new CrmHttpError(
        404,
        'identidad_no_encontrada',
        'Identidad no encontrada',
      );
    return NextResponse.json({ success: true });
  } catch (error) {
    return respuestaErrorCrm(error, 'DELETE /api/crm/customer-identities/[id]');
  }
}
