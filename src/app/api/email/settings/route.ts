import { NextRequest } from 'next/server';
import { emailErrorResponse, getServerOrgContext, ok, readJson } from '@/lib/services/crm/email/http';
import { requireOrgAdmin } from '@/lib/utils/orgContext';
import { getEmailOrgSettings, setEmailOrgSettings } from '@/lib/services/crm/email/domainStore';
import { parseWith, zSettingsPatch } from '@/lib/services/crm/email/schemas';
import { sanitizeFragment } from '@/lib/services/crm/email/sanitize';
import { EmailError } from '@/lib/services/crm/email/types';

export const runtime = 'nodejs';

/**
 * GET /api/email/settings → { email_fallback_policy, email_tracking_transactional,
 *   global_sender: {domain, from_name} | null, signature_html (del usuario) }
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const s = await getEmailOrgSettings(ctx.organizationId);
    const { data: profile } = await ctx.supabase.from('profiles').select('metadata').eq('id', ctx.userId).maybeSingle();
    const meta = ((profile as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
    const gd = process.env.EMAIL_GLOBAL_DOMAIN?.trim() || process.env.EMAIL_FROM_ADDRESS?.split('@')[1] || null;
    return ok({
      email_fallback_policy: s.email_fallback_policy,
      email_tracking_transactional: s.email_tracking_transactional,
      global_sender: gd ? { domain: gd, from_name: process.env.EMAIL_GLOBAL_FROM_NAME?.trim() || process.env.EMAIL_FROM_NAME?.trim() || 'GoAdmin' } : null,
      signature_html: typeof meta.email_signature_html === 'string' ? meta.email_signature_html : '',
      is_admin: (() => { try { requireOrgAdmin(ctx); return true; } catch { return false; } })(),
    });
  } catch (err) {
    return emailErrorResponse(err, 'email/settings GET');
  }
}

/**
 * PATCH /api/email/settings
 * { email_fallback_policy?, email_tracking_transactional? }  (admin)
 * { signature_html? }                                        (cualquier usuario, su propia firma)
 */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const body = parseWith(zSettingsPatch, await readJson<unknown>(request), 'body de PATCH /api/email/settings');
    if (body.email_fallback_policy !== undefined || body.email_tracking_transactional !== undefined) {
      requireOrgAdmin(ctx);
      const patch: Record<string, unknown> = {};
      if (body.email_fallback_policy !== undefined) patch.email_fallback_policy = body.email_fallback_policy;
      if (body.email_tracking_transactional !== undefined) patch.email_tracking_transactional = !!body.email_tracking_transactional;
      await setEmailOrgSettings(ctx.organizationId, patch);
    }
    if (body.signature_html !== undefined) {
      const clean = sanitizeFragment(String(body.signature_html)).slice(0, 10000);
      const { data: profile } = await ctx.supabase.from('profiles').select('metadata').eq('id', ctx.userId).maybeSingle();
      const meta = ((profile as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
      const { error } = await ctx.supabase.from('profiles').update({ metadata: { ...meta, email_signature_html: clean } }).eq('id', ctx.userId);
      if (error) throw new EmailError('DB', error.message, 500);
    }
    return ok({ updated: true });
  } catch (err) {
    return emailErrorResponse(err, 'email/settings PATCH');
  }
}
