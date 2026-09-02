import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { whatsappCloudService } from '@/lib/services/integrations/whatsapp';

// POST: Validar credenciales de WhatsApp
// Acepta: { channel_id } (post-save) O { phone_number_id, access_token } (pre-save wizard)
export async function POST(request: NextRequest) {
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
    const body = await request.json();
    const { channel_id, phone_number_id, access_token } = body;

    let phoneNumberId: string;
    let accessToken: string;

    if (phone_number_id && access_token) {
      // Modo directo: credenciales enviadas desde el wizard (pre-save)
      phoneNumberId = phone_number_id;
      accessToken = access_token;
    } else if (channel_id) {
      // Modo canal: obtener credenciales guardadas
      const creds = await whatsappCloudService.getCredentialsByChannelId(channel_id);
      if (!creds || !creds.phoneNumberId || !creds.accessToken) {
        return NextResponse.json({
          valid: false,
          message: 'Credenciales incompletas. Se requieren phone_number_id y access_token.',
        });
      }
      phoneNumberId = creds.phoneNumberId;
      accessToken = creds.accessToken;
    } else {
      return NextResponse.json(
        { error: 'Se requiere channel_id o (phone_number_id + access_token)' },
        { status: 400 }
      );
    }

    // Validar contra la API de Meta
    const result = await whatsappCloudService.validateCredentials(
      phoneNumberId,
      accessToken
    );

    // Si se validó por channel_id, actualizar estado en BD — filtrar por organización
    if (channel_id) {
      await ctx.supabase
        .from('channel_credentials')
        .update({
          is_valid: result.valid,
          last_validated_at: new Date().toISOString(),
        })
        .eq('channel_id', channel_id)
        .eq('provider', 'meta')
        .eq('organization_id', ctx.organizationId);

      if (result.valid) {
        await ctx.supabase
          .from('channels')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('id', channel_id)
          .eq('organization_id', ctx.organizationId)
          .eq('status', 'pending');
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Validate] Error:', error);
    return NextResponse.json(
      { valid: false, message: error.message || 'Error validando credenciales' },
      { status: 500 }
    );
  }
}
