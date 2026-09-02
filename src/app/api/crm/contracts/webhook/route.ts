import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { handleContractWebhook, type DocumensoWebhookPayload } from '@/lib/services/crm/contractService';

/**
 * POST /api/crm/contracts/webhook — Webhook de Documenso (sin autenticación).
 *
 * Este endpoint es llamado por Documenso cuando cambia el estado de un documento.
 * No usa getServerOrgContext() porque es una llamada externa sin sesión.
 * Usa service role client internamente para actualizar el contrato.
 *
 * Body: { event, document_id, status?, signed_pdf_url?, signers? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body?.event || !body?.document_id) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: event, document_id' },
        { status: 400 }
      );
    }

    // Crear un cliente Supabase sin sesión (el webhook usa service role internamente)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      // @supabase/ssr exige el campo `cookies` en sus overloads; este cliente
      // solo se pasa a handleContractWebhook (que lo ignora), por eso se castea.
      { auth: { persistSession: false } } as any
    );

    const payload: DocumensoWebhookPayload = {
      event: body.event,
      document_id: body.document_id,
      status: body.status,
      signed_pdf_url: body.signed_pdf_url,
      signers: body.signers,
    };

    const result = await handleContractWebhook(payload, supabase);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'No se pudo procesar el webhook', contract_id: result.contract_id },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, contract_id: result.contract_id }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Contracts Webhook] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
