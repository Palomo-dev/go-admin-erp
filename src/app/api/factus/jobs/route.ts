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
 *
 * ESCRITURA SOLO DEL SERVIDOR (GO-sec, 2026-09-24): la RLS de
 * `electronic_invoicing_jobs`/`_events` es de solo lectura para el cliente
 * (migración 20260925120000). Reintentar y cancelar pasan por
 * `fn_einvoicing_accion_manual` (service_role), que en una transacción
 * actualiza el job, registra el evento con el actor y vuelve a exigir
 * pertenencia y estado. Un reintento no toca `hold_reason`: la retención solo
 * la quita la liberación de `/api/factus/config`.
 */

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError, type ServerOrgContext } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { getServiceClient } from '@/lib/supabase/server-service';

const RUTA = 'factus/jobs';

/** Estados desde los que tiene sentido reintentar o cancelar (los mismos que exige la función SQL). */
const REINTENTABLES = ['failed', 'cancelled', 'rejected'];
const CANCELABLES = ['pending', 'failed'];

/**
 * Reintento o cancelación en el servidor. La organización y el actor salen de
 * la sesión (`ctx`), nunca del cliente.
 */
async function accionManual(ctx: ServerOrgContext, jobId: string, accion: 'retry' | 'cancel'): Promise<Record<string, unknown>> {
  const { data, error } = await getServiceClient().rpc('fn_einvoicing_accion_manual', {
    p_job_id: jobId,
    p_organization_id: ctx.organizationId,
    p_accion: accion,
    p_actor: ctx.userId,
  });
  if (error) {
    if (error.code === 'P0002') throw new OrgContextError('Job no encontrado', 404, 'NOT_FOUND');
    if (error.code === '55000') throw new OrgContextError(error.message, 409, 'INVALID_STATE');
    if (error.code === '42501') throw new OrgContextError('Sin acceso a la organización', 403, 'FORBIDDEN');
    console.error(`[${RUTA}] fn_einvoicing_accion_manual (${accion}) falló:`, error.message);
    throw new OrgContextError(accion === 'retry' ? 'Error actualizando job' : 'Error cancelando job', 500, 'INTERNAL');
  }
  return (data ?? {}) as Record<string, unknown>;
}

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

    // Reintento en el servidor: job + evento en una transacción, con el mismo
    // filtro de organización y estado (sin carrera).
    const data = await accionManual(ctx, job.id, 'retry');

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

    const data = await accionManual(ctx, job.id, 'cancel');

    return NextResponse.json({
      success: true,
      data,
      message: 'Job cancelado',
    });
  } catch (error: unknown) {
    return routeErrorResponse('Factus jobs DELETE', error);
  }
});
