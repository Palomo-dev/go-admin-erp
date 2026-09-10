/**
 * API Route: Enviar código OTP via Twilio Verify
 * POST /api/integrations/twilio/verify/send
 *
 * Seguridad (F0, C1 msg — SMS pumping):
 * - Requiere sesión (getServerOrgContext). Esta ruta está excluida del
 *   middleware, por eso la autenticación se hace aquí.
 * - Rate limit 5 envíos / 10 min por IP, por usuario y por número destino.
 * - `purpose: 'mobile_verification'` (F5): el número se registra como
 *   pendiente de verificación para el usuario en `profiles.metadata`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { twilioVerifyService } from '@/lib/services/integrations/twilio';
import { formatE164 } from '@/lib/services/integrations/twilio/twilioConfig';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { checkRateLimits, getClientIp } from '@/lib/security/rateLimit';
import { getServiceClient } from '@/lib/supabase/server-service';

const VERIFY_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 };
const ALLOWED_PURPOSES = ['mobile_verification', 'generic'] as const;
type VerifyPurpose = (typeof ALLOWED_PURPOSES)[number];

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
    const { to, channel } = body as { to?: string; channel?: 'sms' | 'whatsapp' | 'call'; purpose?: string };
    const purpose: VerifyPurpose = ALLOWED_PURPOSES.includes(body.purpose) ? body.purpose : 'generic';

    if (!to) {
      return NextResponse.json({ error: 'Falta campo requerido: to' }, { status: 400 });
    }

    const e164 = formatE164(String(to));
    if (!/^\+[1-9]\d{6,14}$/.test(e164)) {
      return NextResponse.json({ error: 'Número inválido (E.164)' }, { status: 400 });
    }

    const ip = getClientIp(request);
    const rl = await checkRateLimits([
      { key: `verify:send:ip:${ip}`, opts: VERIFY_LIMIT },
      { key: `verify:send:user:${ctx.userId}`, opts: VERIFY_LIMIT },
      { key: `verify:send:to:${e164}`, opts: VERIFY_LIMIT },
    ]);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)) } }
      );
    }

    const result = await twilioVerifyService.sendCode({
      to: e164,
      channel: channel || 'sms',
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Registrar el número pendiente de verificación para este usuario (F5: "mi celular")
    if (purpose === 'mobile_verification') {
      try {
        const service = getServiceClient();
        const { data: profile } = await service.from('profiles').select('metadata').eq('id', ctx.userId).maybeSingle();
        const metadata = ((profile as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
        await service
          .from('profiles')
          .update({
            metadata: {
              ...metadata,
              pending_mobile_verification: { phone: e164, requested_at: new Date().toISOString(), organization_id: ctx.organizationId },
            },
          })
          .eq('id', ctx.userId);
      } catch (err) {
        console.warn('[verify/send] No se pudo registrar pending_mobile_verification:', err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json({
      success: true,
      status: result.status,
    });
  } catch (error) {
    console.error('[API] Error enviando OTP:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
