// ============================================================
// /api/integrations/open-finance/links
// Conexiones (links) bancarias de la organizacion de la sesion
// GET  - lista links (SIN la clave de sesion bancaria)
// POST - crea un nuevo link bancario
//
// SEGURIDAD (GO-sec, 2026-09-23; auditoria §1.4): GET devolvia `select *` de
// cualquier organizacion (`?organizationId=`), `session_key` incluida en texto
// plano. Ahora: organizacion de la sesion (`withOrg`), organizacion ajena en
// body o query → 403 (`readOrgBody`), permiso `finance.*` resuelto en el
// servidor, y `session_key` NUNCA sale al cliente (`sinSecretosDeLink`).
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { openFinanceService } from '@/lib/services/integrations/openFinance/openFinanceService';
import { consentimientoDeLaOrganizacion, sinSecretosDeLink } from '@/lib/services/integrations/openFinance/seguridadRutas';
import type { OpenFinanceProvider } from '@/lib/services/integrations/openFinance/openFinanceTypes';

const RUTA = 'open-finance/links';
const PROVEEDORES: OpenFinanceProvider[] = ['prometeo', 'belvo'];

// GET - lista links de la organizacion de la sesion
export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const links = await openFinanceService.getLinks(null, ctx.organizationId);
    return NextResponse.json({ success: true, data: links.map(sinSecretosDeLink) });
  } catch (error) {
    return routeErrorResponse('Open Finance Links GET', error);
  }
});

interface LinkBody {
  provider?: string;
  institutionCode?: string;
  institutionName?: string;
  consentId?: string;
  metadata?: Record<string, unknown>;
}

// POST - crea un nuevo link bancario de la organizacion de la sesion
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<LinkBody>(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.CREAR, RUTA);

    const { provider, institutionCode, institutionName, consentId, metadata } = body;
    if (!provider || !institutionCode || !institutionName) {
      return NextResponse.json(
        { error: 'provider, institutionCode e institutionName son requeridos' },
        { status: 400 },
      );
    }
    if (!PROVEEDORES.includes(provider as OpenFinanceProvider)) {
      return NextResponse.json({ error: 'provider no valido' }, { status: 400 });
    }
    if (consentId) await consentimientoDeLaOrganizacion(ctx, consentId);

    const link = await openFinanceService.createLink(
      null,
      {
        organizationId: ctx.organizationId,
        provider: provider as OpenFinanceProvider,
        institutionCode,
        institutionName,
        consentId,
        metadata,
      },
      ctx.userId,
    );

    return NextResponse.json({ success: true, data: link }, { status: 201 });
  } catch (error) {
    return routeErrorResponse('Open Finance Links POST', error);
  }
});
