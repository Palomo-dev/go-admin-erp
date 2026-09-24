/**
 * API Route: Documentos Soporte Electrónicos (Factus API v2)
 * POST   /api/factus/support-document          → Crear/validar documento soporte
 * GET    /api/factus/support-document          → Listar documentos soporte (desde BD local)
 * GET    /api/factus/support-document?ref=XXX  → Consultar por reference_code en Factus
 * DELETE /api/factus/support-document?ref=XXX  → Eliminar documento soporte no validado
 *
 * Credenciales via variables de entorno (factusTokenManager): es la cuenta de
 * Factus de la PLATAFORMA, compartida por todas las organizaciones.
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
import { getValidToken, getCredentials } from '@/lib/services/factusTokenManager';
import factusService, {
  FactusSupportDocumentRequest,
  mapUnitMeasure,
  mapStandardCode,
  mapTaxCode,
} from '@/lib/services/factusService';

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
 * Body: { supportDocumentId, branchId? } — la organización sale de la sesión.
 *
 * Toma un documento soporte ya guardado en BD (estado draft/pending),
 * lo mapea al formato de Factus y lo envía a validar.
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<{ supportDocumentId?: string; branchId?: number | string }>(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.CREAR, RUTA);
    const organizationId = ctx.organizationId;
    const { supportDocumentId, branchId } = body;

    if (!supportDocumentId) {
      return NextResponse.json(
        { error: 'Se requiere supportDocumentId' },
        { status: 400 }
      );
    }

    const credentials = getCredentials();
    if (!credentials) {
      return NextResponse.json(
        { error: 'Credenciales de Factus no configuradas' },
        { status: 404 }
      );
    }

    const accessToken = await getValidToken();
    if (!accessToken) {
      return NextResponse.json(
        { error: 'No se pudo obtener token de Factus' },
        { status: 500 }
      );
    }

    const supabase = ctx.supabase;
    const environment = credentials.environment;

    // 1. Obtener el documento soporte desde BD (de la organización de la sesión)
    const { data: sd, error: sdError } = await supabase
      .from('support_documents')
      .select('*')
      .eq('id', supportDocumentId)
      .eq('organization_id', organizationId)
      .single();

    if (sdError || !sd) {
      return NextResponse.json(
        { error: 'Documento soporte no encontrado' },
        { status: 404 }
      );
    }

    // 2. Obtener items desde invoice_items
    const { data: items, error: itemsError } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('support_document_id', supportDocumentId)
      .order('created_at', { ascending: true });

    if (itemsError) {
      return NextResponse.json(
        { error: 'Error obteniendo items del documento soporte' },
        { status: 500 }
      );
    }

    // 3. Obtener rango de numeración para documento soporte (document_type='support_document')
    let numberingRangeId = sd.numbering_range_id;
    if (!numberingRangeId) {
      const { data: sequence } = await supabase
        .from('invoice_sequences')
        .select('factus_numbering_range_id')
        .eq('organization_id', organizationId)
        .eq('document_type', 'support_document')
        .eq('is_active', true)
        .maybeSingle();

      numberingRangeId = sequence?.factus_numbering_range_id;
    }

    // 4. Resolver municipio del establecimiento (sucursal de la organización)
    let establishmentMunicipalityCode = '05001';
    if (branchId) {
      const { data: branch } = await supabase
        .from('branches')
        .select('municipality_id, address, phone, email, name')
        .eq('id', branchId)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (branch?.municipality_id) {
        const { data: muni } = await supabase
          .from('municipalities')
          .select('code')
          .eq('id', branch.municipality_id)
          .maybeSingle();
        if (muni?.code) establishmentMunicipalityCode = muni.code;
      }
    }

    // 5. Construir el payload para Factus
    const provider = sd.provider || {};
    const factusRequest: FactusSupportDocumentRequest = {
      reference_code: sd.reference_code,
      ...(numberingRangeId ? { numbering_range_id: numberingRangeId } : {}),
      created_time: sd.created_time || undefined,
      observation: sd.observation || '',
      payment_details: sd.payment_details || [
        {
          payment_form: '1',
          payment_method_code: '10',
          amount: Number(sd.total || 0).toFixed(2),
        },
      ],
      cash_rounding_amount: sd.cash_rounding_amount ? Number(sd.cash_rounding_amount).toFixed(2) : '0.00',
      establishment: sd.establishment || {
        name: 'Establecimiento principal',
        address: '',
        phone_number: '3000000000',
        email: 'noemail@noemail.com',
        municipality_code: establishmentMunicipalityCode,
      },
      provider: {
        identification_document_code: provider.identification_document_code || '31',
        identification: provider.identification || '',
        ...(provider.dv ? { dv: String(provider.dv) } : {}),
        ...(provider.trade_name ? { trade_name: provider.trade_name } : {}),
        names: provider.names || 'Proveedor',
        address: provider.address || '',
        country_code: provider.country_code || 'CO',
        ...(provider.municipality_code ? { municipality_code: provider.municipality_code } : {}),
        ...(provider.email ? { email: provider.email } : {}),
        ...(provider.phone ? { phone: provider.phone } : {}),
        ...(provider.legal_organization_code ? { legal_organization_code: provider.legal_organization_code } : {}),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- filas de invoice_items sin tipo generado
      items: (items || []).map((item: any, idx: number) => {
        let itemTaxCode = item.tax_code;
        if (!itemTaxCode && item.tax_rate !== null && item.tax_rate !== undefined) {
          itemTaxCode = '01';
        }

        let itemCodeRef = item.code_reference;
        if (!itemCodeRef) {
          itemCodeRef = item.product_id ? `PROD-${item.product_id}` : `ITEM-${idx + 1}`;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ítem del payload de Factus
        const itemData: any = {
          code_reference: itemCodeRef,
          name: (item.description || 'Producto').substring(0, 250),
          quantity: Number(item.qty || 1).toFixed(2),
          price: Number(item.unit_price || 0).toFixed(2),
          unit_measure_code: mapUnitMeasure(item.unit_measure_id),
          standard_code: mapStandardCode(item.standard_code_id),
          taxes: [
            {
              code: mapTaxCode(itemTaxCode),
              rate: Number(item.tax_rate || 0).toFixed(2),
              is_excluded: item.is_excluded === 1,
            },
          ],
          ...(item.withholding_taxes && item.withholding_taxes.length > 0
            ? {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- retenciones en JSON libre
                withholding_taxes: item.withholding_taxes.map((wt: any) => ({
                  code: wt.code || '',
                  rate: Number(wt.rate || wt.withholding_tax_rate || 0).toFixed(2),
                })),
              }
            : {}),
          ...(item.note ? { note: item.note } : {}),
        };

        if (Number(item.discount_rate || 0) > 0) {
          itemData.discount_rate = Number(item.discount_rate).toFixed(2);
        }

        return itemData;
      }),
    };

    // 6. Crear job en electronic_invoicing_jobs
    const { data: job, error: jobError } = await supabase
      .from('electronic_invoicing_jobs')
      .insert({
        organization_id: organizationId,
        invoice_id: supportDocumentId, // referenciado para compatibilidad
        support_document_id: supportDocumentId,
        document_type: 'support_document',
        provider: 'factus',
        status: 'processing',
        request_payload: factusRequest,
      })
      .select()
      .single();

    if (jobError) {
      return NextResponse.json(
        { error: 'Error creando job de documento soporte' },
        { status: 500 }
      );
    }

    // 7. Actualizar estado del documento soporte
    await supabase
      .from('support_documents')
      .update({
        status: 'processing',
        sent_to_dian: true,
        sent_at: new Date().toISOString(),
        numbering_range_id: numberingRangeId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', supportDocumentId)
      .eq('organization_id', organizationId);

    try {
      // 8. Enviar a Factus. Solo identificadores al log: el payload lleva
      // datos personales del proveedor (documento, correo, teléfono).
      console.log('[Factus] Enviando documento soporte', { organizationId, reference_code: sd.reference_code, jobId: job.id });
      const result = await factusService.createSupportDocument(
        environment as 'sandbox' | 'production',
        accessToken,
        factusRequest
      );

      // 9. Actualizar job con respuesta exitosa
      await supabase
        .from('electronic_invoicing_jobs')
        .update({
          status: result.data?.is_validated ? 'accepted' : 'sent',
          response_payload: result,
          cufe: result.data?.cufe,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      // 10. Actualizar documento soporte con datos de DIAN
      await supabase
        .from('support_documents')
        .update({
          status: result.data?.is_validated ? 'accepted' : 'sent',
          cufe: result.data?.cufe,
          number: result.data?.number,
          is_validated: result.data?.is_validated || false,
          validated_at: result.data?.validated_at ? new Date().toISOString() : null,
          factus_response: result,
          updated_at: new Date().toISOString(),
        })
        .eq('id', supportDocumentId)
        .eq('organization_id', organizationId);

      // 11. Registrar evento
      await supabase
        .from('electronic_invoicing_events')
        .insert({
          job_id: job.id,
          organization_id: organizationId,
          event_type: result.data?.is_validated ? 'validated' : 'sent',
          event_code: '200',
          event_message: result.message,
          metadata: {
            number: result.data?.number,
            cufe: result.data?.cufe,
            is_validated: result.data?.is_validated,
            document_type: 'support_document',
          },
        });

      return NextResponse.json({
        success: true,
        data: result.data,
        jobId: job.id,
      });
    } catch (error: unknown) {
      const mensaje = error instanceof Error ? error.message : 'Error enviando a Factus';
      // Actualizar job con error
      await supabase
        .from('electronic_invoicing_jobs')
        .update({
          status: 'failed',
          error_message: mensaje,
          attempt_count: (job.attempt_count || 0) + 1,
          next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      // Actualizar documento soporte con error
      await supabase
        .from('support_documents')
        .update({
          status: 'failed',
          error_message: mensaje,
          updated_at: new Date().toISOString(),
        })
        .eq('id', supportDocumentId)
        .eq('organization_id', organizationId);

      // Registrar evento de error
      await supabase
        .from('electronic_invoicing_events')
        .insert({
          job_id: job.id,
          organization_id: organizationId,
          event_type: 'error',
          event_message: mensaje,
        });

      return NextResponse.json(
        { error: mensaje, jobId: job.id },
        { status: 500 }
      );
    }
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

      const credentials = getCredentials();
      if (!credentials) {
        return NextResponse.json(
          { error: 'Credenciales de Factus no configuradas' },
          { status: 404 }
        );
      }

      const accessToken = await getValidToken();
      if (!accessToken) {
        return NextResponse.json(
          { error: 'No se pudo obtener token de Factus' },
          { status: 500 }
        );
      }

      const result = await factusService.getSupportDocumentByReference(
        credentials.environment as 'sandbox' | 'production',
        accessToken,
        ref
      );

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

    const credentials = getCredentials();
    if (!credentials) {
      return NextResponse.json(
        { error: 'Credenciales de Factus no configuradas' },
        { status: 404 }
      );
    }

    const accessToken = await getValidToken();
    if (!accessToken) {
      return NextResponse.json(
        { error: 'No se pudo obtener token de Factus' },
        { status: 500 }
      );
    }

    const result = await factusService.deleteSupportDocument(
      credentials.environment as 'sandbox' | 'production',
      accessToken,
      ref
    );

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
