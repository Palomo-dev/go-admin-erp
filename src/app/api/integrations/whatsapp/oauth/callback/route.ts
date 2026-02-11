import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const META_APP_ID = process.env.META_APP_ID || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const WHATSAPP_CONNECTOR_ID = '9ba81290-1272-4cf1-9dc5-a06feb762d21';

/**
 * POST /api/integrations/whatsapp/oauth/callback
 * Recibe code + phone_number_id + waba_id del Embedded Signup (frontend).
 * Intercambia code → access_token, guarda credenciales, registra webhook y sincroniza.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      code,
      phone_number_id,
      waba_id,
      organization_id,
      channel_id,
    } = body;

    if (!code || !phone_number_id || !waba_id || !organization_id) {
      return NextResponse.json(
        { error: 'Se requieren: code, phone_number_id, waba_id, organization_id' },
        { status: 400 }
      );
    }

    // 1. Intercambiar code → access_token
    const tokenUrl = new URL(`${GRAPH_API_BASE}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', META_APP_ID);
    tokenUrl.searchParams.set('client_secret', META_APP_SECRET);
    tokenUrl.searchParams.set('code', code);
    tokenUrl.searchParams.set('redirect_uri', '');

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error('[WhatsApp OAuth] Token exchange error:', tokenData.error);
      return NextResponse.json({
        success: false,
        error: tokenData.error.message || 'Error intercambiando code por token',
      }, { status: 400 });
    }

    const shortLivedToken = tokenData.access_token;

    // 2. Intercambiar short-lived → long-lived token
    const longTokenUrl = new URL(`${GRAPH_API_BASE}/oauth/access_token`);
    longTokenUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longTokenUrl.searchParams.set('client_id', META_APP_ID);
    longTokenUrl.searchParams.set('client_secret', META_APP_SECRET);
    longTokenUrl.searchParams.set('fb_exchange_token', shortLivedToken);

    const longTokenRes = await fetch(longTokenUrl.toString());
    const longTokenData = await longTokenRes.json();

    const accessToken = longTokenData.access_token || shortLivedToken;

    // 3. Validar credenciales obtenidas (GET phone number info)
    const phoneRes = await fetch(
      `${GRAPH_API_BASE}/${phone_number_id}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const phoneData = await phoneRes.json();

    if (phoneData.error) {
      return NextResponse.json({
        success: false,
        error: `Token válido pero no se pudo acceder al número: ${phoneData.error.message}`,
      }, { status: 400 });
    }

    // 4. Generar webhook verify token
    const webhookVerifyToken = `go_admin_wa_${organization_id}_${Date.now().toString(36)}`;

    // 5. Guardar/actualizar en channels + channel_credentials (CRM)
    let finalChannelId = channel_id;

    if (!finalChannelId) {
      // Buscar canal WhatsApp existente de la org
      const { data: existingChannel } = await supabaseAdmin
        .from('channels')
        .select('id')
        .eq('organization_id', organization_id)
        .eq('type', 'whatsapp')
        .limit(1)
        .maybeSingle();

      if (existingChannel) {
        finalChannelId = existingChannel.id;
      } else {
        // Crear canal nuevo
        const { data: newChannel } = await supabaseAdmin
          .from('channels')
          .insert({
            organization_id,
            type: 'whatsapp',
            name: phoneData.verified_name || 'WhatsApp Business',
            status: 'active',
          })
          .select('id')
          .single();

        finalChannelId = newChannel?.id;
      }
    }

    if (finalChannelId) {
      const credPayload = {
        phone_number_id,
        business_account_id: waba_id,
        access_token: accessToken,
        webhook_verify_token: webhookVerifyToken,
      };

      // Upsert channel_credentials
      const { data: existingCreds } = await supabaseAdmin
        .from('channel_credentials')
        .select('id')
        .eq('channel_id', finalChannelId)
        .maybeSingle();

      if (existingCreds) {
        await supabaseAdmin
          .from('channel_credentials')
          .update({
            credentials: credPayload,
            is_valid: true,
            last_validated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('channel_id', finalChannelId);
      } else {
        await supabaseAdmin
          .from('channel_credentials')
          .insert({
            channel_id: finalChannelId,
            provider: 'meta',
            credentials: credPayload,
            is_valid: true,
            last_validated_at: new Date().toISOString(),
          });
      }

      // Activar canal
      await supabaseAdmin
        .from('channels')
        .update({
          name: phoneData.verified_name || 'WhatsApp Business',
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', finalChannelId);
    }

    // 6. Guardar/actualizar en integration_connections + integration_credentials
    let connectionId: string | null = null;

    // Buscar si el canal tiene conexión vinculada
    if (finalChannelId) {
      const { data: channelData } = await supabaseAdmin
        .from('channels')
        .select('integration_connection_id')
        .eq('id', finalChannelId)
        .single();

      connectionId = channelData?.integration_connection_id || null;
    }

    if (!connectionId) {
      // Buscar conexión existente de la org
      const { data: existingConn } = await supabaseAdmin
        .from('integration_connections')
        .select('id')
        .eq('organization_id', organization_id)
        .eq('connector_id', WHATSAPP_CONNECTOR_ID)
        .limit(1)
        .maybeSingle();

      if (existingConn) {
        connectionId = existingConn.id;
      } else {
        const { data: newConn } = await supabaseAdmin
          .from('integration_connections')
          .insert({
            organization_id,
            connector_id: WHATSAPP_CONNECTOR_ID,
            name: phoneData.verified_name || 'WhatsApp Business',
            environment: 'production',
            status: 'connected',
            connected_at: new Date().toISOString(),
            settings: { auto_sync: true, embedded_signup: true },
          })
          .select('id')
          .single();

        connectionId = newConn?.id || null;
      }
    }

    // Vincular canal ↔ conexión
    if (finalChannelId && connectionId) {
      await supabaseAdmin
        .from('channels')
        .update({ integration_connection_id: connectionId, updated_at: new Date().toISOString() })
        .eq('id', finalChannelId);
    }

    // Guardar credenciales en integration_credentials
    if (connectionId) {
      await supabaseAdmin
        .from('integration_credentials')
        .delete()
        .eq('connection_id', connectionId);

      await supabaseAdmin.from('integration_credentials').insert([
        { connection_id: connectionId, credential_type: 'phone_number_id', purpose: 'primary', secret_ref: phone_number_id, key_prefix: phone_number_id.substring(0, 8) + '...', status: 'active' },
        { connection_id: connectionId, credential_type: 'business_account_id', purpose: 'primary', secret_ref: waba_id, key_prefix: waba_id.substring(0, 8) + '...', status: 'active' },
        { connection_id: connectionId, credential_type: 'access_token', purpose: 'primary', secret_ref: accessToken, key_prefix: accessToken.substring(0, 12) + '...', status: 'active' },
        { connection_id: connectionId, credential_type: 'webhook_verify_token', purpose: 'primary', secret_ref: webhookVerifyToken, key_prefix: webhookVerifyToken.substring(0, 10) + '...', status: 'active' },
      ]);

      await supabaseAdmin
        .from('integration_connections')
        .update({ status: 'connected', connected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', connectionId);
    }

    // 7. Intentar registrar webhook automáticamente
    let webhookRegistered = false;
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const webhookCallbackUrl = `${appUrl}/api/integrations/whatsapp/webhook`;

      const subRes = await fetch(
        `${GRAPH_API_BASE}/${META_APP_ID}/subscriptions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${META_APP_ID}|${META_APP_SECRET}`,
          },
          body: JSON.stringify({
            object: 'whatsapp_business_account',
            callback_url: webhookCallbackUrl,
            verify_token: process.env.WHATSAPP_VERIFY_TOKEN || 'go_admin_whatsapp_verify',
            fields: ['messages'],
          }),
        }
      );
      const subData = await subRes.json();
      webhookRegistered = subData.success === true;
    } catch (webhookError) {
      console.warn('[WhatsApp OAuth] Webhook registration failed (non-critical):', webhookError);
    }

    return NextResponse.json({
      success: true,
      channel_id: finalChannelId,
      connection_id: connectionId,
      phone_number: phoneData.display_phone_number,
      verified_name: phoneData.verified_name,
      quality_rating: phoneData.quality_rating,
      webhook_registered: webhookRegistered,
      message: `WhatsApp conectado: ${phoneData.verified_name || phoneData.display_phone_number}`,
    });
  } catch (error: any) {
    console.error('[WhatsApp OAuth Callback] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error en el proceso de autenticación' },
      { status: 500 }
    );
  }
}
