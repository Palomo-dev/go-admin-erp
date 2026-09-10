import { NextRequest } from 'next/server';
import { emailErrorResponse, getServerOrgContext, ok, readJson } from '@/lib/services/crm/email/http';
import { sendEmail, type SendContent, type SendEmailRequest } from '@/lib/services/crm/email/sendService';
import { parseWith, zSendBody, type SendBody } from '@/lib/services/crm/email/schemas';
import { EmailError } from '@/lib/services/crm/email/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

function contentFrom(body: SendBody): SendContent {
  if (body.content) return body.content;
  const variables = body.variables ?? body.template_variables ?? {};
  if (body.template_id) return { template_id: body.template_id, variables };
  if (body.blocks) return { blocks: body.blocks, variables };
  if (body.html || body.text) return { html: body.html ?? `<p>${body.text ?? ''}</p>`, text: body.text ?? undefined, variables };
  throw new EmailError('VALIDATION', 'Se requiere content ({template_id|blocks|html}) o html/template_id', 400);
}

/**
 * POST /api/email/send — contrato final FASE-07 §4.2:
 * { to[], cc?, bcc?, subject, content:{template_id|blocks|html, variables?},
 *   attachments?:[{document_id}|{filename,content_base64,content_type}], scheduled_at?,
 *   related_type?, related_id?, kind?, to_customer_id?, from_domain_id?, client_request_id?, strict_variables? }
 * → 201 {data: EmailMessage, warnings, missing} · 202 si programado
 * Errores: 400 VALIDATION/TOO_MANY_RECIPIENTS, 403 CONTACT_OPTED_OUT, 404 NOT_FOUND,
 * 422 MISSING_VARIABLES/NO_SENDER/ATTACHMENTS_TOO_LARGE, 502 PROVIDER.
 * El servidor crea la ÚNICA activity del correo (el cliente no debe crear otra).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    // Validación zod del body completo (ronda 2). Rechaza claves desconocidas,
    // correos y uuid inválidos, `metadata` con claves reservadas y adjuntos
    // inline que no son base64.
    const body = parseWith(zSendBody, await readJson<unknown>(request), 'body de /api/email/send');
    const asList = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : undefined);
    const req: SendEmailRequest = {
      to: asList(body.to) ?? [],
      cc: asList(body.cc),
      bcc: asList(body.bcc),
      to_customer_id: body.to_customer_id ?? null,
      from_domain_id: body.from_domain_id ?? null,
      subject: body.subject,
      preheader: body.preheader,
      content: contentFrom(body),
      attachments: body.attachments?.map((a) => ('document_id' in a ? a : { filename: a.filename, content_base64: a.content_base64, content_type: a.content_type ?? 'application/octet-stream' })),
      related_type: body.related_type,
      related_id: body.related_id,
      kind: body.kind,
      scheduled_at: body.scheduled_at ?? null,
      sequence_step_run_id: body.sequence_step_run_id ?? null,
      campaign_id: body.campaign_id ?? null,
      client_request_id: body.client_request_id ?? null,
      strict_variables: body.strict_variables,
      metadata: body.metadata,
      in_reply_to: body.in_reply_to ?? null,
    };
    const r = await sendEmail(ctx.organizationId, { userId: ctx.userId, userEmail: ctx.userEmail, orgName: ctx.organizationName }, req, ctx.supabase);
    return ok(r.message, r.scheduled ? 202 : 201, { scheduled: r.scheduled, warnings: r.warnings, missing: r.missing });
  } catch (err) {
    return emailErrorResponse(err, 'email/send');
  }
}
