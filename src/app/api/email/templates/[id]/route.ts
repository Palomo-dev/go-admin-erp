import { NextRequest } from 'next/server';
import { emailErrorResponse, getServerOrgContext, ok, readJson } from '@/lib/services/crm/email/http';
import { deleteTemplate, requireTemplate, updateTemplate, type UpdateTemplateInput } from '@/lib/services/crm/email/templatesService';
import { parseWith, zTemplateUpdate, zUuid } from '@/lib/services/crm/email/schemas';
import { templateStats } from '@/lib/services/crm/email/messagesService';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** GET /api/email/templates/[id]?stats=1 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext(request);
    const { id } = await params;
    const t = await requireTemplate(ctx.organizationId, id, ctx.supabase);
    const stats = request.nextUrl.searchParams.get('stats') === '1' ? await templateStats(ctx.organizationId, id, ctx.supabase) : undefined;
    return ok(t, 200, stats ? { stats } : {});
  } catch (err) {
    return emailErrorResponse(err, 'email/templates/[id] GET');
  }
}

/** PATCH /api/email/templates/[id] — UpdateTemplateInput (version++) */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext(request);
    const { id } = await params;
    const body = parseWith(zTemplateUpdate, await readJson<unknown>(request), 'body de PATCH /api/email/templates/[id]');
    const t = await updateTemplate(ctx.organizationId, ctx.userId, parseWith(zUuid, id, 'id'), body as UpdateTemplateInput, ctx.supabase);
    return ok(t);
  } catch (err) {
    return emailErrorResponse(err, 'email/templates/[id] PATCH');
  }
}

/** DELETE /api/email/templates/[id] — 409 si es de sistema; soft si tiene uso */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext(request);
    const { id } = await params;
    const r = await deleteTemplate(ctx.organizationId, id, ctx.supabase);
    return ok(r);
  } catch (err) {
    return emailErrorResponse(err, 'email/templates/[id] DELETE');
  }
}
