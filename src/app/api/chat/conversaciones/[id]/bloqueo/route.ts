/**
 * POST   /api/chat/conversaciones/[id]/bloqueo — bloquea el contacto.
 * DELETE /api/chat/conversaciones/[id]/bloqueo — lo desbloquea.
 *
 * Figma 93-chat-pendientes-01/02. La organización sale de la sesión; si el
 * body o la query traen otra, 403 y se registra (`readOrgBody`). El permiso
 * (acceso al Chat) y la pertenencia de la conversación los resuelve
 * `cambiarBloqueoContacto` en el servidor.
 */
import { NextResponse } from 'next/server';
import { withOrg, jsonError, OrgContextError, type OrgRouteHandler, type ServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { cambiarBloqueoContacto } from '@/lib/services/chat/bloqueoContacto.server';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function manejar(ctx: ServerOrgContext, req: Request, routeParams: Parameters<OrgRouteHandler>[2], bloquear: boolean): Promise<Response> {
  const params = routeParams ? await routeParams.params : {};
  const id = String(params.id ?? '');
  if (!UUID.test(id)) return jsonError(400, 'ID_INVALIDO', 'Conversación inválida');
  await readOrgBody<unknown>(ctx, req, { route: `${bloquear ? 'POST' : 'DELETE'} /api/chat/conversaciones/[id]/bloqueo` });
  try {
    return NextResponse.json(await cambiarBloqueoContacto(ctx, id, bloquear));
  } catch (err) {
    if (err instanceof OrgContextError) return jsonError(err.statusCode, err.code ?? 'ERROR', err.message);
    throw err;
  }
}

export const POST = withOrg((ctx, req, routeParams) => manejar(ctx, req, routeParams, true));
export const DELETE = withOrg((ctx, req, routeParams) => manejar(ctx, req, routeParams, false));
