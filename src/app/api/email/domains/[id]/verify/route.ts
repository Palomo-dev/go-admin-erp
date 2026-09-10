import { NextRequest } from 'next/server';
import { emailErrorResponse, getServerOrgContext, ok } from '@/lib/services/crm/email/http';
import { parseWith, zUuid } from '@/lib/services/crm/email/schemas';
import { requireOrgAdmin } from '@/lib/utils/orgContext';
import { verifyDomain } from '@/lib/services/crm/email/domainsService';

export const runtime = 'nodejs';

/** POST /api/email/domains/[id]/verify (admin) — domains.verify + domains.get → status */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    requireOrgAdmin(ctx);
    const { id: rawId } = await params;
    // uuid validado en la ruta: un id basura daba un 500 de Postgres (tester r2 #8).
    const id = parseWith(zUuid, rawId, 'id');
    return ok(await verifyDomain(ctx.organizationId, id, ctx.supabase));
  } catch (err) {
    return emailErrorResponse(err, 'email/domains/[id]/verify');
  }
}
