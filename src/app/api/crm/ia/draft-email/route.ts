import { NextRequest } from 'next/server';
import { emailErrorResponse, getServerOrgContext, ok, readJson } from '@/lib/services/crm/email/http';
import { draftEmail, type DraftEmailInput } from '@/lib/services/crm/email/aiDraftService';
import { parseWith, zDraftEmail } from '@/lib/services/crm/email/schemas';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/crm/ia/draft-email
 * { opportunityId? | customerId?, tone?, goal?, customGoal?, template_id?, language?, extraInstructions? }
 * → { subject, preheader, blocks (BlockDocument), plain_text, usage, credits_used, model }
 * 402 NO_CREDITS · 404 NOT_FOUND · 422 AI_REFUSED · 503 AI_UNAVAILABLE
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const body = parseWith(zDraftEmail, await readJson<unknown>(request), 'body de draft-email');
    const input = { ...body, templateId: body.templateId ?? body.template_id ?? null } as DraftEmailInput;
    const r = await draftEmail(ctx.organizationId, ctx.userId, input, ctx.supabase);
    return ok(r);
  } catch (err) {
    return emailErrorResponse(err, 'crm/ia/draft-email');
  }
}
