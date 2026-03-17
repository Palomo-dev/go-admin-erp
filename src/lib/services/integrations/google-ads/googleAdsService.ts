// ============================================================
// Servicio de Google Ads API para GO Admin ERP
// ============================================================

import { createClient } from '@supabase/supabase-js';
import {
  getGoogleAdsApiUrl,
  GOOGLE_TOKEN_URL,
  GOOGLE_ADS_CREDENTIAL_PURPOSES,
  GOOGLE_ADS_CONNECTOR_CODE,
} from './googleAdsConfig';
import type {
  GoogleAdsCredentials,
  GoogleOAuthTokenResponse,
  GoogleAdsHealthCheckResult,
  GoogleAdsCustomerInfo,
  GoogleAdsOAuthState,
  GoogleAdsOfflineConversion,
  GoogleAdsUploadConversionResult,
  GoogleAdsConversionAction,
  GoogleAdsCampaignMetrics,
  GoogleAdsQueryResult,
} from './googleAdsTypes';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

class GoogleAdsService {
  // ──────────────────────────────────────────────
  // Credenciales
  // ──────────────────────────────────────────────

  /** Obtener credenciales de Google Ads para una conexión */
  async getCredentials(connectionId: string): Promise<GoogleAdsCredentials | null> {
    const { data, error } = await supabase
      .from('integration_credentials')
      .select('purpose, secret_ref')
      .eq('connection_id', connectionId);

    if (error || !data || data.length === 0) return null;

    const creds: GoogleAdsCredentials = {
      refreshToken: '',
      customerId: '',
    };

    for (const row of data) {
      switch (row.purpose) {
        case GOOGLE_ADS_CREDENTIAL_PURPOSES.REFRESH_TOKEN:
          creds.refreshToken = row.secret_ref || '';
          break;
        case GOOGLE_ADS_CREDENTIAL_PURPOSES.CUSTOMER_ID:
          creds.customerId = row.secret_ref || '';
          break;
        case GOOGLE_ADS_CREDENTIAL_PURPOSES.CONVERSION_ACTION_ID:
          creds.conversionActionId = row.secret_ref || '';
          break;
        case GOOGLE_ADS_CREDENTIAL_PURPOSES.CONVERSION_ID:
          creds.conversionId = row.secret_ref || '';
          break;
        case GOOGLE_ADS_CREDENTIAL_PURPOSES.CONVERSION_LABEL:
          creds.conversionLabel = row.secret_ref || '';
          break;
      }
    }

    return creds;
  }

  /** Guardar credenciales de Google Ads para una conexión */
  async saveCredentials(
    connectionId: string,
    credentials: Partial<GoogleAdsCredentials>
  ): Promise<void> {
    const purposeMap: Record<string, string | undefined> = {
      [GOOGLE_ADS_CREDENTIAL_PURPOSES.REFRESH_TOKEN]: credentials.refreshToken,
      [GOOGLE_ADS_CREDENTIAL_PURPOSES.CUSTOMER_ID]: credentials.customerId,
      [GOOGLE_ADS_CREDENTIAL_PURPOSES.CONVERSION_ACTION_ID]: credentials.conversionActionId,
      [GOOGLE_ADS_CREDENTIAL_PURPOSES.CONVERSION_ID]: credentials.conversionId,
      [GOOGLE_ADS_CREDENTIAL_PURPOSES.CONVERSION_LABEL]: credentials.conversionLabel,
    };

    for (const [purpose, value] of Object.entries(purposeMap)) {
      if (value === undefined) continue;

      // Upsert: si ya existe actualizar, si no crear
      const { data: existing } = await supabase
        .from('integration_credentials')
        .select('id')
        .eq('connection_id', connectionId)
        .eq('purpose', purpose)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('integration_credentials')
          .update({ secret_ref: value, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('integration_credentials')
          .insert({
            connection_id: connectionId,
            credential_type: 'oauth2',
            purpose,
            secret_ref: value,
          });
      }
    }
  }

  // ──────────────────────────────────────────────
  // OAuth 2.0 – Flujo de autenticación
  // ──────────────────────────────────────────────

  /** Intercambiar authorization code por access_token + refresh_token */
  async exchangeCodeForTokens(code: string): Promise<GoogleOAuthTokenResponse> {
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google-ads/oauth/callback`;

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId || '',
        client_secret: clientSecret || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Error al obtener tokens: ${err.error_description || err.error || response.statusText}`);
    }

    return response.json();
  }

  /** Renovar access_token usando refresh_token */
  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId || '',
        client_secret: clientSecret || '',
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Error al renovar token: ${err.error_description || err.error || response.statusText}`);
    }

    const data = await response.json();
    return { accessToken: data.access_token, expiresIn: data.expires_in || 3600 };
  }

  // ──────────────────────────────────────────────
  // API Calls – Google Ads
  // ──────────────────────────────────────────────

  /** Headers estándar para cada API call */
  private getHeaders(accessToken: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
    };

    // login-customer-id solo si hay MCC configurado
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
    if (loginCustomerId) {
      headers['login-customer-id'] = loginCustomerId.replace(/-/g, '');
    }

    return headers;
  }

  /** Listar cuentas accesibles del usuario autenticado */
  async listAccessibleCustomers(accessToken: string): Promise<string[]> {
    const apiUrl = getGoogleAdsApiUrl();
    const response = await fetch(
      `${apiUrl}/customers:listAccessibleCustomers`,
      { headers: this.getHeaders(accessToken) }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Error listando cuentas: ${err.error?.message || response.statusText}`);
    }

    const data = await response.json();
    // resourceNames viene como ["customers/1234567890", ...]
    return (data.resourceNames || []).map((rn: string) => rn.replace('customers/', ''));
  }

  /** Obtener info de una cuenta de Google Ads */
  async getCustomerInfo(accessToken: string, customerId: string): Promise<GoogleAdsCustomerInfo | null> {
    const apiUrl = getGoogleAdsApiUrl();
    const cleanId = customerId.replace(/-/g, '');

    const response = await fetch(
      `${apiUrl}/customers/${cleanId}/googleAds:searchStream`,
      {
        method: 'POST',
        headers: this.getHeaders(accessToken),
        body: JSON.stringify({
          query: `SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1`,
        }),
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const results = data?.[0]?.results;
    if (!results || results.length === 0) return null;

    const c = results[0].customer;
    return {
      id: c.id,
      descriptiveName: c.descriptiveName || '',
      currencyCode: c.currencyCode || 'USD',
      timeZone: c.timeZone || '',
      manager: c.manager || false,
    };
  }

  /**
   * Flujo OAuth completo:
   * code → tokens → listAccessibleCustomers → info de cada cuenta
   */
  async completeOAuthFlow(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    customers: Array<{ id: string; name: string; currency: string; isManager: boolean }>;
  }> {
    // 1. Code → tokens
    const tokens = await this.exchangeCodeForTokens(code);

    if (!tokens.refresh_token) {
      throw new Error('No se recibió refresh_token. Asegúrate de que el flujo use access_type=offline y prompt=consent.');
    }

    // 2. Listar cuentas accesibles
    const customerIds = await this.listAccessibleCustomers(tokens.access_token);

    if (customerIds.length === 0) {
      throw new Error('No se encontraron cuentas de Google Ads accesibles para este usuario.');
    }

    // 3. Obtener info de cada cuenta (máx 10 para no saturar)
    const customers: Array<{ id: string; name: string; currency: string; isManager: boolean }> = [];
    const idsToCheck = customerIds.slice(0, 10);

    for (const cid of idsToCheck) {
      const info = await this.getCustomerInfo(tokens.access_token, cid);
      if (info) {
        customers.push({
          id: info.id,
          name: info.descriptiveName || `Cuenta ${cid}`,
          currency: info.currencyCode,
          isManager: info.manager,
        });
      }
    }

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      customers,
    };
  }

  // ──────────────────────────────────────────────
  // Health Check
  // ──────────────────────────────────────────────

  /** Verificar que las credenciales son válidas */
  async healthCheck(connectionId: string): Promise<GoogleAdsHealthCheckResult> {
    try {
      const creds = await this.getCredentials(connectionId);
      if (!creds || !creds.refreshToken) {
        return { valid: false, message: 'No se encontraron credenciales de Google Ads.' };
      }

      const { accessToken } = await this.refreshAccessToken(creds.refreshToken);
      const customerIds = await this.listAccessibleCustomers(accessToken);

      return {
        valid: true,
        message: `Conexión válida. ${customerIds.length} cuenta(s) accesibles.`,
        customerIds,
      };
    } catch (err) {
      return {
        valid: false,
        message: err instanceof Error ? err.message : 'Error al verificar conexión con Google Ads.',
      };
    }
  }

  // ──────────────────────────────────────────────
  // Conversiones
  // ──────────────────────────────────────────────

  /** Crear una acción de conversión en la cuenta */
  async createConversionAction(
    accessToken: string,
    customerId: string,
    name: string,
    category: string
  ): Promise<GoogleAdsConversionAction | null> {
    const apiUrl = getGoogleAdsApiUrl();
    const cleanId = customerId.replace(/-/g, '');

    const response = await fetch(
      `${apiUrl}/customers/${cleanId}/conversionActions:mutate`,
      {
        method: 'POST',
        headers: this.getHeaders(accessToken),
        body: JSON.stringify({
          operations: [
            {
              create: {
                name,
                category,
                type: 'UPLOAD_CLICKS',
                status: 'ENABLED',
                valueSettings: {
                  defaultValue: 0,
                  alwaysUseDefaultValue: false,
                },
              },
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('[GoogleAds] Error creando conversionAction:', err);
      return null;
    }

    const data = await response.json();
    const result = data.results?.[0];
    if (!result) return null;

    // Extraer ID del resourceName (customers/123/conversionActions/456)
    const resourceName = result.resourceName || '';
    const actionId = resourceName.split('/').pop() || '';

    return {
      resourceName,
      id: actionId,
      name,
      category,
      type: 'UPLOAD_CLICKS',
      status: 'ENABLED',
    };
  }

  /** Subir conversiones offline (gclid o Enhanced Conversions) */
  async uploadOfflineConversions(
    accessToken: string,
    customerId: string,
    conversions: GoogleAdsOfflineConversion[]
  ): Promise<GoogleAdsUploadConversionResult> {
    const apiUrl = getGoogleAdsApiUrl();
    const cleanId = customerId.replace(/-/g, '');

    const response = await fetch(
      `${apiUrl}/customers/${cleanId}/offlineUserDataJobs:uploadClickConversions`,
      {
        method: 'POST',
        headers: this.getHeaders(accessToken),
        body: JSON.stringify({
          customerId: cleanId,
          conversions: conversions.map((c) => ({
            conversionAction: `customers/${cleanId}/conversionActions/${c.conversionAction}`,
            conversionDateTime: c.conversionDateTime,
            conversionValue: c.conversionValue,
            currencyCode: c.currencyCode,
            ...(c.gclid ? { gclid: c.gclid } : {}),
            ...(c.orderId ? { orderId: c.orderId } : {}),
            ...(c.userIdentifiers
              ? {
                  userIdentifiers: c.userIdentifiers.map((u) => ({
                    ...(u.hashedEmail ? { hashedEmail: u.hashedEmail } : {}),
                    ...(u.hashedPhoneNumber ? { hashedPhoneNumber: u.hashedPhoneNumber } : {}),
                  })),
                }
              : {}),
          })),
          partialFailure: true,
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(
        `Error subiendo conversiones: ${err.error?.message || response.statusText}`
      );
    }

    return response.json();
  }

  /** Subir una única conversión offline para una conexión */
  async uploadSingleConversion(
    connectionId: string,
    conversion: Omit<GoogleAdsOfflineConversion, 'conversionAction'>
  ): Promise<GoogleAdsUploadConversionResult> {
    const creds = await this.getCredentials(connectionId);
    if (!creds?.refreshToken || !creds.customerId) {
      throw new Error('Credenciales de Google Ads incompletas.');
    }
    if (!creds.conversionActionId) {
      throw new Error('No hay conversionActionId configurado.');
    }

    const { accessToken } = await this.refreshAccessToken(creds.refreshToken);

    return this.uploadOfflineConversions(accessToken, creds.customerId, [
      { ...conversion, conversionAction: creds.conversionActionId },
    ]);
  }

  // ──────────────────────────────────────────────
  // GAQL Queries – Reporting
  // ──────────────────────────────────────────────

  /** Ejecutar un query GAQL genérico */
  async executeGaqlQuery(
    accessToken: string,
    customerId: string,
    query: string
  ): Promise<GoogleAdsQueryResult> {
    const apiUrl = getGoogleAdsApiUrl();
    const cleanId = customerId.replace(/-/g, '');

    const response = await fetch(
      `${apiUrl}/customers/${cleanId}/googleAds:searchStream`,
      {
        method: 'POST',
        headers: this.getHeaders(accessToken),
        body: JSON.stringify({ query }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Error en GAQL query: ${err.error?.message || response.statusText}`);
    }

    const data = await response.json();
    // searchStream retorna un array de batches
    const batch = data?.[0] || {};
    return {
      results: batch.results || [],
      fieldMask: batch.fieldMask || '',
      requestId: batch.requestId || '',
    };
  }

  /** Obtener métricas de campañas para un período */
  async getCampaignMetrics(
    connectionId: string,
    dateFrom: string,
    dateTo: string
  ): Promise<GoogleAdsCampaignMetrics[]> {
    const creds = await this.getCredentials(connectionId);
    if (!creds?.refreshToken || !creds.customerId) {
      throw new Error('Credenciales de Google Ads incompletas.');
    }

    const { accessToken } = await this.refreshAccessToken(creds.refreshToken);

    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value,
        metrics.ctr,
        metrics.average_cpc
      FROM campaign
      WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
        AND campaign.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC
    `;

    const result = await this.executeGaqlQuery(accessToken, creds.customerId, query);

    return result.results.map((row: Record<string, any>) => ({
      campaignId: row.campaign?.id?.toString() || '',
      campaignName: row.campaign?.name || '',
      status: row.campaign?.status || '',
      impressions: Number(row.metrics?.impressions || 0),
      clicks: Number(row.metrics?.clicks || 0),
      costMicros: Number(row.metrics?.costMicros || 0),
      conversions: Number(row.metrics?.conversions || 0),
      conversionsValue: Number(row.metrics?.conversionsValue || 0),
      ctr: Number(row.metrics?.ctr || 0),
      averageCpc: Number(row.metrics?.averageCpc || 0),
    }));
  }

  /** Obtener acciones de conversión configuradas */
  async getConversionActions(connectionId: string): Promise<GoogleAdsConversionAction[]> {
    const creds = await this.getCredentials(connectionId);
    if (!creds?.refreshToken || !creds.customerId) {
      throw new Error('Credenciales de Google Ads incompletas.');
    }

    const { accessToken } = await this.refreshAccessToken(creds.refreshToken);

    const query = `
      SELECT
        conversion_action.resource_name,
        conversion_action.id,
        conversion_action.name,
        conversion_action.category,
        conversion_action.type,
        conversion_action.status
      FROM conversion_action
      WHERE conversion_action.status = 'ENABLED'
    `;

    const result = await this.executeGaqlQuery(accessToken, creds.customerId, query);

    return result.results.map((row: Record<string, any>) => ({
      resourceName: row.conversionAction?.resourceName || '',
      id: row.conversionAction?.id?.toString() || '',
      name: row.conversionAction?.name || '',
      category: row.conversionAction?.category || '',
      type: row.conversionAction?.type || '',
      status: row.conversionAction?.status || '',
    }));
  }

  // ──────────────────────────────────────────────
  // Customer Match – Audiencias
  // ──────────────────────────────────────────────

  /** Crear una User List para Customer Match */
  async createCustomerMatchUserList(
    accessToken: string,
    customerId: string,
    listName: string,
    description: string
  ): Promise<string | null> {
    const apiUrl = getGoogleAdsApiUrl();
    const cleanId = customerId.replace(/-/g, '');

    const response = await fetch(
      `${apiUrl}/customers/${cleanId}/userLists:mutate`,
      {
        method: 'POST',
        headers: this.getHeaders(accessToken),
        body: JSON.stringify({
          operations: [
            {
              create: {
                name: listName,
                description,
                membershipStatus: 'OPEN',
                crmBasedUserList: {
                  uploadKeyType: 'CONTACT_INFO',
                  dataSourceType: 'FIRST_PARTY',
                },
                membershipLifeSpan: 10000, // ~27 años (máximo)
              },
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('[GoogleAds] Error creando userList:', err);
      return null;
    }

    const data = await response.json();
    return data.results?.[0]?.resourceName || null;
  }

  /** Subir miembros a una User List (Customer Match) */
  async uploadCustomerMatchMembers(
    accessToken: string,
    customerId: string,
    userListResourceName: string,
    members: Array<{ hashedEmail?: string; hashedPhoneNumber?: string }>
  ): Promise<{ success: boolean; error?: string }> {
    const apiUrl = getGoogleAdsApiUrl();
    const cleanId = customerId.replace(/-/g, '');

    // 1. Crear offlineUserDataJob
    const createJobResponse = await fetch(
      `${apiUrl}/customers/${cleanId}/offlineUserDataJobs:create`,
      {
        method: 'POST',
        headers: this.getHeaders(accessToken),
        body: JSON.stringify({
          job: {
            type: 'CUSTOMER_MATCH_USER_LIST',
            customerMatchUserListMetadata: {
              userList: userListResourceName,
            },
          },
        }),
      }
    );

    if (!createJobResponse.ok) {
      const err = await createJobResponse.json().catch(() => ({}));
      return { success: false, error: err.error?.message || 'Error creando job' };
    }

    const jobData = await createJobResponse.json();
    const jobResourceName = jobData.resourceName;

    // 2. Agregar operaciones (miembros)
    const operations = members.map((m) => ({
      create: {
        userIdentifiers: [
          ...(m.hashedEmail ? [{ hashedEmail: m.hashedEmail }] : []),
          ...(m.hashedPhoneNumber ? [{ hashedPhoneNumber: m.hashedPhoneNumber }] : []),
        ],
      },
    }));

    const addResponse = await fetch(
      `${apiUrl}/${jobResourceName}:addOperations`,
      {
        method: 'POST',
        headers: this.getHeaders(accessToken),
        body: JSON.stringify({
          operations,
          enablePartialFailure: true,
        }),
      }
    );

    if (!addResponse.ok) {
      const err = await addResponse.json().catch(() => ({}));
      return { success: false, error: err.error?.message || 'Error agregando miembros' };
    }

    // 3. Ejecutar el job
    const runResponse = await fetch(
      `${apiUrl}/${jobResourceName}:run`,
      {
        method: 'POST',
        headers: this.getHeaders(accessToken),
      }
    );

    if (!runResponse.ok) {
      const err = await runResponse.json().catch(() => ({}));
      return { success: false, error: err.error?.message || 'Error ejecutando job' };
    }

    return { success: true };
  }

  /** Flujo completo: crear lista + subir miembros desde una conexión */
  async uploadAudience(
    connectionId: string,
    listName: string,
    description: string,
    members: Array<{ hashedEmail?: string; hashedPhoneNumber?: string }>
  ): Promise<{ success: boolean; userListResourceName?: string; error?: string }> {
    const creds = await this.getCredentials(connectionId);
    if (!creds?.refreshToken || !creds.customerId) {
      return { success: false, error: 'Credenciales de Google Ads incompletas.' };
    }

    const { accessToken } = await this.refreshAccessToken(creds.refreshToken);

    // Crear lista
    const userListResourceName = await this.createCustomerMatchUserList(
      accessToken,
      creds.customerId,
      listName,
      description
    );

    if (!userListResourceName) {
      return { success: false, error: 'No se pudo crear la lista de audiencia.' };
    }

    // Subir miembros
    const uploadResult = await this.uploadCustomerMatchMembers(
      accessToken,
      creds.customerId,
      userListResourceName,
      members
    );

    if (!uploadResult.success) {
      return { success: false, userListResourceName, error: uploadResult.error };
    }

    return { success: true, userListResourceName };
  }

  // ──────────────────────────────────────────────
  // Helper: Obtener connector ID
  // ──────────────────────────────────────────────

  /** Obtener el ID del connector google_ads */
  async getConnectorId(): Promise<string | null> {
    const { data } = await supabase
      .from('integration_connectors')
      .select('id')
      .eq('code', GOOGLE_ADS_CONNECTOR_CODE)
      .single();

    return data?.id || null;
  }
}

export const googleAdsService = new GoogleAdsService();
