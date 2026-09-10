import { NextRequest } from 'next/server';
import { emailErrorResponse, getServerOrgContext, ok, readJson } from '@/lib/services/crm/email/http';
import { createTemplate, ensureSeedTemplates, listTemplates, type CreateTemplateInput } from '@/lib/services/crm/email/templatesService';
import { parseWith, queryObject, zTemplateCreate, zTemplatesQuery } from '@/lib/services/crm/email/schemas';

export const runtime = 'nodejs';

/**
 * GET /api/email/templates?channel=email&kind=&q=&active=&page=&pageSize=
 * Siembra las 6 plantillas base la primera vez que una org no tiene ninguna.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
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
    let result = await listTemplates(ctx.organizationId, filters, ctx.supabase);
    if (channel === 'email' && result.total === 0 && !filters.q && !filters.kind && filters.active === undefined) {
      const seeded = await ensureSeedTemplates(ctx.organizationId, ctx.userId, ctx.supabase);
      if (seeded > 0) result = await listTemplates(ctx.organizationId, filters, ctx.supabase);
    }
    return ok(result.data, 200, { total: result.total });
  } catch (err) {
    return emailErrorResponse(err, 'email/templates GET');
  }
}

/** POST /api/email/templates — CreateTemplateInput */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const body = parseWith(zTemplateCreate, await readJson<unknown>(request), 'body de /api/email/templates');
    const t = await createTemplate(ctx.organizationId, ctx.userId, { ...body, channel: 'email' } as CreateTemplateInput, ctx.supabase);
    return ok(t, 201);
  } catch (err) {
    return emailErrorResponse(err, 'email/templates POST');
  }
}
