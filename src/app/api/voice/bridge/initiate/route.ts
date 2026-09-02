/**
 * POST /api/voice/bridge/initiate — Inicia un bridge móvil de 2 patas.
 *
 * El usuario autenticado solicita llamar a su celular personal y luego
 * conectar con el cliente. Twilio llama primero al agente, luego al cliente.
 *
 * Body: { agent_phone, target_phone, customer_id?, opportunity_id?, whisper_text? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { initiateBridge } from '@/lib/services/crm/mobileBridgeService';

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.agent_phone || !body?.target_phone) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: agent_phone, target_phone' },
        { status: 400 }
      );
    }

    const result = await initiateBridge(
      ctx.organizationId,
      ctx.userId,
      {
        agent_phone: body.agent_phone,
        target_phone: body.target_phone,
        customer_id: body.customer_id ?? null,
        opportunity_id: body.opportunity_id ?? null,
        whisper_text: body.whisper_text,
        confirm_digit_required: body.confirm_digit_required,
      },
      ctx.supabase
    );

    return NextResponse.json(
      { success: true, data: result },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Bridge Initiate] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
