import { NextRequest, NextResponse } from 'next/server';
import { whatsappCloudService } from '@/lib/services/integrations/whatsapp';

// GET: Listar message templates de un WABA
export async function GET(request: NextRequest) {
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
