// ============================================================
// Servicio cliente WhatsApp Business para el wizard de integraciones
// Guarda credenciales en integration_credentials (misma tabla que Wompi, Stripe, etc.)
// ============================================================

import { supabase } from '@/lib/supabase/config';

const WHATSAPP_CREDENTIAL_PURPOSES = {
  PHONE_NUMBER_ID: {
    credential_type: 'phone_number_id',
    purpose: 'primary',
  },
  BUSINESS_ACCOUNT_ID: {
    credential_type: 'business_account_id',
    purpose: 'primary',
  },
  ACCESS_TOKEN: {
    credential_type: 'access_token',
    purpose: 'primary',
  },
  WEBHOOK_VERIFY_TOKEN: {
    credential_type: 'webhook_verify_token',
    purpose: 'primary',
  },
} as const;

class WhatsAppClientService {
  /**
   * Guarda las 4 credenciales de WhatsApp para una conexión.
   */
  async saveCredentials(
    connectionId: string,
    credentials: {
      phoneNumberId: string;
      businessAccountId: string;
      accessToken: string;
      webhookVerifyToken: string;
    }
  ): Promise<boolean> {
    const entries = [
      {
        ...WHATSAPP_CREDENTIAL_PURPOSES.PHONE_NUMBER_ID,
        secret_ref: credentials.phoneNumberId,
        key_prefix: credentials.phoneNumberId.substring(0, 8) + '...',
      },
      {
        ...WHATSAPP_CREDENTIAL_PURPOSES.BUSINESS_ACCOUNT_ID,
        secret_ref: credentials.businessAccountId,
        key_prefix: credentials.businessAccountId.substring(0, 8) + '...',
      },
      {
        ...WHATSAPP_CREDENTIAL_PURPOSES.ACCESS_TOKEN,
        secret_ref: credentials.accessToken,
        key_prefix: credentials.accessToken.substring(0, 12) + '...',
      },
      {
        ...WHATSAPP_CREDENTIAL_PURPOSES.WEBHOOK_VERIFY_TOKEN,
        secret_ref: credentials.webhookVerifyToken,
        key_prefix: credentials.webhookVerifyToken.substring(0, 10) + '...',
      },
    ];

    // Eliminar credenciales previas de esta conexión
    await supabase
      .from('integration_credentials')
      .delete()
      .eq('connection_id', connectionId);

    const { error } = await supabase.from('integration_credentials').insert(
      entries.map((entry) => ({
        connection_id: connectionId,
        credential_type: entry.credential_type,
        purpose: entry.purpose,
        secret_ref: entry.secret_ref,
        key_prefix: entry.key_prefix,
        status: 'active',
      }))
    );

    if (error) {
      console.error('Error guardando credenciales WhatsApp:', error);
      return false;
    }

    // Actualizar estado de la conexión a 'connected'
    await supabase
      .from('integration_connections')
      .update({
        status: 'connected',
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId);

    return true;
  }

  // `getCredentials` se retiró (Frente INT, 2026-11-07): leía `secret_ref` con el cliente del
  // navegador y ninguna pantalla ni ruta lo usaba. Las credenciales se leen en el servidor.
}

export const whatsappClientService = new WhatsAppClientService();
