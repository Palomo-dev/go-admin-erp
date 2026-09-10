import { NextRequest } from 'next/server';
import { emailErrorResponse, getServerOrgContext, ok, readJson } from '@/lib/services/crm/email/http';
import { requireOrgAdmin } from '@/lib/utils/orgContext';
import { createDomain, listDomains, type CreateDomainInput } from '@/lib/services/crm/email/domainsService';
import { parseWith, zDomainCreate } from '@/lib/services/crm/email/schemas';

export const runtime = 'nodejs';

/** GET /api/email/domains — dominios de la org (con dns_records y extras). */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    return ok(await listDomains(ctx.organizationId, ctx.supabase));
  } catch (err) {
    return emailErrorResponse(err, 'email/domains GET');
  }
}

/**
 * POST /api/email/domains (admin)
 * { domain, from_name, from_email_local?, reply_to?, region?, open_tracking?, click_tracking?, receiving_enabled?, is_default? }
 * → 201 dominio creado en Resend (+ API key sending_access por dominio) con DNS a publicar.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    requireOrgAdmin(ctx);
    const body = parseWith(zDomainCreate, await readJson<unknown>(request), 'body de /api/email/domains');
    const d = await createDomain(ctx.organizationId, body as CreateDomainInput, ctx.supabase);
    return ok(d, 201);
  } catch (err) {
    return emailErrorResponse(err, 'email/domains POST');
  }
}
