import { NextResponse } from 'next/server';
import { readOrgBody, withOrg } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { exigirLecturaInformes } from '@/lib/finanzas/informes/acceso.server';
import { guardarConfiguracionSchema } from '@/lib/finanzas/informes/configuracion';
import { cargarConfiguracionInformes, guardarConfiguracionInformes } from '@/lib/services/finanzas/configuracionInformes.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, request) => {
  readOrgBody(ctx, new URL(request.url).searchParams);
  await exigirLecturaInformes(ctx);
  return NextResponse.json(await cargarConfiguracionInformes(ctx.supabase, ctx.organizationId), { headers: { 'Cache-Control': 'private, no-store' } });
});

export const PATCH = withOrg(async (ctx, request) => {
  const body = await readOrgBody(ctx, request, { route: 'finanzas/informes/configuracion' });
  const permiso = await ctx.supabase.rpc('check_user_permission', { p_user_id: ctx.userId, p_organization_id: ctx.organizationId, p_permission_code: 'finance.approve' });
  if (permiso.error || permiso.data !== true) throw new OrgContextError('No tiene permiso para modificar la configuración de informes.', 403, 'FORBIDDEN');
  await exigirLecturaInformes(ctx);
  const validacion = guardarConfiguracionSchema.safeParse(body);
  if (!validacion.success) return NextResponse.json({ error: 'Revise la configuración de informes.', detalles: validacion.error.flatten() }, { status: 400 });
  await guardarConfiguracionInformes(ctx.supabase, ctx.organizationId, validacion.data);
  return NextResponse.json(await cargarConfiguracionInformes(ctx.supabase, ctx.organizationId), { headers: { 'Cache-Control': 'private, no-store' } });
});
