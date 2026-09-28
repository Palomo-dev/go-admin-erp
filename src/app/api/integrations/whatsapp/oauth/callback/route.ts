import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { textoDe } from '@/lib/services/integrations/accesoIntegraciones';

const META_APP_ID = process.env.META_APP_ID || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const WHATSAPP_CONNECTOR_ID = '9ba81290-1272-4cf1-9dc5-a06feb762d21';
const RUTA = '/api/integrations/whatsapp/oauth/callback';
/** Ids de Meta (phone_number_id, WABA): solo dígitos; van en la ruta de la Graph API. */
const ID_META_RE = /^\d{5,30}$/;

type Fila = Record<string, unknown>;

/**
 * POST /api/integrations/whatsapp/oauth/callback
 * Recibe code + phone_number_id + waba_id del Embedded Signup (frontend).
 * Intercambia code → access_token, guarda credenciales, registra webhook y sincroniza.
 *
 * SEGURIDAD (GO-sec, 2026-09-24): antes NO tenía autenticación, tomaba
 * `organization_id` y `channel_id` del body y escribía con service role:
 * cualquiera podía crear canales y conexiones en otra organización o
 * sobrescribir las credenciales de WhatsApp de un canal ajeno (el comentario
 * de la allow-list del guardarraíl 5, «org en `state` firmado por Meta», no
 * era cierto: aquí no hay `state`). Ahora: sesión validada + administración
 * (`withOrg({ admin: true })`), organización ajena en body o query → 403 y
 * registro, la organización es SIEMPRE la de la sesión, `channel_id` tiene
 * que ser un canal WhatsApp de esa organización (404 si no) y toda escritura
 * lleva el filtro de organización. La conexión vinculada al canal solo se
 * reutiliza si es de la organización y de WhatsApp Cloud.
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Fila>(ctx, request, { route: RUTA });
    const organizationId = ctx.organizationId;
    const code = textoDe(body.code);
    const phoneNumberId = textoDe(body.phone_number_id);
    const wabaId = textoDe(body.waba_id);
    const channelIdPedido = textoDe(body.channel_id);

    if (!code || !ID_META_RE.test(phoneNumberId) || !ID_META_RE.test(wabaId)) {
      return NextResponse.json(
        { error: 'Se requieren: code, phone_number_id y waba_id' },
        { status: 400 }
      );
    }

    const db = getServiceClient();

    // 0. El canal (si viene) tiene que ser un canal WhatsApp de la organización.
    if (channelIdPedido) {
      const { data: canal } = await db
        .from('channels')
        .select('id')
        .eq('id', channelIdPedido)
        .eq('organization_id', organizationId)
        .eq('type', 'whatsapp')
        .maybeSingle();
      if (!canal) {
        console.warn('[WhatsApp OAuth] canal inexistente o de otra organización → 404', {
          route: RUTA,
          organizationId,
          userId: ctx.userId,
        });
        return NextResponse.json({ error: 'Canal no encontrado', code: 'CANAL_NO_ENCONTRADO' }, { status: 404 });
      }
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
      console.error('[WhatsApp OAuth] Token exchange error:', tokenData.error?.message ?? 'desconocido');
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

    const accessToken: string = longTokenData.access_token || shortLivedToken;

    // 3. Validar credenciales obtenidas (GET phone number info)
    const phoneRes = await fetch(
      `${GRAPH_API_BASE}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
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
    const webhookVerifyToken = `go_admin_wa_${organizationId}_${Date.now().toString(36)}`;

    // 5. Guardar/actualizar en channels + channel_credentials (CRM)
    let finalChannelId: string | null = channelIdPedido || null;

    if (!finalChannelId) {
      // Buscar canal WhatsApp existente de la org
      const { data: existingChannel } = await db
        .from('channels')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('type', 'whatsapp')
        .limit(1)
        .maybeSingle();

      if (existingChannel) {
        finalChannelId = String(existingChannel.id);
      } else {
        const { data: newChannel } = await db
          .from('channels')
          .insert({
            organization_id: organizationId,
            type: 'whatsapp',
            name: phoneData.verified_name || 'WhatsApp Business',
            status: 'active',
          })
          .select('id')
          .single();

        finalChannelId = newChannel?.id ? String(newChannel.id) : null;
      }
    }

    if (finalChannelId) {
      const credPayload = {
        phone_number_id: phoneNumberId,
        business_account_id: wabaId,
        access_token: accessToken,
        webhook_verify_token: webhookVerifyToken,
      };

      // Upsert channel_credentials (el canal ya se comprobó de la organización)
      const { data: existingCreds } = await db
        .from('channel_credentials')
        .select('id')
        .eq('channel_id', finalChannelId)
        .maybeSingle();

      if (existingCreds) {
        await db
          .from('channel_credentials')
          .update({
            credentials: credPayload,
            is_valid: true,
            last_validated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('channel_id', finalChannelId);
      } else {
        await db
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
      await db
        .from('channels')
        .update({
          name: phoneData.verified_name || 'WhatsApp Business',
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', finalChannelId)
        .eq('organization_id', organizationId);
    }

    // 6. Guardar/actualizar en integration_connections + integration_credentials
    let connectionId: string | null = null;

    // Conexión vinculada al canal: solo si es de la organización y de WhatsApp Cloud.
    if (finalChannelId) {
      const { data: channelData } = await db
        .from('channels')
        .select('integration_connection_id')
        .eq('id', finalChannelId)
        .eq('organization_id', organizationId)
        .maybeSingle();

      const vinculada = channelData?.integration_connection_id ? String(channelData.integration_connection_id) : null;
      if (vinculada) {
        const { data: propia } = await db
          .from('integration_connections')
          .select('id')
          .eq('id', vinculada)
          .eq('organization_id', organizationId)
          .eq('connector_id', WHATSAPP_CONNECTOR_ID)
          .maybeSingle();
        connectionId = propia ? vinculada : null;
      }
    }

    if (!connectionId) {
      // Buscar conexión existente de la org
      const { data: existingConn } = await db
        .from('integration_connections')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('connector_id', WHATSAPP_CONNECTOR_ID)
        .limit(1)
        .maybeSingle();

      if (existingConn) {
        connectionId = String(existingConn.id);
      } else {
        const { data: newConn } = await db
          .from('integration_connections')
          .insert({
            organization_id: organizationId,
            connector_id: WHATSAPP_CONNECTOR_ID,
            name: phoneData.verified_name || 'WhatsApp Business',
            environment: 'production',
            status: 'connected',
            connected_at: new Date().toISOString(),
            settings: { auto_sync: true, embedded_signup: true },
            created_by: ctx.userId,
          })
          .select('id')
          .single();

        connectionId = newConn?.id ? String(newConn.id) : null;
      }
    }

    // Vincular canal ↔ conexión
    if (finalChannelId && connectionId) {
      await db
        .from('channels')
        .update({ integration_connection_id: connectionId, updated_at: new Date().toISOString() })
        .eq('id', finalChannelId)
        .eq('organization_id', organizationId);
    }

    // Guardar credenciales en integration_credentials (conexión de la organización)
    if (connectionId) {
      await db
        .from('integration_credentials')
        .delete()
        .eq('connection_id', connectionId);

      await db.from('integration_credentials').insert([
        { connection_id: connectionId, credential_type: 'phone_number_id', purpose: 'primary', secret_ref: phoneNumberId, key_prefix: phoneNumberId.substring(0, 8) + '...', status: 'active' },
        { connection_id: connectionId, credential_type: 'business_account_id', purpose: 'primary', secret_ref: wabaId, key_prefix: wabaId.substring(0, 8) + '...', status: 'active' },
        { connection_id: connectionId, credential_type: 'access_token', purpose: 'primary', secret_ref: accessToken, key_prefix: accessToken.substring(0, 12) + '...', status: 'active' },
        { connection_id: connectionId, credential_type: 'webhook_verify_token', purpose: 'primary', secret_ref: webhookVerifyToken, key_prefix: webhookVerifyToken.substring(0, 10) + '...', status: 'active' },
      ]);

      await db
        .from('integration_connections')
        .update({ status: 'connected', connected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', connectionId)
        .eq('organization_id', organizationId);
    }

    // 7. Intentar registrar webhook automáticamente (solo con el token real de
    //    verificación: sin él la verificación GET respondería 403 igual).
    let webhookRegistered = false;
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    if (verifyToken) {
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
              verify_token: verifyToken,
              fields: ['messages'],
            }),
          }
        );
        const subData = await subRes.json();
        webhookRegistered = subData.success === true;
      } catch (webhookError) {
        console.warn('[WhatsApp OAuth] Webhook registration failed (non-critical):', webhookError instanceof Error ? webhookError.message : String(webhookError));
      }
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
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    console.error('[WhatsApp OAuth Callback] Error:', error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { success: false, error: 'Error en el proceso de autenticación' },
      { status: 500 }
    );
  }
}, { admin: true });
