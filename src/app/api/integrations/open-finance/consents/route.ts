// ============================================================
// /api/integrations/open-finance/consents
// Consentimientos Open Finance de la organizacion (Decreto 0368 de 2026)
// GET  - lista consentimientos (query: ?status=xxx&consentType=xxx)
// POST - crea un nuevo consentimiento
//
// SEGURIDAD (GO-sec, 2026-09-23): la organizacion salia de la query/body o de
// «la membresia activa mas reciente». Ahora sale de la sesion (`withOrg`), un
// body o query con otra organizacion responde 403 (`readOrgBody`), hay permiso
// `finance.*` resuelto en el servidor y el `linkId` tiene que ser de la
// organizacion (404 si no).
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { consentService, type CreateConsentInput } from '@/lib/services/integrations/openFinance/consentService';
import { linkDeLaOrganizacion } from '@/lib/services/integrations/openFinance/seguridadRutas';

const RUTA = 'open-finance/consents';
const TIPOS_VALIDOS = ['data_access', 'payment_initiation', 'account_validation'];

// GET - lista consentimientos de la organizacion de la sesion
export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const consentType = searchParams.get('consentType') || undefined;

    const consents = await consentService.listConsents(ctx.organizationId, { status, consentType });
    return NextResponse.json({ success: true, data: consents });
  } catch (error) {
    return routeErrorResponse('Open Finance Consents GET', error);
  }
});

interface ConsentimientoBody {
  linkId?: string;
  consentType?: string;
  purpose?: string;
  scope?: Record<string, unknown>;
  expiresAt?: string;
}

// POST - crea un nuevo consentimiento de la organizacion de la sesion
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<ConsentimientoBody>(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.CREAR, RUTA);

    const { linkId, consentType, purpose, scope, expiresAt } = body;

    if (!consentType || !purpose) {
      return NextResponse.json({ error: 'consentType y purpose son requeridos' }, { status: 400 });
    }
    if (!TIPOS_VALIDOS.includes(consentType)) {
      return NextResponse.json({ error: 'consentType no valido' }, { status: 400 });
    }
    if (linkId) await linkDeLaOrganizacion(ctx, linkId);

    // IP y user agent del request para auditoria
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;

    const result = await consentService.createConsent({
      organizationId: ctx.organizationId,
      linkId,
      consentType: consentType as CreateConsentInput['consentType'],
      purpose,
      scope,
      expiresAt,
      ipAddress,
      userAgent,
      userId: ctx.userId,
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return routeErrorResponse('Open Finance Consents POST', error);
  }
});
