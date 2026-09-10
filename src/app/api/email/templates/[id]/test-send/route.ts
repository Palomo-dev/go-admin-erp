import { NextRequest } from 'next/server';
import { emailErrorResponse, getServerOrgContext, ok, readJson } from '@/lib/services/crm/email/http';
import { sendEmail } from '@/lib/services/crm/email/sendService';
import { orgOwnsDomain } from '@/lib/services/crm/email/domainsService';
import { parseWith, zTestSend, zUuid } from '@/lib/services/crm/email/schemas';
import { EmailError } from '@/lib/services/crm/email/types';

export const runtime = 'nodejs';

/**
 * POST /api/email/templates/[id]/test-send
 * { to?: string (por defecto el email del usuario), context_ids?: {opportunity_id, customer_id}, variables? }
 *
 * Envío `kind: 'system'` con tag `test=true` y sin `fn_can_contact`.
 * RESTRICCIÓN (ronda 2, tester r1 #8): el destinatario debe ser el correo del
 * usuario autenticado o una dirección de un dominio registrado por la
 * organización. Antes se aceptaba cualquier `to`, lo que convertía esta ruta en
 * un canal de envío que se saltaba el consentimiento y no dejaba rastro.
 * Ahora, además, el envío SÍ crea su activity (marcada `test`).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const { id } = await params;
    const templateId = parseWith(zUuid, id, 'id de plantilla');
    const body = parseWith(zTestSend, await readJson<unknown>(request), 'body de test-send');
    const userEmail = (ctx.userEmail ?? '').trim().toLowerCase();
    const to = (body.to ?? userEmail).trim().toLowerCase();
    if (!to) throw new EmailError('VALIDATION', 'Indica el correo de prueba', 400);
    if (to !== userEmail) {
      const domain = to.split('@')[1] ?? '';
      if (!(await orgOwnsDomain(ctx.organizationId, domain, ctx.supabase))) {
        throw new EmailError(
          'TEST_RECIPIENT_NOT_ALLOWED',
          'La prueba solo puede enviarse a tu propio correo o a una dirección de un dominio de la organización',
          403,
        );
      }
    }
    const r = await sendEmail(ctx.organizationId, { userId: ctx.userId, userEmail: ctx.userEmail, orgName: ctx.organizationName }, {
      to: [to],
      content: { template_id: templateId, variables: body.variables },
      related_type: body.context_ids?.opportunity_id ? 'opportunity' : undefined,
      related_id: body.context_ids?.opportunity_id,
      to_customer_id: body.context_ids?.customer_id ?? null,
      test: true,
      strict_variables: false,
      metadata: { test_template_id: templateId, test_requested_by: ctx.userId },
    }, ctx.supabase);
    return ok(r.message, 201, { warnings: r.warnings, missing: r.missing });
  } catch (err) {
    return emailErrorResponse(err, 'email/templates/[id]/test-send');
  }
}
