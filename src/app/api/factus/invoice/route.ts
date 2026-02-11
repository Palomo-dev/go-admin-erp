/**
 * API Route: Crear/Enviar Factura a Factus
 * POST /api/factus/invoice
 * 
 * Credenciales via variables de entorno
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase/config';
import factusService, { 
  FactusInvoiceRequest, 
  mapIdentificationType, 
  mapDocumentType, 
  mapPaymentMethod 
} from '@/lib/services/factusService';

// Cache de token en memoria
let tokenCache: { accessToken: string; expiresAt: Date } | null = null;

function getFactusCredentials() {
  const clientId = process.env.FACTUS_CLIENT_ID;
  const clientSecret = process.env.FACTUS_CLIENT_SECRET;
  const username = process.env.FACTUS_USERNAME;
  const password = process.env.FACTUS_PASSWORD;
  const environment = (process.env.FACTUS_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';

  if (!clientId || !clientSecret || !username || !password) {
    return null;
  }

  return { clientId, clientSecret, username, password, environment };
}

async function getValidToken(): Promise<string | null> {
  const credentials = getFactusCredentials();
  if (!credentials) return null;

  // Verificar cache
  if (tokenCache && tokenCache.expiresAt > new Date()) {
    return tokenCache.accessToken;
  }

  // Autenticar
  const token = await factusService.authenticate(credentials);
  tokenCache = { accessToken: token.accessToken, expiresAt: token.expiresAt };
  return token.accessToken;
}

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

    const credentials = getFactusCredentials();
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

    const supabase = createSupabaseClient();
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
      .single();

    if (seqError || !sequence?.factus_numbering_range_id) {
      return NextResponse.json(
        { error: 'No hay rango de numeración configurado para Factus' },
        { status: 400 }
      );
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
      // Resolver código numérico del municipio fiscal del cliente
      let customerMunicipalityCode = 980; // Default: Bogotá
      if (invoice.customer?.fiscal_municipality_id) {
        const { data: muni } = await supabase
          .from('municipalities')
          .select('code')
          .eq('id', invoice.customer.fiscal_municipality_id)
          .single();
        if (muni?.code) customerMunicipalityCode = parseInt(muni.code, 10);
      }

      // Mapear datos a formato Factus
      const factusRequest: FactusInvoiceRequest = {
        document: mapDocumentType(invoice.document_type),
        numbering_range_id: sequence.factus_numbering_range_id,
        reference_code: invoice.reference_code || `INV-${invoice.id.substring(0, 8)}`,
        observation: invoice.notes || '',
        payment_form: (invoice.payment_form as '1' | '2') || '1',
        payment_method_code: invoice.payment_method_code || mapPaymentMethod(invoice.payment_method),
        payment_due_date: invoice.due_date?.split('T')[0],
        send_email: invoice.send_email || false,
        establishment: {
          name: invoice.branch?.name || invoice.organization?.name || '',
          address: invoice.branch?.address || invoice.organization?.address || '',
          phone_number: invoice.branch?.phone || invoice.organization?.phone || '',
          email: invoice.branch?.email || invoice.organization?.email || '',
          municipality_id: invoice.branch?.municipality_id || 980,
        },
        customer: {
          identification_document_id: mapIdentificationType(invoice.customer?.identification_type),
          identification: invoice.customer?.identification_number || '',
          dv: invoice.customer?.dv,
          company: invoice.customer?.company_name || '',
          trade_name: invoice.customer?.trade_name || '',
          names: `${invoice.customer?.first_name || ''} ${invoice.customer?.last_name || ''}`.trim() || 'Cliente',
          address: invoice.customer?.address || '',
          email: invoice.customer?.email || '',
          phone: invoice.customer?.phone || '',
          legal_organization_id: invoice.customer?.legal_organization_id || 2,
          tribute_id: invoice.customer?.tribute_id || 21,
          municipality_id: customerMunicipalityCode,
        },
        items: (items || []).map((item: any) => ({
          code_reference: item.code_reference || item.product_id?.toString() || '001',
          name: item.description || 'Producto',
          quantity: Number(item.qty) || 1,
          discount_rate: Number(item.discount_rate || 0),
          price: Number(item.unit_price) || 0,
          tax_rate: (Number(item.tax_rate) || 19).toFixed(2),
          unit_measure_id: item.unit_measure_id || 70,
          standard_code_id: item.standard_code_id || 1,
          is_excluded: item.is_excluded || 0,
          tribute_id: item.tribute_id || 1,
          withholding_taxes: item.withholding_taxes || [],
        })),
        allowance_charges: invoice.allowance_charges || [],
      };

      // Actualizar job con request
      await supabase
        .from('electronic_invoicing_jobs')
        .update({ request_payload: factusRequest })
        .eq('id', job.id);

      // Enviar a Factus
      const result = await factusService.createInvoice(
        environment as 'sandbox' | 'production',
        accessToken,
        factusRequest
      );

      // Actualizar job con respuesta exitosa
      await supabase
        .from('electronic_invoicing_jobs')
        .update({
          status: 'accepted',
          response_payload: result,
          cufe: result.data?.bill?.cufe,
          qr_code: result.data?.bill?.qr,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      // Actualizar factura con datos de DIAN
      await supabase
        .from('invoice_sales')
        .update({
          xml_uuid: result.data?.bill?.cufe,
          qr_image: result.data?.bill?.qr_image,
          validated_at: new Date().toISOString(),
          status: 'validated',
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId);

      // Registrar evento
      await supabase
        .from('electronic_invoicing_events')
        .insert({
          job_id: job.id,
          event_type: 'validated',
          event_code: '200',
          event_message: result.message,
          metadata: {
            number: result.data?.bill?.number,
            cufe: result.data?.bill?.cufe,
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
