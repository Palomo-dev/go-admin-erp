/**
 * API Route: configuración de facturación electrónica que ve el CLIENTE.
 *
 * GET  /api/factus/config
 *   Estado del servicio de GO Admin para la organización de la sesión (activo,
 *   pendiente de activación, suspendido), su resolución y rangos, la cola y los
 *   documentos retenidos. NUNCA credenciales: las carga la plataforma
 *   (go-admin-super) y viven cifradas en Vault.
 *
 * POST /api/factus/config  (administrador de la organización o `finance.approve`)
 *   { action: 'verificar' }                        → prueba la cuenta de Factus y, si el NIT coincide, activa
 *   { action: 'sincronizar_rangos', branchId }     → copia los rangos de la cuenta a la sucursal
 *   { action: 'liberar', jobId }                   → envía un documento retenido (con la fecha de hoy)
 *
 * La organización sale de la sesión (`withOrg`); los permisos se resuelven en
 * el servidor (`requireOrgAdminOrPermission`).
 */

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError, requireOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { obtenerAccesoFactus, verificarYActivar, FacturacionNoActivadaError } from '@/lib/services/einvoicing/accesoFactus.server';
import { leerRangosFactus, sincronizarRangos } from '@/lib/services/einvoicing/rangosFactus.server';
import { liberarRetenido, procesarAhora } from '@/lib/services/einvoicing/colaFacturacion.server';

const PERMISO_CONFIGURAR = 'finance.approve';

export const GET = withOrg(async (ctx) => {
  const db = getServiceClient();
  const org = ctx.organizationId;

  const [config, rangos, jobs, retenidos] = await Promise.all([
    db
      .from('electronic_invoicing_config')
      .select('service_status, environment, activated_at, factus_company_nit, last_check_at, last_check_ok, last_check_message, credentials_secret_id')
      .eq('organization_id', org)
      .eq('provider', 'factus')
      .maybeSingle(),
    ctx.supabase
      .from('invoice_sequences')
      .select('id, branch_id, document_type, prefix, resolution_number, resolution_date, range_start, range_end, current_number, valid_from, valid_until, is_active, alert_threshold, factus_numbering_range_id, branch:branches(name)')
      .eq('organization_id', org)
      .order('document_type')
      .order('id', { ascending: false }),
    db.from('electronic_invoicing_jobs').select('status, hold_reason').eq('organization_id', org),
    db
      .from('electronic_invoicing_jobs')
      .select('id, document_type, created_at, hold_reason, invoice:invoice_sales(number, total, issue_date), support_document:support_documents(reference_code, total, issue_date)')
      .eq('organization_id', org)
      .eq('status', 'pending')
      .not('hold_reason', 'is', null)
      .order('created_at', { ascending: true })
      .limit(50),
  ]);

  const c = config.data as
    | {
        service_status: string;
        environment: string;
        activated_at: string | null;
        factus_company_nit: string | null;
        last_check_at: string | null;
        last_check_ok: boolean | null;
        last_check_message: string | null;
        credentials_secret_id: string | null;
      }
    | null;

  const conteo: Record<string, number> = {};
  for (const j of (jobs.data ?? []) as Array<{ status: string; hold_reason: string | null }>) {
    const clave = j.hold_reason && j.status === 'pending' ? 'held' : j.status;
    conteo[clave] = (conteo[clave] ?? 0) + 1;
  }

  return NextResponse.json({
    service: {
      status: c ? c.service_status : 'pending_activation',
      hasCredentials: !!c?.credentials_secret_id,
      environment: c?.environment ?? null,
      activatedAt: c?.activated_at ?? null,
      companyNit: c?.factus_company_nit ?? null,
      lastCheck: c?.last_check_at ? { at: c.last_check_at, ok: c.last_check_ok, message: c.last_check_message } : null,
    },
    ranges: rangos.data ?? [],
    queue: conteo,
    held: retenidos.data ?? [],
  });
});

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<{ action?: string; branchId?: number | string; jobId?: string }>(ctx, request, {
      route: 'factus/config',
    });
    await requireOrgAdminOrPermission(ctx, PERMISO_CONFIGURAR);

    switch (body?.action) {
      case 'verificar': {
        const r = await verificarYActivar(ctx.organizationId, ctx.userId);
        return NextResponse.json(r, { status: r.ok ? 200 : 422 });
      }

      case 'sincronizar_rangos': {
        const branchId = Number(body.branchId);
        if (!Number.isInteger(branchId) || branchId <= 0) {
          return NextResponse.json({ error: 'Indique la sucursal (branchId)' }, { status: 400 });
        }
        const { data: sucursal } = await ctx.supabase
          .from('branches')
          .select('id')
          .eq('id', branchId)
          .eq('organization_id', ctx.organizationId)
          .maybeSingle();
        if (!sucursal) return NextResponse.json({ error: 'Sucursal no encontrada' }, { status: 404 });

        const acceso = await obtenerAccesoFactus(ctx.organizationId, { permitirDemoDesarrollo: true });
        const rangos = await leerRangosFactus(acceso);
        const r = await sincronizarRangos(ctx.supabase, { organizationId: ctx.organizationId, branchId, rangos });
        return NextResponse.json({ success: true, ...r });
      }

      case 'liberar': {
        const jobId = typeof body.jobId === 'string' ? body.jobId : null;
        if (!jobId) return NextResponse.json({ error: 'Indique el documento (jobId)' }, { status: 400 });
        await liberarRetenido({ jobId, organizationId: ctx.organizationId, actor: ctx.userId });
        const resultado = await procesarAhora(jobId);
        return NextResponse.json({ success: true, jobId, status: resultado?.estado ?? 'pending', message: resultado?.mensaje ?? null });
      }

      default:
        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    }
  } catch (error: unknown) {
    if (error instanceof OrgContextError) throw error;
    if (error instanceof FacturacionNoActivadaError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    const code = (error as { code?: string } | null)?.code;
    if (code === 'P0002') return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    console.error('[factus/config] error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'No se pudo completar la acción' }, { status: 500 });
  }
});
