/**
 * POST /api/organizacion/invitaciones/revocar — revoca una invitación pendiente
 * de la organización de la sesión. Body: `{ invitationId }`.
 *
 * Antes la pantalla hacía `update invitations set status='revoked'` desde el
 * navegador (auditoría 2026-10, P3-5): sin comprobar el estado y sin pasar por
 * el servidor. Aquí:
 * - la organización sale de la sesión (`withOrg`); otra en el body o en la
 *   query → 403 registrado (`readOrgBody`);
 * - mismo permiso que crear o reenviar invitaciones (`requireOrgAdmin`, como
 *   `/api/auth/invite`);
 * - solo se revoca una `pending` de ESTA organización. Una de otra
 *   organización, inexistente o ya usada responde lo mismo (404): la ruta no
 *   confirma qué invitaciones existen.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, requireOrgAdmin } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';

const RUTA = 'organizacion/invitaciones/revocar';

export const POST = withOrg(async (ctx, request) => {
  requireOrgAdmin(ctx);
  const body = await readOrgBody<{ invitationId?: unknown }>(ctx, request, { route: RUTA });
  const id = Number(body?.invitationId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'invitationId inválido' }, { status: 400 });
  }

  // Service role SOLO con la organización ya validada y filtrando por ella.
  const { data, error } = await getServiceClient()
    .from('invitations')
    .update({ status: 'revoked' })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (error) {
    console.error(`[${RUTA}]`, error.message);
    return NextResponse.json({ error: 'No se pudo revocar la invitación' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Invitación no válida o ya no está pendiente' }, { status: 404 });
  }
  return NextResponse.json({ success: true, invitationId: id });
});
