import { NextRequest } from 'next/server';
import { emailErrorResponse, getServerOrgContext, ok } from '@/lib/services/crm/email/http';
import { duplicateTemplate } from '@/lib/services/crm/email/templatesService';
import { parseWith, zTemplateDuplicate, zUuid } from '@/lib/services/crm/email/schemas';

export const runtime = 'nodejs';

/** POST /api/email/templates/[id]/duplicate — { name? } */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const { id } = await params;
    const body = parseWith(zTemplateDuplicate, await request.json().catch(() => ({})), 'body de duplicate');
    const t = await duplicateTemplate(ctx.organizationId, ctx.userId, parseWith(zUuid, id, 'id'), body.name, ctx.supabase);
    return ok(t, 201);
  } catch (err) {
    return emailErrorResponse(err, 'email/templates/[id]/duplicate');
  }
}
