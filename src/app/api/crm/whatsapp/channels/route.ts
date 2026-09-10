import { NextResponse } from 'next/server';
import { withWhatsAppRoute } from '@/lib/services/crm/whatsapp/http';
import { listChannels } from '@/lib/services/crm/whatsapp/channelService';
import { isOrgAdminContext } from '@/lib/utils/orgContext';

/**
 * GET /api/crm/whatsapp/channels → { data: ChannelSummary[], default_channel_id, can_manage }
 * (sin credenciales). `can_manage` = admin de organización: las acciones de
 * campaña (lanzar/pausar/reanudar/cancelar) y el CRUD de plantillas lo exigen,
 * y la UI lo usa para no ofrecerlas a quien recibiría un 403.
 */
export const GET = withWhatsAppRoute(async (ctx) => {
  const r = await listChannels(ctx.organizationId, ctx.supabase);
  return NextResponse.json({ ...r, can_manage: isOrgAdminContext(ctx) });
});
