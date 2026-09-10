import { NextRequest } from 'next/server';
import { emailErrorResponse, getServerOrgContext, ok, readJson } from '@/lib/services/crm/email/http';
import { replyToEmail, type SendContent, type SendEmailRequest } from '@/lib/services/crm/email/sendService';
import { parseWith, zReplyBody, zUuid } from '@/lib/services/crm/email/schemas';
import { EmailError } from '@/lib/services/crm/email/types';

export const runtime = 'nodejs';

/**
 * POST /api/email/messages/[id]/reply
 * { content:{html|blocks|template_id}, subject?, to?, cc?, bcc?, attachments? }
 * Fija In-Reply-To/References y hereda hilo, contacto y relación del original.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const { id } = await params;
    const parsed = parseWith(zReplyBody, await readJson<unknown>(request), 'body de reply');
    const content: SendContent | undefined = parsed.content ?? (parsed.template_id ? { template_id: parsed.template_id, variables: parsed.variables } : parsed.blocks ? { blocks: parsed.blocks, variables: parsed.variables } : parsed.html ? { html: parsed.html, variables: parsed.variables } : undefined);
    if (!content) throw new EmailError('VALIDATION', 'Se requiere content', 400);
    const asList = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : undefined);
    const body: Partial<SendEmailRequest> = {
      ...parsed,
      to: asList(parsed.to),
      cc: asList(parsed.cc),
      bcc: asList(parsed.bcc),
      attachments: parsed.attachments?.map((a) => ('document_id' in a ? a : { filename: a.filename, content_base64: a.content_base64, content_type: a.content_type ?? 'application/octet-stream' })),
    };
    const r = await replyToEmail(ctx.organizationId, { userId: ctx.userId, userEmail: ctx.userEmail, orgName: ctx.organizationName }, parseWith(zUuid, id, 'id'), { ...body, content }, ctx.supabase);
    return ok(r.message, 201, { warnings: r.warnings, missing: r.missing });
  } catch (err) {
    return emailErrorResponse(err, 'email/messages/[id]/reply');
  }
}
