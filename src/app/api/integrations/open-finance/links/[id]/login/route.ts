// ============================================================
// /api/integrations/open-finance/links/[id]/login
// Login al banco de un link de la organizacion de la sesion
// POST - login bancario (body: { username, password, documentNumber?, type? })
//
// SEGURIDAD (GO-sec, 2026-09-23): sesion + organizacion de la sesion
// (`withOrg`), organizacion ajena en el body → 403 (`readOrgBody`),
// `finance.create`, el link tiene que ser de la organizacion (404) y la
// respuesta NUNCA incluye la clave de sesion bancaria: el servicio la guarda en
// el link y al cliente solo le llega si hubo sesion. Las credenciales del banco
// no se registran en ningun log.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { openFinanceService } from '@/lib/services/integrations/openFinance/openFinanceService';
import { linkDeLaOrganizacion, sinSecretosDeLink } from '@/lib/services/integrations/openFinance/seguridadRutas';

const RUTA = 'open-finance/links/[id]/login';

interface LoginBody {
  username?: string;
  password?: string;
  documentNumber?: string;
  type?: string;
}

export const POST = withOrg(async (ctx, request, routeParams) => {
  try {
    const body = await readOrgBody<LoginBody>(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.CREAR, RUTA);

    const params = routeParams ? await routeParams.params : {};
    const id = typeof params.id === 'string' ? params.id : '';
    await linkDeLaOrganizacion(ctx, id);

    const { username, password, documentNumber, type } = body;
    if (!username || !password) {
      return NextResponse.json({ error: 'username y password son requeridos' }, { status: 400 });
    }

    // Proveedor e institucion del link (cliente de la sesion + filtro de organizacion)
    const { data: link } = await ctx.supabase
      .from('open_finance_links')
      .select('provider, institution_code')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (!link) {
      return NextResponse.json({ error: 'Link no encontrado' }, { status: 404 });
    }

    const result = await openFinanceService.loginToBank(
      null,
      id,
      link.provider as string,
      {
        provider: link.institution_code as string,
        username,
        password,
        document_number: documentNumber,
        type,
      },
    );

    const { session_key: sesion, ...resto } = (result ?? {}) as unknown as Record<string, unknown>;
    return NextResponse.json({ success: true, data: { ...sinSecretosDeLink(resto), sesionActiva: Boolean(sesion) } });
  } catch (error) {
    return routeErrorResponse('Open Finance Login POST', error);
  }
});
