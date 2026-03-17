// ============================================================
// SendGrid Email — Servicio principal
// ============================================================

import { supabase } from '@/lib/supabase/config';
import { SENDGRID_BASE_URL, SENDGRID_CREDENTIAL_PURPOSES } from './sendgridConfig';
import type {
  SendGridCredentials,
  SendGridMailRequest,
  SendGridSendResult,
  SendGridSimpleEmail,
  SendGridTemplate,
  SendGridTemplatesResponse,
  SendGridScopesResponse,
  SendGridStatResult,
  SendGridBounce,
} from './sendgridTypes';

class SendGridService {
  // ----------------------------------------------------------
  // Credenciales
  // ----------------------------------------------------------

  /**
   * Obtiene las credenciales de SendGrid para una conexión.
   * Lee de integration_credentials vinculadas al connection_id.
   */
  async getCredentials(connectionId: string): Promise<SendGridCredentials | null> {
    const { data: creds, error } = await supabase
      .from('integration_credentials')
      .select('purpose, secret_ref, status')
      .eq('connection_id', connectionId)
      .eq('status', 'active');

    if (error || !creds || creds.length === 0) {
      console.error('[SendGrid] Error obteniendo credenciales:', error);
      return null;
    }

    const findCred = (purpose: string) =>
      creds.find((c) => c.purpose === purpose)?.secret_ref || '';

    return {
      apiKey: findCred('api_key'),
      fromEmail: findCred('from_email'),
      fromName: findCred('from_name'),
    };
  }

  /**
   * Guarda las 3 credenciales de SendGrid para una conexión.
   */
  async saveCredentials(
    connectionId: string,
    credentials: {
      apiKey: string;
      fromEmail: string;
      fromName: string;
    }
  ): Promise<boolean> {
    const entries = [
      {
        ...SENDGRID_CREDENTIAL_PURPOSES.API_KEY,
        secret_ref: credentials.apiKey,
        key_prefix: credentials.apiKey.substring(0, 8) + '...',
      },
      {
        ...SENDGRID_CREDENTIAL_PURPOSES.FROM_EMAIL,
        secret_ref: credentials.fromEmail,
        key_prefix: credentials.fromEmail,
      },
      {
        ...SENDGRID_CREDENTIAL_PURPOSES.FROM_NAME,
        secret_ref: credentials.fromName,
        key_prefix: credentials.fromName,
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
      console.error('[SendGrid] Error guardando credenciales:', error);
      return false;
    }

    // Marcar conexión como connected
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

  // ----------------------------------------------------------
  // Envío de emails
  // ----------------------------------------------------------

  /**
   * Envía un email usando la API v3 de SendGrid (bajo nivel).
   * Retorna 202 Accepted si fue exitoso.
   */
  async sendMail(
    credentials: SendGridCredentials,
    mailRequest: SendGridMailRequest
  ): Promise<SendGridSendResult> {
    try {
      const response = await fetch(`${SENDGRID_BASE_URL}/mail/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${credentials.apiKey}`,
        },
        body: JSON.stringify(mailRequest),
      });

      if (response.status === 202) {
        const messageId = response.headers.get('X-Message-Id') || undefined;
        return { success: true, statusCode: 202, messageId };
      }

      const errorBody = await response.text();
      console.error('[SendGrid] Error enviando email:', response.status, errorBody);
      return {
        success: false,
        statusCode: response.status,
        error: errorBody,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de conexión';
      console.error('[SendGrid] Error en sendMail:', msg);
      return { success: false, statusCode: 0, error: msg };
    }
  }

  /**
   * Envía un email con interfaz simplificada.
   * Soporta texto plano, HTML y Dynamic Templates.
   */
  async sendSimpleEmail(
    credentials: SendGridCredentials,
    email: SendGridSimpleEmail
  ): Promise<SendGridSendResult> {
    const toArray = Array.isArray(email.to) ? email.to : [email.to];

    const mailRequest: SendGridMailRequest = {
      personalizations: [
        {
          to: toArray.map((addr) => ({ email: addr })),
          dynamic_template_data: email.templateData,
        },
      ],
      from: {
        email: credentials.fromEmail,
        name: credentials.fromName,
      },
      subject: email.subject,
      categories: email.categories,
    };

    // Template o contenido directo
    if (email.templateId) {
      mailRequest.template_id = email.templateId;
    } else {
      mailRequest.content = [];
      if (email.text) {
        mailRequest.content.push({ type: 'text/plain', value: email.text });
      }
      if (email.html) {
        mailRequest.content.push({ type: 'text/html', value: email.html });
      }
    }

    // Reply-to
    if (email.replyTo) {
      mailRequest.reply_to = { email: email.replyTo };
    }

    // Attachments
    if (email.attachments && email.attachments.length > 0) {
      mailRequest.attachments = email.attachments;
    }

    // Envío programado
    if (email.sendAt) {
      mailRequest.send_at = Math.floor(email.sendAt.getTime() / 1000);
    }

    return this.sendMail(credentials, mailRequest);
  }

  // ----------------------------------------------------------
  // Dynamic Templates
  // ----------------------------------------------------------

  /**
   * Lista los Dynamic Templates de la cuenta.
   */
  async getTemplates(
    credentials: SendGridCredentials,
    generations: 'legacy' | 'dynamic' = 'dynamic',
    pageSize: number = 20
  ): Promise<SendGridTemplate[]> {
    try {
      const params = new URLSearchParams({
        generations: generations,
        page_size: pageSize.toString(),
      });

      const response = await fetch(
        `${SENDGRID_BASE_URL}/templates?${params}`,
        {
          headers: { Authorization: `Bearer ${credentials.apiKey}` },
        }
      );

      if (!response.ok) {
        console.error('[SendGrid] Error obteniendo templates:', response.statusText);
        return [];
      }

      const data: SendGridTemplatesResponse = await response.json();
      return data.result || [];
    } catch (err) {
      console.error('[SendGrid] Error en getTemplates:', err);
      return [];
    }
  }

  // ----------------------------------------------------------
  // Verificación de API Key (Scopes)
  // ----------------------------------------------------------

  /**
   * Verifica la API Key consultando los scopes disponibles.
   * Retorna la lista de scopes si la key es válida.
   */
  async verifyApiKey(apiKey: string): Promise<{
    valid: boolean;
    scopes: string[];
    hasMailSend: boolean;
  }> {
    try {
      const response = await fetch(`${SENDGRID_BASE_URL}/scopes`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!response.ok) {
        return { valid: false, scopes: [], hasMailSend: false };
      }

      const data: SendGridScopesResponse = await response.json();
      const scopes = data.scopes || [];
      const hasMailSend = scopes.some((s) => s.includes('mail'));

      return { valid: true, scopes, hasMailSend };
    } catch {
      return { valid: false, scopes: [], hasMailSend: false };
    }
  }

  // ----------------------------------------------------------
  // Stats
  // ----------------------------------------------------------

  /**
   * Obtiene estadísticas globales de envío por rango de fechas.
   * Formato de fecha: YYYY-MM-DD
   */
  async getStats(
    credentials: SendGridCredentials,
    startDate: string,
    endDate?: string
  ): Promise<SendGridStatResult[]> {
    try {
      const params = new URLSearchParams({ start_date: startDate });
      if (endDate) params.set('end_date', endDate);

      const response = await fetch(
        `${SENDGRID_BASE_URL}/stats?${params}`,
        {
          headers: { Authorization: `Bearer ${credentials.apiKey}` },
        }
      );

      if (!response.ok) {
        console.error('[SendGrid] Error obteniendo stats:', response.statusText);
        return [];
      }

      return await response.json();
    } catch (err) {
      console.error('[SendGrid] Error en getStats:', err);
      return [];
    }
  }

  // ----------------------------------------------------------
  // Bounces
  // ----------------------------------------------------------

  /**
   * Obtiene la lista de bounces (emails rebotados).
   */
  async getBounces(
    credentials: SendGridCredentials,
    limit: number = 50
  ): Promise<SendGridBounce[]> {
    try {
      const response = await fetch(
        `${SENDGRID_BASE_URL}/suppression/bounces?limit=${limit}`,
        {
          headers: { Authorization: `Bearer ${credentials.apiKey}` },
        }
      );

      if (!response.ok) {
        console.error('[SendGrid] Error obteniendo bounces:', response.statusText);
        return [];
      }

      return await response.json();
    } catch (err) {
      console.error('[SendGrid] Error en getBounces:', err);
      return [];
    }
  }

  // ----------------------------------------------------------
  // Health check
  // ----------------------------------------------------------

  /**
   * Verifica que las credenciales de SendGrid sean válidas
   * consultando el endpoint de scopes.
   */
  async healthCheck(connectionId: string): Promise<{
    ok: boolean;
    message: string;
    scopes?: string[];
  }> {
    const credentials = await this.getCredentials(connectionId);
    if (!credentials) {
      return { ok: false, message: 'No se encontraron credenciales' };
    }

    if (!credentials.apiKey) {
      return { ok: false, message: 'API Key no configurada' };
    }

    try {
      const verification = await this.verifyApiKey(credentials.apiKey);

      if (!verification.valid) {
        await supabase
          .from('integration_connections')
          .update({
            last_health_check_at: new Date().toISOString(),
            last_error_at: new Date().toISOString(),
            last_error_message: 'API Key inválida o expirada',
            status: 'error',
            updated_at: new Date().toISOString(),
          })
          .eq('id', connectionId);

        return { ok: false, message: 'API Key inválida o expirada' };
      }

      // Actualizar health check exitoso
      await supabase
        .from('integration_connections')
        .update({
          last_health_check_at: new Date().toISOString(),
          last_error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connectionId);

      const mailStatus = verification.hasMailSend ? 'Mail Send ✓' : '⚠️ Sin Mail Send';
      return {
        ok: true,
        message: `Conexión verificada: ${verification.scopes.length} permisos (${mailStatus})`,
        scopes: verification.scopes,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error de conexión';

      await supabase
        .from('integration_connections')
        .update({
          last_health_check_at: new Date().toISOString(),
          last_error_at: new Date().toISOString(),
          last_error_message: errorMsg,
          status: 'error',
          updated_at: new Date().toISOString(),
        })
        .eq('id', connectionId);

      return { ok: false, message: errorMsg };
    }
  }

  // ----------------------------------------------------------
  // Verificación de webhook (ECDSA)
  // ----------------------------------------------------------

  /**
   * Verifica la firma ECDSA del webhook de SendGrid.
   * Usa la clave pública SENDGRID_WEBHOOK_VERIFICATION_KEY (env).
   * @param signature - Header X-Twilio-Email-Event-Webhook-Signature (base64)
   * @param timestamp - Header X-Twilio-Email-Event-Webhook-Timestamp
   * @param rawBody   - Body crudo del request (string)
   */
  verifyWebhookSignature(
    signature: string,
    timestamp: string,
    rawBody: string
  ): boolean {
    const publicKey = process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;
    if (!publicKey) {
      console.warn('[SendGrid] SENDGRID_WEBHOOK_VERIFICATION_KEY no configurada, omitiendo verificación');
      return true; // Sin clave configurada, no se puede verificar
    }

    try {
      const crypto = require('crypto');
      const payload = timestamp + rawBody;

      // La clave pública de SendGrid viene en formato PEM o base64 EC
      const ecKey = publicKey.includes('BEGIN')
        ? publicKey
        : `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`;

      const verifier = crypto.createVerify('sha256');
      verifier.update(payload);
      verifier.end();

      return verifier.verify(ecKey, signature, 'base64');
    } catch (err) {
      console.error('[SendGrid] Error verificando firma ECDSA:', err);
      return false;
    }
  }

  // ----------------------------------------------------------
  // Utilidades
  // ----------------------------------------------------------

  /**
   * Obtiene las credenciales de SendGrid a partir de una organización.
   * Busca la conexión activa del conector sendgrid_email.
   */
  async getCredentialsByOrganization(organizationId: number): Promise<{
    credentials: SendGridCredentials | null;
    connectionId: string | null;
  }> {
    const { data: connection, error } = await supabase
      .from('integration_connections')
      .select(`
        id,
        connector:integration_connectors!inner(code)
      `)
      .eq('organization_id', organizationId)
      .eq('integration_connectors.code', 'sendgrid_email')
      .eq('status', 'connected')
      .maybeSingle();

    if (error || !connection) {
      return { credentials: null, connectionId: null };
    }

    const credentials = await this.getCredentials(connection.id);
    return { credentials, connectionId: connection.id };
  }
}

export const sendgridService = new SendGridService();
export default sendgridService;
