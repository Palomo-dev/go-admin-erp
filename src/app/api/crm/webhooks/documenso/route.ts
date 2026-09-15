import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { processDocumensoWebhook } from '@/lib/services/crm/contractService';

export const runtime = 'nodejs';

/**
 * POST /api/crm/webhooks/documenso — webhook de Documenso (sin sesión; el
 * middleware excluye `/api/crm/webhooks/`). Fallo cerrado: la fila se localiza
 * por `provider_document_id`, la organización sale de la fila y la firma se
 * verifica con el secreto de esa organización (o de plataforma) ANTES de
 * escribir nada. F10.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    if (rawBody.length > 512 * 1024) return NextResponse.json({ success: false, error: 'Cuerpo demasiado grande' }, { status: 413 });
    const headers = {
      'x-documenso-signature': request.headers.get('x-documenso-signature'),
      'x-documenso-secret': request.headers.get('x-documenso-secret'),
    };
    const outcome = await processDocumensoWebhook(rawBody, headers, { serviceClient: getServiceClient() });
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error('[CRM Webhook Documenso]', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'Error procesando el webhook' }, { status: 500 });
  }
}
