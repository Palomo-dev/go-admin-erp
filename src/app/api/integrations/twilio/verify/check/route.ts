/**
 * API Route: Verificar código OTP via Twilio Verify
 * POST /api/integrations/twilio/verify/check
 *
 * Seguridad (F0, C1 msg):
 * - Requiere sesión. Rate limit 5 intentos / 10 min por IP, usuario y número.
 * - `purpose: 'mobile_verification'` (F5): el número debe ser el que este
 *   usuario solicitó verificar (profiles.metadata.pending_mobile_verification);
 *   al aprobarse se guarda en `profiles.phone` y se limpia el pendiente.
 */

import { NextRequest, NextResponse } from 'next/server';
import { twilioVerifyService } from '@/lib/services/integrations/twilio';
import { formatE164 } from '@/lib/services/integrations/twilio/twilioConfig';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { checkRateLimits, getClientIp } from '@/lib/security/rateLimit';
import { getServiceClient } from '@/lib/supabase/server-service';

const VERIFY_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 };

export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
  }

  try {
    const body = await request.json();
    const { to, code, purpose } = body as { to?: string; code?: string; purpose?: string };

    if (!to || !code) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: to, code' },
        { status: 400 }
      );
    }

    const e164 = formatE164(String(to));
    if (!/^\+[1-9]\d{6,14}$/.test(e164) || !/^\d{4,10}$/.test(String(code))) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    const ip = getClientIp(request);
    const rl = await checkRateLimits([
      { key: `verify:check:ip:${ip}`, opts: VERIFY_LIMIT },
      { key: `verify:check:user:${ctx.userId}`, opts: VERIFY_LIMIT },
      { key: `verify:check:to:${e164}`, opts: VERIFY_LIMIT },
    ]);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)) } }
      );
    }

    // El número debe pertenecer al usuario (solicitado por él en verify/send)
    const service = getServiceClient();
    let profileMetadata: Record<string, unknown> = {};
    if (purpose === 'mobile_verification') {
      const { data: profile } = await service.from('profiles').select('metadata').eq('id', ctx.userId).maybeSingle();
      profileMetadata = ((profile as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
      const pending = profileMetadata.pending_mobile_verification as { phone?: string } | undefined;
      if (!pending?.phone || pending.phone !== e164) {
        return NextResponse.json(
          { error: 'El número no coincide con el solicitado para verificación' },
          { status: 403 }
        );
      }
    }

    const result = await twilioVerifyService.checkCode({ to: e164, code: String(code) });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Código inválido', status: result.status },
        { status: 400 }
      );
    }

    if (purpose === 'mobile_verification') {
      const { pending_mobile_verification: _pending, ...rest } = profileMetadata;
      void _pending;
      const verifiedAt = new Date().toISOString();
      await service
        .from('profiles')
        .update({
          phone: e164,
          metadata: { ...rest, mobile_verified_at: verifiedAt },
        })
        .eq('id', ctx.userId);
      // F3/F5 (D4): el celular por organización vive en user_comm_preferences (solo se escribe aquí, tras OTP).
      const { data: pref } = await service
        .from('user_comm_preferences')
        .select('id')
        .eq('organization_id', ctx.organizationId)
        .eq('user_id', ctx.userId)
        .limit(1)
        .maybeSingle();
      const prefRow = { mobile_phone_e164: e164, mobile_verified_at: verifiedAt };
      const { error: prefErr } = pref
        ? await service.from('user_comm_preferences').update(prefRow).eq('id', (pref as { id: string }).id)
        : await service.from('user_comm_preferences').insert({ organization_id: ctx.organizationId, user_id: ctx.userId, ...prefRow });
      if (prefErr) console.warn('[verify/check] user_comm_preferences:', prefErr.message);
    }

    return NextResponse.json({
      success: true,
      status: result.status,
    });
  } catch (error) {
    console.error('[API] Error verificando OTP:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
