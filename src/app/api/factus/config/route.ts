/**
 * API Route: configuración de facturación electrónica que ve el CLIENTE.
 *
 * GET  /api/factus/config  (`finance.view`)
 *   Estado del servicio de GO Admin para la organización de la sesión (activo,
 *   pendiente de activación, suspendido), su resolución y rangos, la cola y los
 *   documentos retenidos. NUNCA credenciales: las carga la plataforma
 *   (go-admin-super) y viven cifradas en Vault.
 *
 * POST /api/factus/config  (administrador de la organización o `finance.approve`)
 *   { action: 'verificar' }                        → prueba la cuenta de Factus y, si el NIT coincide, activa
 *   { action: 'sincronizar_rangos', branchId }     → copia los rangos de la cuenta a la sucursal
 *   { action: 'liberar', jobId }                   → envía un documento retenido (con la fecha de hoy)
 *   { action: 'liberar', jobIds: [...] }           → lo mismo para varios (máx. 50), uno por uno
 *
 * GET devuelve además `emisor` (datos que exige la DIAN y que faltan en la
 * organización) para los «pasos para activar» del servicio. Aditivo
 * (2026-11-07, Finanzas R3 · Frente D).
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
import { PERMISOS_FINANZAS, requireOrgPermission } from '@/lib/security/orgGuards';
import { faltantesEmisor, type OrganizacionEmisor } from '@/lib/finanzas/facturacionElectronica/servicioLogica';
import { MAX_LOTE } from '@/lib/finanzas/facturacionElectronica/bandejaLogica';

const PERMISO_CONFIGURAR = PERMISOS_FINANZAS.APROBAR;

export const GET = withOrg(async (ctx) => {
  // La cola, los retenidos y la resolución: `finance.view`, resuelto en el servidor
  // ANTES de leer con el cliente de servicio.
  await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, 'factus/config');
  const db = getServiceClient();
  const org = ctx.organizationId;

  const [config, rangos, jobs, retenidos, organizacion] = await Promise.all([
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
      .select('id, document_type, created_at, hold_reason, invoice:invoice_sales(number, total, currency, issue_date, customer:customers(full_name, company_name)), support_document:support_documents(number, reference_code, total, currency, issue_date)')
      .eq('organization_id', org)
      .eq('status', 'pending')
      .not('hold_reason', 'is', null)
      .order('created_at', { ascending: true })
      .limit(50),
    ctx.supabase
      .from('organizations')
      .select('nit, tax_id, dv, legal_name, fiscal_responsibilities, municipality_id, email')
      .eq('id', org)
      .maybeSingle(),
  ]);
  const emisor = (organizacion?.data ?? null) as (OrganizacionEmisor & { nit?: string | null; tax_id?: string | null }) | null;

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
    emisor: {
      faltan: faltantesEmisor(emisor),
      nit: emisor?.nit ?? emisor?.tax_id ?? null,
      dv: emisor?.dv ?? null,
      razonSocial: emisor?.legal_name ?? null,
      correo: emisor?.email ?? null,
    },
  });
});

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<{ action?: string; branchId?: number | string; jobId?: string; jobIds?: unknown[] }>(ctx, request, {
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
        if (Array.isArray(body.jobIds)) {
          // Lote: los mismos dos pasos de siempre, uno por uno; un fallo no frena los demás.
          const ids = Array.from(new Set(body.jobIds.filter((x): x is string => typeof x === 'string' && x.length > 0)));
          if (ids.length === 0) return NextResponse.json({ error: 'Indique los documentos (jobIds)' }, { status: 400 });
          if (ids.length > MAX_LOTE) return NextResponse.json({ error: `Máximo ${MAX_LOTE} documentos por envío` }, { status: 400 });
          const resultados: Array<{ jobId: string; ok: boolean; status?: string; message?: string | null; error?: string }> = [];
          for (const id of ids) {
            try {
              await liberarRetenido({ jobId: id, organizationId: ctx.organizationId, actor: ctx.userId });
              const r = await procesarAhora(id);
              resultados.push({ jobId: id, ok: true, status: r?.estado ?? 'pending', message: r?.mensaje ?? null });
            } catch (err) {
              const code = (err as { code?: string } | null)?.code;
              resultados.push({ jobId: id, ok: false, error: code === 'P0002' ? 'not_found' : code === '55000' ? 'invalid_state' : 'error' });
            }
          }
          const liberados = resultados.filter((r) => r.ok).length;
          return NextResponse.json({ success: liberados > 0, liberados, fallidos: resultados.length - liberados, resultados });
        }
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
