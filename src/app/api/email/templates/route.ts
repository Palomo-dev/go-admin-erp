import { assertTemplateQuery, requireTemplateRead, requireTemplateWrite, canManageTemplates, readTemplateBody } from '@/lib/services/crm/email/templateAccess';
import { NextRequest } from 'next/server';
import { emailErrorResponse, getServerOrgContext, ok } from '@/lib/services/crm/email/http';
import { createTemplate, listTemplates, type CreateTemplateInput } from '@/lib/services/crm/email/templatesService';
import { parseWith, queryObject, zTemplateCreate, zTemplatesQuery } from '@/lib/services/crm/email/schemas';

export const runtime = 'nodejs';

/**
 * GET /api/email/templates?channel=email&kind=&q=&active=&page=&pageSize=
 * Lectura sin siembra: las bases se restauran mediante POST explícito.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    assertTemplateQuery(ctx, request);
    await requireTemplateRead(ctx);
    const q = parseWith(zTemplatesQuery, queryObject(request.nextUrl.searchParams, ['channel', 'kind', 'q', 'active', 'page', 'pageSize']), 'query');
    const channel = q.channel;
    const filters = {
      channel,
      kind: q.kind,
      q: q.q,
      active: q.active === undefined ? undefined : q.active === 'true',
      page: q.page,
      pageSize: q.pageSize,
    };
    const result = await listTemplates(ctx.organizationId, filters, ctx.supabase);
    return ok(result.data, 200, { total: result.total, can_manage: await canManageTemplates(ctx) });
  } catch (err) {
    return emailErrorResponse(err, 'email/templates GET');
  }
}

/** POST /api/email/templates — CreateTemplateInput */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    assertTemplateQuery(ctx, request);
    await requireTemplateWrite(ctx);
    const body = parseWith(zTemplateCreate, await readTemplateBody(ctx, request), 'body de /api/email/templates');
    const t = await createTemplate(ctx.organizationId, ctx.userId, { ...body, channel: 'email' } as CreateTemplateInput, ctx.supabase);
    return ok(t, 201);
  } catch (err) {
    return emailErrorResponse(err, 'email/templates POST');
  }
}
