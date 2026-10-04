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
import { getRateLimitStore } from '@/lib/security/rateLimitStore';
import { getServiceClient } from '@/lib/supabase/server-service';
import { readOrgBody } from '@/lib/security/organizationBody';
import { phoneConferenceEnabled } from '@/lib/services/crm/phoneConferenceRepository';
import { mobileApprovalReceipt, readMobileApprovalReceipt } from '@/lib/services/crm/mobileVerificationReceipt';

/** 5 / 10 min por IP, usuario y destino (cifra única: FASE-00 §7 y §7.1). Persistente y atómico con RATE_LIMIT_STORE=db; si el store falla, se bloquea. */
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
    const body = readOrgBody(ctx, await request.json(), { request });
    const { to, code, purpose, approval_receipt: receipt } = body as { to?: string; code?: string; purpose?: string; approval_receipt?: string };

    if (!to || (!code && !receipt)) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: to, code' },
        { status: 400 }
      );
    }

    const e164 = formatE164(String(to));
    if (!/^\+[1-9]\d{6,14}$/.test(e164) || (!receipt && !/^\d{4,10}$/.test(String(code)))) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    const ip = getClientIp(request);
    const rl = await checkRateLimits([
      { key: `verify:check:ip:${ip}`, opts: VERIFY_LIMIT },
      { key: `verify:check:user:${ctx.userId}`, opts: VERIFY_LIMIT },
      { key: `verify:check:to:${e164}`, opts: VERIFY_LIMIT },
    ], { store: getRateLimitStore() });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)) } }
      );
    }

    // El número debe pertenecer al usuario (solicitado por él en verify/send)
    const service = getServiceClient();
    if (purpose === 'mobile_verification' && phoneConferenceEnabled()) {
      let approval = readMobileApprovalReceipt(receipt, ctx.organizationId, ctx.userId, e164);
      let durableReceipt = typeof receipt === 'string' ? receipt : null;
      if (receipt && !approval) return NextResponse.json({ error: 'La aprobación pendiente caducó o no corresponde a esta sesión' }, { status: 400 });
      if (!approval) {
        const { data: profile, error: profileError } = await service.from('profiles').select('metadata').eq('id', ctx.userId).maybeSingle();
        if (profileError) throw profileError;
        const pending = (profile?.metadata as Record<string, unknown> | undefined)?.pending_mobile_verification as { phone?: string; organization_id?: number } | undefined;
        if (pending?.phone !== e164 || pending.organization_id !== ctx.organizationId) {
          return NextResponse.json({ error: 'El número no coincide con el solicitado en esta organización' }, { status: 403 });
        }
        const result = await twilioVerifyService.checkCode({ to: e164, code: String(code) });
        if (!result.success || result.status !== 'approved') return NextResponse.json({ error: 'Código inválido', status: result.status }, { status: 400 });
        durableReceipt = mobileApprovalReceipt(ctx.organizationId, ctx.userId, e164, result.sid ?? '');
        approval = readMobileApprovalReceipt(durableReceipt, ctx.organizationId, ctx.userId, e164);
        if (!approval) throw new Error('No pudimos acreditar la aprobación del celular');
      }
      const { data: saved, error: saveError } = await service.rpc('fn_phone_verify_mobile', {
        p_org: ctx.organizationId, p_user: ctx.userId, p_phone: e164, p_proof: approval,
      });
      if (saveError || saved?.phone !== e164 || typeof saved.verified_at !== 'string') {
        console.warn('[verify/check] aprobación pendiente de persistir', { org: ctx.organizationId, code: saveError?.code });
        return NextResponse.json({ success: false, code: 'mobile_approval_pending', approval_receipt: durableReceipt,
          error: 'El código fue aprobado. Reintenta guardar la verificación sin solicitar otro código.' }, { status: 503 });
      }
      return NextResponse.json({ success: true, status: 'approved', verified_at: saved.verified_at });
    }
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
    if (error instanceof OrgContextError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.statusCode });
    console.error('[API] Error verificando OTP:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
