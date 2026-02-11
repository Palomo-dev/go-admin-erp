// ============================================================
// Servicio de sincronización bidireccional WhatsApp
// Mantiene en sync: channel_credentials ↔ integration_credentials
// ============================================================

import { supabase } from '@/lib/supabase/config';

const WHATSAPP_CONNECTOR_ID = '9ba81290-1272-4cf1-9dc5-a06feb762d21';

interface WhatsAppCreds {
  phone_number_id: string;
  business_account_id: string;
  access_token: string;
  webhook_verify_token: string;
}

class WhatsAppSyncService {
  /**
   * Dirección: Integraciones → CRM
   * Después de guardar en integration_credentials, sincronizar a channels + channel_credentials
   */
  async syncToChannel(
    organizationId: number,
    connectionId: string,
    credentials: WhatsAppCreds
  ): Promise<boolean> {
    try {
      // Buscar canal WhatsApp existente vinculado a esta conexión
      let channelId: string | null = null;

      const { data: existingByConnection } = await supabase
        .from('channels')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('integration_connection_id', connectionId)
        .single();

      if (existingByConnection) {
        channelId = existingByConnection.id;
      } else {
        // Buscar canal WhatsApp sin conexión vinculada
        const { data: existingByType } = await supabase
          .from('channels')
          .select('id, integration_connection_id')
          .eq('organization_id', organizationId)
          .eq('type', 'whatsapp')
          .is('integration_connection_id', null)
          .limit(1)
          .single();

        if (existingByType) {
          // Vincular canal existente a esta conexión
          channelId = existingByType.id;
          await supabase
            .from('channels')
            .update({
              integration_connection_id: connectionId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', channelId);
        } else {
          // Crear nuevo canal WhatsApp
          const { data: newChannel } = await supabase
            .from('channels')
            .insert({
              organization_id: organizationId,
              type: 'whatsapp',
              name: `WhatsApp Business`,
              status: 'active',
              integration_connection_id: connectionId,
            })
            .select('id')
            .single();

          channelId = newChannel?.id || null;
        }
      }

      if (!channelId) {
        console.warn('[WhatsApp Sync] No se pudo obtener/crear canal');
        return false;
      }

      // Upsert en channel_credentials
      const credPayload = {
        phone_number_id: credentials.phone_number_id,
        business_account_id: credentials.business_account_id,
        access_token: credentials.access_token,
        webhook_verify_token: credentials.webhook_verify_token,
      };

      const { data: existingCreds } = await supabase
        .from('channel_credentials')
        .select('id')
        .eq('channel_id', channelId)
        .single();

      if (existingCreds) {
        await supabase
          .from('channel_credentials')
          .update({
            credentials: credPayload,
            is_valid: true,
            last_validated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('channel_id', channelId);
      } else {
        await supabase
          .from('channel_credentials')
          .insert({
            channel_id: channelId,
            provider: 'meta',
            credentials: credPayload,
            is_valid: true,
          });
      }

      console.log('[WhatsApp Sync] Integraciones → CRM completado. Canal:', channelId);
      return true;
    } catch (error) {
      console.error('[WhatsApp Sync] Error sincronizando a CRM:', error);
      return false;
    }
  }

  /**
   * Dirección: CRM → Integraciones
   * Después de guardar en channel_credentials, sincronizar a integration_connections + integration_credentials
   */
  async syncToIntegration(
    organizationId: number,
    channelId: string,
    credentials: WhatsAppCreds
  ): Promise<boolean> {
    try {
      let connectionId: string | null = null;

      // Verificar si el canal ya tiene una conexión vinculada
      const { data: channel } = await supabase
        .from('channels')
        .select('integration_connection_id')
        .eq('id', channelId)
        .single();

      if (channel?.integration_connection_id) {
        connectionId = channel.integration_connection_id;
      } else {
        // Buscar conexión WhatsApp existente de la organización
        const { data: existingConn } = await supabase
          .from('integration_connections')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('connector_id', WHATSAPP_CONNECTOR_ID)
          .limit(1)
          .single();

        if (existingConn) {
          connectionId = existingConn.id;
        } else {
          // Crear nueva conexión en integraciones
          const { data: newConn } = await supabase
            .from('integration_connections')
            .insert({
              organization_id: organizationId,
              connector_id: WHATSAPP_CONNECTOR_ID,
              name: 'WhatsApp Business',
              environment: 'production',
              status: 'connected',
              connected_at: new Date().toISOString(),
              settings: { auto_sync: true, error_notifications: true },
            })
            .select('id')
            .single();

          connectionId = newConn?.id || null;
        }

        // Vincular canal con la conexión
        if (connectionId) {
          await supabase
            .from('channels')
            .update({
              integration_connection_id: connectionId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', channelId);
        }
      }

      if (!connectionId) {
        console.warn('[WhatsApp Sync] No se pudo obtener/crear conexión');
        return false;
      }

      // Limpiar credenciales previas de esta conexión
      await supabase
        .from('integration_credentials')
        .delete()
        .eq('connection_id', connectionId);

      // Insertar las 4 credenciales en integration_credentials
      const entries = [
        { credential_type: 'phone_number_id', secret_ref: credentials.phone_number_id },
        { credential_type: 'business_account_id', secret_ref: credentials.business_account_id },
        { credential_type: 'access_token', secret_ref: credentials.access_token },
        { credential_type: 'webhook_verify_token', secret_ref: credentials.webhook_verify_token },
      ];

      const { error } = await supabase.from('integration_credentials').insert(
        entries.map((e) => ({
          connection_id: connectionId,
          credential_type: e.credential_type,
          purpose: 'primary',
          secret_ref: e.secret_ref,
          key_prefix: e.secret_ref.substring(0, 8) + '...',
          status: 'active',
        }))
      );

      if (error) {
        console.error('[WhatsApp Sync] Error guardando integration_credentials:', error);
        return false;
      }

      // Actualizar estado de la conexión
      await supabase
        .from('integration_connections')
        .update({
          status: 'connected',
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', connectionId);

      console.log('[WhatsApp Sync] CRM → Integraciones completado. Conexión:', connectionId);
      return true;
    } catch (error) {
      console.error('[WhatsApp Sync] Error sincronizando a Integraciones:', error);
      return false;
    }
  }
}

export const whatsappSyncService = new WhatsAppSyncService();
