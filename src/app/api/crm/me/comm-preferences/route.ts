import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z
  .object({
    default_call_mode: z.enum(['browser', 'mobile']).optional(),
    default_caller_id_id: z.string().uuid().nullable().optional(),
    settings: z.record(z.unknown()).optional(),
  })
  .strict();

const COLUMNS = 'id, organization_id, user_id, mobile_phone_e164, mobile_verified_at, default_call_mode, default_caller_id_id, voice_id, settings, created_at, updated_at';

/**
 * GET|PATCH /api/crm/me/comm-preferences — `user_comm_preferences` del usuario
 * en la org activa (FASE-03 §4.1, D4). El celular (`mobile_phone_e164`,
 * `mobile_verified_at`) solo se escribe desde el servidor tras el OTP
 * (`/api/integrations/twilio/verify/check` con purpose 'mobile_verification').
 * PATCH: { default_call_mode?, default_caller_id_id?, settings? } → upsert por (org, user).
 */
export async function GET(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    throw err;
  }
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('user_comm_preferences')
    .select(COLUMNS)
    .eq('organization_id', ctx.organizationId)
    .eq('user_id', ctx.userId)
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  // Fallback de solo lectura al celular verificado en profiles (SEC F0) si aún no hay preferencias.
  let mobile: { mobile_phone_e164: string | null; mobile_verified_at: string | null } | null = null;
  if (!data) {
    const { data: profile } = await sb.from('profiles').select('phone, metadata').eq('id', ctx.userId).maybeSingle();
    const p = profile as { phone?: string | null; metadata?: Record<string, unknown> } | null;
    const verifiedAt = typeof p?.metadata?.mobile_verified_at === 'string' ? (p.metadata.mobile_verified_at as string) : null;
    if (p?.phone && verifiedAt) mobile = { mobile_phone_e164: p.phone, mobile_verified_at: verifiedAt };
  }
  return NextResponse.json(
    {
      success: true,
      data: data ?? {
        organization_id: ctx.organizationId,
        user_id: ctx.userId,
        mobile_phone_e164: mobile?.mobile_phone_e164 ?? null,
        mobile_verified_at: mobile?.mobile_verified_at ?? null,
        default_call_mode: 'browser',
        default_caller_id_id: null,
        voice_id: null,
        settings: {},
      },
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}

export async function PATCH(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    throw err;
  }
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Body inválido', issues: parsed.error.issues }, { status: 400 });

  const sb = getServiceClient();
  if (parsed.data.default_caller_id_id) {
    const { data: pn } = await sb
      .from('phone_numbers')
      .select('id')
      .eq('id', parsed.data.default_caller_id_id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (!pn) return NextResponse.json({ success: false, error: 'El número no pertenece a la organización' }, { status: 400 });
  }

  const { data: existing } = await sb
    .from('user_comm_preferences')
    .select('id, settings')
    .eq('organization_id', ctx.organizationId)
    .eq('user_id', ctx.userId)
    .limit(1)
    .maybeSingle();
  const patch: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.settings) {
    const prev = ((existing as { settings?: Record<string, unknown> } | null)?.settings ?? {}) as Record<string, unknown>;
    patch.settings = { ...prev, ...parsed.data.settings };
  }

  const q = existing
    ? sb.from('user_comm_preferences').update(patch).eq('id', (existing as { id: string }).id).eq('organization_id', ctx.organizationId).select(COLUMNS).single()
    : sb.from('user_comm_preferences').insert({ organization_id: ctx.organizationId, user_id: ctx.userId, ...patch }).select(COLUMNS).single();
  const { data, error } = await q;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
