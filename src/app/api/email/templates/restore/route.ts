import { NextRequest } from 'next/server';
import { emailErrorResponse, getServerOrgContext, ok } from '@/lib/services/crm/email/http';
import { assertTemplateQuery, readTemplateBody, requireTemplateWrite } from '@/lib/services/crm/email/templateAccess';
import { ensureSeedTemplates } from '@/lib/services/crm/email/templatesService';
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    assertTemplateQuery(ctx, request); await requireTemplateWrite(ctx); await readTemplateBody(ctx, request);
    return ok({ created: await ensureSeedTemplates(ctx.organizationId, ctx.userId, ctx.supabase) });
  } catch (error) { return emailErrorResponse(error, 'Restaurar plantillas base'); }
}
