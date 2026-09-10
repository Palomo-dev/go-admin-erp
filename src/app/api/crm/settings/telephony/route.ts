import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { isOrgAdmin } from '@/lib/utils/rbac';
import {
  getTelephonySettingsView,
  updateTelephonySettings,
  telephonyPatchSchema,
  TelephonyValidationError,
} from '@/lib/services/crm/telephonySettingsService';
import { getVoiceCredentials } from '@/lib/services/crm/voiceContextService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/crm/settings/telephony — comm_settings.voice_* + estado de
 * configuración (sin secretos): { data, configured: { api_key, twiml_app, source }, can_edit }
 */
export async function GET(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    throw err;
  }
  try {
    const [data, creds, membersRes] = await Promise.all([
      getTelephonySettingsView(ctx.organizationId),
      getVoiceCredentials(ctx.organizationId),
      ctx.supabase
        .from('organization_members')
        // `organization_members.user_id` tiene DOS claves foráneas (auth.users y
        // profiles): `profiles:user_id(...)` es ambiguo y PostgREST devuelve la
        // relación vacía en silencio. Hay que nombrar la FK a `profiles`.
        .select('user_id, profiles!organization_members_user_id_fkey1(first_name, last_name, email)')
        .eq('organization_id', ctx.organizationId)
        .eq('is_active', true)
        .limit(200),
    ]);
    const { twilio_subaccount_sid: _sub, ...safe } = data;
    void _sub;
    if (membersRes.error) {
      console.error('[Telephony Settings] no se pudo listar el equipo:', membersRes.error.message);
    }
    type MemberRow = { user_id: string; profiles: { first_name: string | null; last_name: string | null; email: string | null } | { first_name: string | null; last_name: string | null; email: string | null }[] | null };
    const members = ((membersRes.data ?? []) as MemberRow[]).map((m) => {
      const p = Array.isArray(m.profiles) ? m.profiles[0] ?? null : m.profiles;
      const name = p ? [p.first_name, p.last_name].filter(Boolean).join(' ') : '';
      return { user_id: m.user_id, name: name || p?.email || m.user_id.slice(0, 8), email: p?.email ?? null };
    });
    return NextResponse.json(
      {
        success: true,
        members,
        data: { ...safe, has_subaccount: Boolean(data.twilio_subaccount_sid) },
        configured: {
          api_key: Boolean(creds.apiKey && creds.apiSecret),
          twiml_app: Boolean(creds.twimlAppSid),
          account: Boolean(creds.accountSid),
          source: creds.source,
        },
        can_edit: isOrgAdmin(ctx) || ctx.isSuperAdmin,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Telephony Settings] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** PATCH /api/crm/settings/telephony — solo admin; body validado con zod (§4.1). */
export async function PATCH(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    throw err;
  }
  if (!isOrgAdmin(ctx) && !ctx.isSuperAdmin) {
    return NextResponse.json({ success: false, error: 'Solo un administrador puede cambiar la telefonía' }, { status: 403 });
  }
  const parsed = telephonyPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Body inválido', issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const data = await updateTelephonySettings(ctx.organizationId, parsed.data);
    const { twilio_subaccount_sid: _sub, ...safe } = data;
    void _sub;
    return NextResponse.json({ success: true, data: safe });
  } catch (error: unknown) {
    if (error instanceof TelephonyValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Telephony Settings] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
