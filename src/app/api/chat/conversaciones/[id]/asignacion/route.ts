/**
 * PUT /api/chat/conversaciones/[id]/asignacion — body `{ memberId: number | null }`.
 * Asigna la conversación a una persona con acceso al Chat o la deja sin
 * asignar (`null`). La regla vive en `asignarConversacion` (servidor): quien
 * pide y quien recibe deben poder usar el Chat; la conversación, ser de la
 * organización de la sesión. Avisa por notificación a quien la recibe.
 */
import { NextResponse } from 'next/server';
import { withOrg, jsonError, OrgContextError } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { asignarConversacion } from '@/lib/services/chat/agentesChat.server';
import { leerMemberId } from '@/lib/services/chat/agentesChat';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PUT = withOrg(async (ctx, req, routeParams) => {
  const params = routeParams ? await routeParams.params : {};
  const id = String(params.id ?? '');
  if (!UUID.test(id)) return jsonError(400, 'ID_INVALIDO', 'Conversación inválida');
  const cuerpo = await readOrgBody<unknown>(ctx, req, { route: 'PUT /api/chat/conversaciones/[id]/asignacion' });
  const memberId = leerMemberId(cuerpo);
  if (memberId === undefined) return jsonError(400, 'CUERPO_INVALIDO', 'Indica memberId (número o null)');
  try {
    const r = await asignarConversacion(ctx, id, memberId);
    return NextResponse.json(r);
  } catch (err) {
    if (err instanceof OrgContextError) return jsonError(err.statusCode, err.code ?? 'ERROR', err.message);
    throw err;
  }
});
