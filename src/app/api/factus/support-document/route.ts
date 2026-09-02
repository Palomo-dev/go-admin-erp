/**
 * API Route: Documentos Soporte Electrónicos (Factus API v2)
 * POST   /api/factus/support-document          → Crear/validar documento soporte
 * GET    /api/factus/support-document          → Listar documentos soporte (desde BD local)
 * GET    /api/factus/support-document?ref=XXX  → Consultar por reference_code en Factus
 * DELETE /api/factus/support-document?ref=XXX  → Eliminar documento soporte no validado
 *
 * Credenciales via variables de entorno (factusTokenManager)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getValidToken, getCredentials } from '@/lib/services/factusTokenManager';
import factusService, {
  FactusSupportDocumentRequest,
  mapUnitMeasure,
  mapStandardCode,
  mapTaxCode,
} from '@/lib/services/factusService';

/**
 * POST /api/factus/support-document
 * Body: { organizationId, supportDocumentId, branchId?, invoicePurchaseId? }
 *
 * Toma un documento soporte ya guardado en BD (estado draft/pending),
 * lo mapea al formato de Factus y lo envía a validar.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { organizationId, supportDocumentId, branchId } = body;

    if (!organizationId || !supportDocumentId) {
      return NextResponse.json(
        { error: 'Se requieren organizationId y supportDocumentId' },
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

    const supabase = createRouteHandlerClient({ cookies });
    const environment = credentials.environment;

    // 1. Obtener el documento soporte desde BD
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

    // 4. Resolver municipio del establecimiento (sucursal u organización)
    let establishmentMunicipalityCode = '05001';
    if (branchId) {
      const { data: branch } = await supabase
        .from('branches')
        .select('municipality_id, address, phone, email, name')
        .eq('id', branchId)
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
      items: (items || []).map((item: any, idx: number) => {
        let itemTaxCode = item.tax_code;
        if (!itemTaxCode && item.tax_rate !== null && item.tax_rate !== undefined) {
          itemTaxCode = '01';
        }

        let itemCodeRef = item.code_reference;
        if (!itemCodeRef) {
          itemCodeRef = item.product_id ? `PROD-${item.product_id}` : `ITEM-${idx + 1}`;
        }

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
      .eq('id', supportDocumentId);

    try {
      // 8. Enviar a Factus
      console.log('[Factus] Enviando documento soporte:', JSON.stringify(factusRequest, null, 2));
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
        .eq('id', supportDocumentId);

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
    } catch (error: any) {
      // Actualizar job con error
      await supabase
        .from('electronic_invoicing_jobs')
        .update({
          status: 'failed',
          error_message: error.message,
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
          error_message: error.message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', supportDocumentId);

      // Registrar evento de error
      await supabase
        .from('electronic_invoicing_events')
        .insert({
          job_id: job.id,
          organization_id: organizationId,
          event_type: 'error',
          event_message: error.message,
        });

      return NextResponse.json(
        { error: error.message, jobId: job.id },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error en envío de documento soporte a Factus:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/factus/support-document
 * Sin query params → lista documentos soporte desde BD local
 * ?ref=XXX → consulta por reference_code en Factus
 * ?organizationId=XXX requerido para listar
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ref = searchParams.get('ref');
    const organizationId = searchParams.get('organizationId');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const supabase = createRouteHandlerClient({ cookies });

    // Si hay ref, consultar en Factus
    if (ref) {
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

    // Listar desde BD local
    if (!organizationId) {
      return NextResponse.json(
        { error: 'Se requiere organizationId' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('support_documents')
      .select(
        `id, reference_code, number, issue_date, total, status, cufe, is_validated, validated_at,
         supplier_id, invoice_purchase_id, provider, created_at,
         supplier:suppliers(id, name, nit)`,
        { count: 'exact' }
      )
      .eq('organization_id', Number(organizationId))
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
  } catch (error: any) {
    console.error('Error en GET documento soporte:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/factus/support-document?ref=XXX
 * Elimina un documento soporte no validado en Factus
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ref = searchParams.get('ref');
    const organizationId = searchParams.get('organizationId');

    if (!ref) {
      return NextResponse.json(
        { error: 'Se requiere ref (reference_code)' },
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

    const result = await factusService.deleteSupportDocument(
      credentials.environment as 'sandbox' | 'production',
      accessToken,
      ref
    );

    // Actualizar estado en BD local si aplica
    if (organizationId) {
      const supabase = createRouteHandlerClient({ cookies });
      await supabase
        .from('support_documents')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('reference_code', ref)
        .eq('organization_id', Number(organizationId));
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error eliminando documento soporte:', error);
    return NextResponse.json(
      { error: error.message || 'Error eliminando documento soporte' },
      { status: 500 }
    );
  }
}
