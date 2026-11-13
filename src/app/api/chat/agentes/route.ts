/**
 * GET /api/chat/agentes — personas que pueden atender el Chat (Figma
 * 91-chat-02 «Asignado a»): nombre, avatar, cargo y conversaciones abiertas.
 * Organización de la sesión; quien no puede usar el Chat recibe 403.
 */
import { NextResponse } from 'next/server';
import { withOrg, jsonError } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { listarAgentesChat } from '@/lib/services/chat/agentesChat.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/chat/agentes' });
  const agentes = await listarAgentesChat(ctx);
  if (!agentes.some((a) => a.esYo)) return jsonError(403, 'SIN_ACCESO_CHAT', 'No tienes acceso al Chat');
  return NextResponse.json({ data: agentes }, { headers: { 'Cache-Control': 'no-store' } });
});
