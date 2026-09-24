/**
 * API Route: Documentos Soporte Electrónicos (Factus API v2)
 * POST   /api/factus/support-document          → Crear/validar documento soporte
 * GET    /api/factus/support-document          → Listar documentos soporte (desde BD local)
 * GET    /api/factus/support-document?ref=XXX  → Consultar por reference_code en Factus
 * DELETE /api/factus/support-document?ref=XXX  → Eliminar documento soporte no validado
 *
 * Credenciales: las de la cuenta de Factus DE LA ORGANIZACIÓN (Vault; las
 * carga la plataforma). Las `FACTUS_*` del entorno solo sirven en desarrollo.
 * El envío (POST) va por la cola de facturación electrónica.
 *
 * SEGURIDAD (GO-sec, 2026-09-23; auditoría de integraciones §3.4):
 * - `/api/factus/**` está fuera del middleware: cada handler se defiende solo.
 *   Antes, GET `?ref=` y DELETE no pedían NINGUNA autenticación: cualquiera en
 *   internet consultaba o BORRABA en Factus, con el token de la plataforma, el
 *   documento soporte de cualquier organización. POST tomaba la organización
 *   del body.
 * - Ahora los tres pasan por `withOrg` (sesión + organización de la sesión),
 *   `readOrgBody` (body o query con otra organización → 403 y registro) y un
 *   permiso `finance.*` resuelto en el servidor.
 * - `?ref=`: el `reference_code` tiene que ser de un documento soporte de la
 *   organización de la sesión (404 si no) Y no puede estar repetido en otra
 *   organización (409): los `DS-000N` son únicos solo por organización y la
 *   cuenta de Factus es compartida, así que un código repetido podría señalar
 *   en Factus el documento de otro cliente.
 */

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError, type ServerOrgContext } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import factusService from '@/lib/services/factusService';
import { obtenerAccesoFactus } from '@/lib/services/einvoicing/accesoFactus.server';
import { encolarDocumento, procesarAhora } from '@/lib/services/einvoicing/colaFacturacion.server';
import { respuestaDeEnvio } from '@/lib/services/einvoicing/respuestaRuta';

const RUTA = 'factus/support-document';

interface DocumentoPropio {
  id: string;
  is_validated: boolean | null;
}

/**
 * El documento soporte con `ref` de la organización de la sesión, o 404. Si
 * otra organización usa el mismo `reference_code`, 409: en la cuenta
 * compartida de Factus el código no identifica a un único cliente.
 *
 * El service role se usa SOLO para contar (sin devolver filas) y después de
 * haber comprobado que el documento es de la organización de la sesión.
 */
async function documentoPropio(ctx: ServerOrgContext, ref: string): Promise<DocumentoPropio> {
  const { data, error } = await ctx.supabase
    .from('support_documents')
    .select('id, is_validated')
    .eq('organization_id', ctx.organizationId)
    .eq('reference_code', ref)
    .maybeSingle();
  if (error || !data) {
    throw new OrgContextError('Documento soporte no encontrado', 404, 'NOT_FOUND');
  }

  const { count, error: errorConteo } = await getServiceClient()
    .from('support_documents')
    .select('id', { count: 'exact', head: true })
    .eq('reference_code', ref);
  if (errorConteo || count === null || count !== 1) {
    console.warn(`[${RUTA}] reference_code repetido entre organizaciones: no se consulta Factus`, {
      organizationId: ctx.organizationId,
      coincidencias: count ?? null,
    });
    throw new OrgContextError(
      'El código de referencia no es único en la cuenta de facturación; no se puede consultar',
      409,
      'REFERENCE_AMBIGUOUS',
    );
  }
  return data as DocumentoPropio;
}

/**
 * POST /api/factus/support-document
 * Body: { supportDocumentId } — la organización sale de la sesión.
 *
 * Encola el documento soporte y lo envía por la cola (`colaFacturacion`), con
 * las credenciales de Factus de la organización. Antes creaba el job con
 * `invoice_id = supportDocumentId`, y `invoice_id` es FK a `invoice_sales`: el
 * insert fallaba SIEMPRE antes de llamar a Factus. Ahora el job solo lleva
 * `support_document_id` (un job vivo por documento, índice único parcial).
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<{ supportDocumentId?: string }>(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.CREAR, RUTA);
    const supportDocumentId = typeof body?.supportDocumentId === 'string' ? body.supportDocumentId : null;

    if (!supportDocumentId) {
      return NextResponse.json({ error: 'Se requiere supportDocumentId' }, { status: 400 });
    }

    // Documento de la organización de la sesión (RLS + filtro explícito).
    const { data: sd } = await ctx.supabase
      .from('support_documents')
      .select('id')
      .eq('id', supportDocumentId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (!sd) {
      return NextResponse.json({ error: 'Documento soporte no encontrado' }, { status: 404 });
    }

    const { job, servicioActivo } = await encolarDocumento({
      organizationId: ctx.organizationId,
      documentType: 'support_document',
      supportDocumentId,
    });
    const resultado = servicioActivo ? await procesarAhora(job.id) : null;
    return respuestaDeEnvio(job, resultado, servicioActivo);
  } catch (error: unknown) {
    return routeErrorResponse('Factus support-document POST', error);
  }
});

/**
 * GET /api/factus/support-document
 * Sin `ref` → lista documentos soporte de la organización de la sesión (BD local)
 * ?ref=XXX → consulta por reference_code en Factus (solo un documento propio)
 */
export const GET = withOrg(async (ctx, request) => {
  try {
    // `?organizationId=` ajeno → 403 y registro (se ignora si es el propio).
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const { searchParams } = new URL(request.url);
    const ref = searchParams.get('ref');
    const status = searchParams.get('status');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));

    // Si hay ref, consultar en Factus (antes de llamar: que sea propio y único)
    if (ref) {
      await documentoPropio(ctx, ref);

      const acceso = await obtenerAccesoFactus(ctx.organizationId, { permitirDemoDesarrollo: true });
      const result = await factusService.getSupportDocumentByReference(acceso.environment, acceso.accessToken, ref);

      return NextResponse.json(result);
    }

    let query = ctx.supabase
      .from('support_documents')
      .select(
        `id, reference_code, number, issue_date, total, status, cufe, is_validated, validated_at,
         supplier_id, invoice_purchase_id, provider, created_at,
         supplier:suppliers(id, name, nit)`,
        { count: 'exact' }
      )
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Error listando documentos soporte' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      limit,
    });
  } catch (error: unknown) {
    return routeErrorResponse('Factus support-document GET', error);
  }
});

/**
 * DELETE /api/factus/support-document?ref=XXX
 * Elimina en Factus un documento soporte NO validado de la organización de la sesión.
 */
export const DELETE = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.ANULAR, RUTA);

    const { searchParams } = new URL(request.url);
    const ref = searchParams.get('ref');

    if (!ref) {
      return NextResponse.json(
        { error: 'Se requiere ref (reference_code)' },
        { status: 400 }
      );
    }

    const documento = await documentoPropio(ctx, ref);
    if (documento.is_validated) {
      return NextResponse.json(
        { error: 'Un documento soporte validado por la DIAN no se puede eliminar' },
        { status: 409 }
      );
    }

    const acceso = await obtenerAccesoFactus(ctx.organizationId, { permitirDemoDesarrollo: true });
    const result = await factusService.deleteSupportDocument(acceso.environment, acceso.accessToken, ref);

    // Actualizar estado en BD local (solo el documento propio)
    await ctx.supabase
      .from('support_documents')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', documento.id)
      .eq('organization_id', ctx.organizationId);

    return NextResponse.json(result);
  } catch (error: unknown) {
    return routeErrorResponse('Factus support-document DELETE', error);
  }
});
