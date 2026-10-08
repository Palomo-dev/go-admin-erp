/**
 * PATCH /api/chat/ai/settings — guarda la configuración del chat IA de la
 * organización (Configuración › Chat › IA del chat).
 *
 * - La organización sale de la sesión (`getServerOrgContext`). Si el body trae
 *   otra organización: 403 y se registra (`readOrgBody`).
 * - Exige `admin.full_access` (super admin, rol 1/2 o el permiso por rol o
 *   cargo), resuelto en el servidor: el mismo permiso que pone la sección en
 *   solo lectura. La base lo exige otra vez (RLS restrictiva).
 * - Body validado con zod (`cambiosAjustesIaSchema`): solo columnas de
 *   comportamiento, nunca créditos.
 */
import { NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, readOrgBody, requireOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { cambiosAjustesIaSchema, ErrorAjustesIa, guardarAjustesIa, PERMISO_CONFIGURAR_IA_CHAT } from '@/lib/services/chat/aiSettingsServidor';
import { sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { logError } from '@/lib/utils/errorMessage';

const RUTA = 'PATCH /api/chat/ai/settings';

export async function PATCH(request: Request) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: Record<string, unknown> = await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgAdminOrPermission(ctx, PERMISO_CONFIGURAR_IA_CHAT);
    const parsed = cambiosAjustesIaSchema.safeParse(sinClavesDeOrganizacion(body));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const data = await guardarAjustesIa(ctx, parsed.data);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: err.statusCode });
    }
    if (err instanceof ErrorAjustesIa) {
      if (err.statusCode >= 500) logError(`[${RUTA}]`, err);
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    logError(`[${RUTA}]`, err);
    return NextResponse.json({ success: false, error: 'No se pudo guardar la configuración' }, { status: 500 });
  }
}
