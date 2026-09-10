/**
 * Helper compartido de las rutas qr/* (WhatsApp QR / Evolution).
 *
 * F0 (C2 msg): todas las rutas qr/* exigen sesión y que `channel_id`
 * pertenezca a la organización activa.
 */

import { NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, type ServerOrgContext } from '@/lib/utils/orgContext';

export async function requireOwnedChannel(
  request: Request,
  channelId: string | null | undefined
): Promise<{ ctx: ServerOrgContext } | { response: NextResponse }> {
  let ctx: ServerOrgContext;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return { response: NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode }) };
    }
    throw err;
  }

  if (!channelId) {
    return { response: NextResponse.json({ error: 'channel_id es requerido' }, { status: 400 }) };
  }

  const { data: channel } = await ctx.supabase
    .from('channels')
    .select('id')
    .eq('id', channelId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();

  if (!channel) {
    return {
      response: NextResponse.json(
        { error: 'Canal no encontrado o no pertenece a la organización' },
        { status: 404 }
      ),
    };
  }

  return { ctx };
}
