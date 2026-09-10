/**
 * POST /api/voice/bridge/initiate — inicia el bridge de 2 patas (FASE-05 §4.1).
 *
 * Auth: sesión (`getServerOrgContext`). El body SOLO trae el número del
 * CLIENTE: el celular del vendedor se lee de `user_comm_preferences`
 * (verificado por OTP) y nunca viaja en la petición (§0.2). Un `agent_phone`
 * enviado a mano se ignora explícitamente.
 *
 * Body: { to: string; opportunityId?: uuid; customerId?: uuid; whisper?: ≤200 }
 * 201  { bridgeId, callId, status, agentPhoneMasked }
 * 400 INVALID_PHONE/SAME_NUMBER · 402 NO_CREDITS · 409 MOBILE_NOT_VERIFIED |
 * BRIDGE_IN_PROGRESS | CALLER_ID_NOT_CONFIGURED · 502 PROVIDER_ERROR · 503 sin
 * VOICE_CALLBACK_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { initiateBridge, BridgeError } from '@/lib/services/crm/mobileBridgeService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuid = z.string().uuid();

const BodySchema = z
  .object({
    to: z.string().min(7).max(20).optional(),
    // Alias heredado del cliente antiguo: se acepta como DESTINO, nunca como
    // teléfono del vendedor.
    target_phone: z.string().min(7).max(20).optional(),
    opportunityId: uuid.nullish(),
    customerId: uuid.nullish(),
    opportunity_id: uuid.nullish(),
    customer_id: uuid.nullish(),
    whisper: z.string().max(200).nullish(),
  })
  .refine((b) => Boolean(b.to || b.target_phone), { message: 'Falta el número del cliente (to)' });

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const raw = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, code: 'INVALID_BODY', error: parsed.error.issues[0]?.message ?? 'Body inválido' },
        { status: 400 }
      );
    }
    const body = parsed.data;

    const result = await initiateBridge(
      { organizationId: ctx.organizationId, userId: ctx.userId, supabase: ctx.supabase },
      {
        to: (body.to || body.target_phone) as string,
        customerId: body.customerId ?? body.customer_id ?? null,
        opportunityId: body.opportunityId ?? body.opportunity_id ?? null,
        whisper: body.whisper ?? null,
      }
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          bridgeId: result.bridge.id,
          bridge_id: result.bridge.id,
          callId: result.callId,
          status: result.bridge.status,
          agentPhoneMasked: result.agentPhoneMasked,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof BridgeError) {
      return NextResponse.json(
        { success: false, code: error.code, error: error.message },
        { status: error.statusCode }
      );
    }
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Bridge Initiate] POST error:', message);
    return NextResponse.json({ success: false, code: 'INTERNAL', error: message }, { status: 500 });
  }
}
