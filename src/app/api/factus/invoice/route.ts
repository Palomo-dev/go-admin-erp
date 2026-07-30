/**
 * API Route: Crear/Enviar Factura a Factus
 * POST /api/factus/invoice
 * 
 * Credenciales via variables de entorno
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getValidToken, getCredentials } from '@/lib/services/factusTokenManager';
import factusService, { 
  FactusInvoiceRequest, 
  mapIdentificationType, 
  mapDocumentType, 
  mapPaymentMethod,
  mapLegalOrganization,
  mapTribute,
  mapUnitMeasure,
  mapStandardCode,
  mapTaxCode,
} from '@/lib/services/factusService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { organizationId, invoiceId } = body;

    if (!organizationId || !invoiceId) {
      return NextResponse.json(
        { error: 'Se requieren organizationId e invoiceId' },
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

    // Obtener datos de la factura
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoice_sales')
      .select(`
        *,
        customer:customers(*),
        branch:branches(*),
        organization:organizations(*)
      `)
      .eq('id', invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: 'Factura no encontrada' },
        { status: 404 }
      );
    }

    // Obtener items de la factura
    const { data: items, error: itemsError } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_sales_id', invoiceId);

    if (itemsError) {
      return NextResponse.json(
        { error: 'Error obteniendo items de factura' },
        { status: 500 }
      );
    }

    // Obtener rango de numeración
    const { data: sequence, error: seqError } = await supabase
      .from('invoice_sequences')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('document_type', invoice.document_type || 'invoice')
      .eq('is_active', true)
      .maybeSingle();

    if (seqError || !sequence?.factus_numbering_range_id) {
      return NextResponse.json(
        { error: 'No hay rango de numeración configurado para Factus' },
        { status: 400 }
      );
    }

    // Auto-generar reference_code si no existe
    let referenceCode = invoice.reference_code;
    if (!referenceCode) {
      referenceCode = `INV-${invoice.id.substring(0, 8)}`;
      await supabase
        .from('invoice_sales')
        .update({ reference_code: referenceCode })
        .eq('id', invoiceId);
    }

    // Crear job en electronic_invoicing_jobs
    const { data: job, error: jobError } = await supabase
      .from('electronic_invoicing_jobs')
      .insert({
        organization_id: organizationId,
        invoice_id: invoiceId,
        document_type: invoice.document_type || 'invoice',
        provider: 'factus',
        status: 'processing',
        request_payload: {},
      })
      .select()
      .single();

    if (jobError) {
      return NextResponse.json(
        { error: 'Error creando job de facturación' },
        { status: 500 }
      );
    }

    try {
      // Resolver código del municipio fiscal del cliente
      let customerMunicipalityCode = '05001'; // Default: Medellín
      if (invoice.customer?.fiscal_municipality_id) {
        const { data: muni } = await supabase
          .from('municipalities')
          .select('code')
          .eq('id', invoice.customer.fiscal_municipality_id)
          .maybeSingle();
        if (muni?.code) customerMunicipalityCode = muni.code;
      }

      // Resolver código del municipio: priorizar sucursal, luego organización
      let branchMunicipalityCode = '05001';
      if (invoice.branch?.municipality_id) {
        const { data: branchMuni } = await supabase
          .from('municipalities')
          .select('code')
          .eq('id', invoice.branch.municipality_id)
          .maybeSingle();
        if (branchMuni?.code) branchMunicipalityCode = branchMuni.code;
      } else if (invoice.organization?.municipality_id) {
        const { data: orgMuni } = await supabase
          .from('municipalities')
          .select('code')
          .eq('id', invoice.organization.municipality_id)
          .maybeSingle();
        if (orgMuni?.code) branchMunicipalityCode = orgMuni.code;
      }

      // Mapear datos a formato Factus V2
      const factusRequest: FactusInvoiceRequest = {
        reference_code: referenceCode,
        document: mapDocumentType(invoice.document_type),
        numbering_range_id: sequence.factus_numbering_range_id,
        operation_type: '10',
        observation: invoice.notes || '',
        send_email: invoice.send_email ?? true,
        cash_rounding_amount: '0.00',
        payment_details: [{
          payment_form: invoice.payment_form || '1',
          payment_method_code: invoice.payment_method_code || mapPaymentMethod(invoice.payment_method),
          due_date: invoice.due_date?.split('T')[0],
          amount: Number(invoice.total || 0).toFixed(2),
        }],
        establishment: {
          name: invoice.branch?.name || invoice.organization?.name || '',
          address: invoice.branch?.address || invoice.organization?.address || '',
          phone_number: (invoice.branch?.phone || invoice.organization?.phone || '3000000000').trim() || '3000000000',
          email: invoice.branch?.email || invoice.organization?.email || 'noemail@noemail.com',
          municipality_code: branchMunicipalityCode,
        },
        customer: {
          identification_document_code: mapIdentificationType(invoice.customer?.identification_type),
          identification: invoice.customer?.identification_number || '',
          dv: invoice.customer?.dv?.toString() || undefined,
          company: invoice.customer?.company_name || '',
          trade_name: invoice.customer?.trade_name || '',
          names: `${invoice.customer?.first_name || ''} ${invoice.customer?.last_name || ''}`.trim() || 'Cliente',
          address: invoice.customer?.address || '',
          email: invoice.customer?.email || '',
          phone: invoice.customer?.phone || '',
          legal_organization_code: mapLegalOrganization(invoice.customer?.customer_type),
          tribute_code: mapTribute(invoice.customer?.tribute_id),
          country_code: 'CO',
          municipality_code: customerMunicipalityCode,
        },
        items: (items || []).map((item: any, idx: number) => {
          // Auto-mapear tax_code desde tax_rate si no existe
          let itemTaxCode = item.tax_code;
          if (!itemTaxCode && item.tax_rate !== null && item.tax_rate !== undefined) {
            const rate = Number(item.tax_rate);
            if (rate === 19) itemTaxCode = '01';
            else if (rate === 5) itemTaxCode = '01';
            else if (rate === 0) itemTaxCode = '01';
            else itemTaxCode = '01';
          }

          // Auto-generar code_reference si no existe
          let itemCodeRef = item.code_reference;
          if (!itemCodeRef) {
            itemCodeRef = item.product_id ? `PROD-${item.product_id}` : `ITEM-${idx + 1}`;
          }

          const itemDiscountRate = Number(item.discount_rate || 0);
          const itemDiscountAmount = Number(item.discount_amount || 0);
          const itemName = (item.description || 'Producto').substring(0, 250);

          const itemData: any = {
            code_reference: itemCodeRef,
            name: itemName,
            quantity: Number(item.qty || 1).toFixed(2),
            price: Number(item.unit_price || 0).toFixed(2),
            unit_measure_code: mapUnitMeasure(item.unit_measure_id),
            standard_code: mapStandardCode(item.standard_code_id),
            taxes: [{
              code: mapTaxCode(itemTaxCode),
              rate: Number(item.tax_rate || 0).toFixed(2),
              is_excluded: item.is_excluded === 1,
            }],
            withholding_taxes: (item.withholding_taxes || []).map((wt: any) => ({
              code: wt.code || '',
              rate: Number(wt.rate || wt.withholding_tax_rate || 0).toFixed(2),
            })),
            note: item.note || '',
          };

          // Solo incluir descuentos si son mayores a 0
          if (itemDiscountRate > 0 && itemDiscountAmount > 0) {
            itemData.discount_rate = itemDiscountRate.toFixed(2);
            itemData.discount_amount = itemDiscountAmount.toFixed(2);
          }

          return itemData;
        }),
        ...(invoice.allowance_charges && invoice.allowance_charges.length > 0 ? { allowance_charges: invoice.allowance_charges } : {}),
      };

      // Actualizar job con request
      await supabase
        .from('electronic_invoicing_jobs')
        .update({ request_payload: factusRequest })
        .eq('id', job.id);

      // Enviar a Factus
      console.log('[Factus] Enviando factura:', JSON.stringify(factusRequest, null, 2));
      const result = await factusService.createInvoice(
        environment as 'sandbox' | 'production',
        accessToken,
        factusRequest
      );

      // Actualizar job con respuesta exitosa
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

      // Actualizar factura con datos de DIAN
      await supabase
        .from('invoice_sales')
        .update({
          xml_uuid: result.data?.cufe,
          validated_at: result.data?.validated_at ? new Date().toISOString() : null,
          status: result.data?.is_validated ? 'validated' : 'sent',
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId);

      // Registrar evento
      await supabase
        .from('electronic_invoicing_events')
        .insert({
          job_id: job.id,
          event_type: result.data?.is_validated ? 'validated' : 'sent',
          event_code: '200',
          event_message: result.message,
          metadata: {
            number: result.data?.number,
            cufe: result.data?.cufe,
            is_validated: result.data?.is_validated,
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

      // Registrar evento de error
      await supabase
        .from('electronic_invoicing_events')
        .insert({
          job_id: job.id,
          event_type: 'error',
          event_message: error.message,
        });

      return NextResponse.json(
        { error: error.message, jobId: job.id },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Error en envío a Factus:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
