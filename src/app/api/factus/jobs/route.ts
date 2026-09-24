/**
 * API Route: Gestión de Jobs de Facturación Electrónica
 * GET /api/factus/jobs - Lista jobs de la organización de la sesión
 * POST /api/factus/jobs - Reintentar job (body: { jobId, action: 'retry' })
 * DELETE /api/factus/jobs?jobId= - Cancelar job
 *
 * SEGURIDAD (GO-sec, 2026-09-23; auditoría de integraciones §3.4): antes la
 * organización salía de `?organizationId=` y POST/DELETE actuaban sobre
 * cualquier `jobId` (solo la RLS evitaba el cruce), sin permiso y sobre jobs en
 * cualquier estado, incluso `accepted`. Ahora: `withOrg` (sesión + organización
 * de la sesión), `readOrgBody` (organización ajena en body o query → 403 y
 * registro), permiso `finance.*` resuelto en el servidor y el job tiene que ser
 * de la organización (404 si no) y estar en un estado que admita la acción
 * (409 si no).
 */

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError, type ServerOrgContext } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';

const RUTA = 'factus/jobs';

/** Estados desde los que tiene sentido reintentar o cancelar. */
const REINTENTABLES = ['failed', 'cancelled', 'rejected'];
const CANCELABLES = ['pending', 'failed'];

async function jobPropio(ctx: ServerOrgContext, jobId: string): Promise<{ id: string; status: string }> {
  const { data, error } = await ctx.supabase
    .from('electronic_invoicing_jobs')
    .select('id, status')
    .eq('id', jobId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error || !data) throw new OrgContextError('Job no encontrado', 404, 'NOT_FOUND');
  return data as { id: string; status: string };
}

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);

    let query = ctx.supabase
      .from('electronic_invoicing_jobs')
      .select(`
        *,
        invoice:invoice_sales(
          id,
          number,
          total,
          customer:customers(first_name, last_name, company_name)
        )
      `, { count: 'exact' })
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Error obteniendo jobs' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
      total: count,
      limit,
      offset,
    });
  } catch (error: unknown) {
    return routeErrorResponse('Factus jobs GET', error);
  }
});

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<{ jobId?: string; action?: string }>(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.CREAR, RUTA);
    const { jobId, action } = body;

    if (!jobId) {
      return NextResponse.json(
        { error: 'Se requiere jobId' },
        { status: 400 }
      );
    }

    if (action !== 'retry') {
      return NextResponse.json(
        { error: 'Acción no válida' },
        { status: 400 }
      );
    }

    const job = await jobPropio(ctx, jobId);
    if (!REINTENTABLES.includes(job.status)) {
      return NextResponse.json(
        { error: `Un job en estado ${job.status} no se puede reintentar` },
        { status: 409 }
      );
    }

    // Marcar job para reintento (filtro por organización y estado: sin carrera)
    const { data, error } = await ctx.supabase
      .from('electronic_invoicing_jobs')
      .update({
        status: 'pending',
        next_retry_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('organization_id', ctx.organizationId)
      .in('status', REINTENTABLES)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Error actualizando job' },
        { status: 500 }
      );
    }

    await ctx.supabase
      .from('electronic_invoicing_events')
      .insert({
        job_id: job.id,
        organization_id: ctx.organizationId,
        event_type: 'retry_scheduled',
        event_message: 'Reintento manual programado',
      });

    return NextResponse.json({
      success: true,
      data,
      message: 'Job programado para reintento',
    });
  } catch (error: unknown) {
    return routeErrorResponse('Factus jobs POST', error);
  }
});

export const DELETE = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.ANULAR, RUTA);

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'Se requiere jobId' },
        { status: 400 }
      );
    }

    const job = await jobPropio(ctx, jobId);
    if (!CANCELABLES.includes(job.status)) {
      return NextResponse.json(
        { error: `Un job en estado ${job.status} no se puede cancelar` },
        { status: 409 }
      );
    }

    const { data, error } = await ctx.supabase
      .from('electronic_invoicing_jobs')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('organization_id', ctx.organizationId)
      .in('status', CANCELABLES)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Error cancelando job' },
        { status: 500 }
      );
    }

    await ctx.supabase
      .from('electronic_invoicing_events')
      .insert({
        job_id: job.id,
        organization_id: ctx.organizationId,
        event_type: 'cancelled',
        event_message: 'Job cancelado manualmente',
      });

    return NextResponse.json({
      success: true,
      data,
      message: 'Job cancelado',
    });
  } catch (error: unknown) {
    return routeErrorResponse('Factus jobs DELETE', error);
  }
});
