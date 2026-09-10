import { NextRequest } from 'next/server';
import { emailErrorResponse, getServerOrgContext, ok, readJson } from '@/lib/services/crm/email/http';
import { requireOrgAdmin } from '@/lib/utils/orgContext';
import { deleteDomain, getDomain, updateDomain, type UpdateDomainInput } from '@/lib/services/crm/email/domainsService';
import { parseWith, zDomainUpdate, zUuid } from '@/lib/services/crm/email/schemas';
import { EmailError } from '@/lib/services/crm/email/types';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** GET /api/email/domains/[id] */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext(request);
    // uuid validado en la ruta: un id basura daba un 500 de Postgres (tester r2 #8).
    const id = parseWith(zUuid, (await params).id, 'id');
    const d = await getDomain(ctx.organizationId, id, ctx.supabase);
    if (!d) throw new EmailError('NOT_FOUND', 'Dominio no encontrado', 404);
    return ok(d);
  } catch (err) {
    return emailErrorResponse(err, 'email/domains/[id] GET');
  }
}

/** PATCH /api/email/domains/[id] (admin) — { from_name?, from_email?, reply_to?, is_default?, open_tracking?, click_tracking?, receiving_enabled?, dmarc_configured? } */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext(request);
    requireOrgAdmin(ctx);
    // uuid validado en la ruta: un id basura daba un 500 de Postgres (tester r2 #8).
    const id = parseWith(zUuid, (await params).id, 'id');
    const body = parseWith(zDomainUpdate, await readJson<unknown>(request), 'body de PATCH /api/email/domains/[id]');
    return ok(await updateDomain(ctx.organizationId, id, body as UpdateDomainInput, ctx.supabase));
  } catch (err) {
    return emailErrorResponse(err, 'email/domains/[id] PATCH');
  }
}

/** DELETE /api/email/domains/[id] (admin) — elimina en Resend (dominio + API key) y en BD */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext(request);
    requireOrgAdmin(ctx);
    // uuid validado en la ruta: un id basura daba un 500 de Postgres (tester r2 #8).
    const id = parseWith(zUuid, (await params).id, 'id');
    await deleteDomain(ctx.organizationId, id, ctx.supabase);
    return ok({ deleted: true });
  } catch (err) {
    return emailErrorResponse(err, 'email/domains/[id] DELETE');
  }
}
