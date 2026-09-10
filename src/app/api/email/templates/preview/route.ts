import { NextRequest } from 'next/server';
import { emailErrorResponse, getServerOrgContext, ok, readJson } from '@/lib/services/crm/email/http';
import { previewTemplate } from '@/lib/services/crm/email/templatesService';
import { parseWith, zTemplatePreview } from '@/lib/services/crm/email/schemas';
import { buildContext, sampleContext } from '@/lib/services/crm/email/variables';

export const runtime = 'nodejs';

interface PreviewBody {
  template_id?: string;
  blocks?: unknown;
  html?: string;
  subject?: string;
  preheader?: string;
  /** Ids reales de la org (opcional). Sin ids → contexto de ejemplo. */
  context_ids?: { customer_id?: string; opportunity_id?: string; quote_id?: string };
  custom?: Record<string, unknown>;
}

/**
 * POST /api/email/templates/preview
 * { blocks | html | template_id, subject?, preheader?, context_ids?, custom? }
 * → { html, text, subject, preheader, missing_variables, used_variables }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: PreviewBody = parseWith(zTemplatePreview, await readJson<unknown>(request), 'body de /api/email/templates/preview');
    const ids = body.context_ids ?? {};
    const hasIds = !!(ids.customer_id || ids.opportunity_id || ids.quote_id);
    const renderCtx = hasIds
      ? await buildContext(ctx.organizationId, { customerId: ids.customer_id, opportunityId: ids.opportunity_id, quoteId: ids.quote_id, userId: ctx.userId, custom: body.custom }, ctx.supabase)
      : sampleContext({ custom: { ...sampleContext().custom, ...(body.custom ?? {}) } });
    if (hasIds && !renderCtx.user) renderCtx.user = sampleContext().user;
    const r = await previewTemplate(ctx.organizationId, { template_id: body.template_id, blocks: body.blocks, html: body.html, subject: body.subject, preheader: body.preheader }, renderCtx, ctx.supabase);
    return ok({ html: r.html, text: r.text, subject: r.subject, preheader: r.preheader, missing_variables: r.missing, used_variables: r.used });
  } catch (err) {
    return emailErrorResponse(err, 'email/templates/preview');
  }
}
