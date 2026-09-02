import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { whatsappCloudService } from '@/lib/services/integrations/whatsapp';

// GET: Listar message templates de un WABA
export async function GET(request: NextRequest) {
  // Validar autenticación y organización
  let ctx;
  try {
    ctx = await getServerOrgContext();
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    throw err;
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const channelId = searchParams.get('channel_id');
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    if (!channelId) {
      return NextResponse.json(
        { error: 'channel_id es requerido' },
        { status: 400 }
      );
    }

    // Verificar que el canal pertenece a la organización del usuario
    const { data: channel, error: channelError } = await ctx.supabase
      .from('channels')
      .select('id')
      .eq('id', channelId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();

    if (channelError || !channel) {
      return NextResponse.json(
        { error: 'Canal no encontrado o no pertenece a la organización' },
        { status: 404 }
      );
    }

    // Obtener credenciales del canal
    const creds = await whatsappCloudService.getCredentialsByChannelId(channelId);
    if (!creds || !creds.businessAccountId || !creds.accessToken) {
      return NextResponse.json(
        { error: 'Credenciales incompletas. Se requieren business_account_id y access_token.' },
        { status: 400 }
      );
    }

    // Listar templates
    const templates = await whatsappCloudService.listTemplates(
      creds.businessAccountId,
      creds.accessToken,
      limit
    );

    return NextResponse.json({
      success: true,
      templates,
      total: templates.length,
    });
  } catch (error: any) {
    console.error('[WhatsApp Templates] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error obteniendo templates' },
      { status: 500 }
    );
  }
}
