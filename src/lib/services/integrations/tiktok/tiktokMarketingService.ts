// ============================================================
// Servicio TikTok Marketing para CLIENTES de GO Admin ERP
// Catálogo de productos, Pixel, Events API
// ============================================================

import { supabase } from '@/lib/supabase/config';
import crypto from 'crypto';
import {
  TIKTOK_CREDENTIAL_PURPOSES,
  getTikTokApiUrl,
  getTikTokOAuthRedirectUri,
  mapTikTokAvailability,
  formatTikTokPrice,
} from './tiktokMarketingConfig';
import type {
  TikTokMarketingCredentials,
  TikTokHealthCheckResult,
  TikTokSetupResult,
  TikTokCreatePixelResult,
  TikTokCreateCatalogResult,
  TikTokProductData,
  TikTokCatalogSyncResult,
  TikTokEventData,
  TikTokEventResult,
  TikTokApiResponse,
  GOAdminProduct,
} from './tiktokMarketingTypes';

class TikTokMarketingService {
  // ──────────────────────────────────────────────
  // Credenciales
  // ──────────────────────────────────────────────

  /** Obtener credenciales de TikTok Marketing para una conexión */
  async getCredentials(connectionId: string): Promise<TikTokMarketingCredentials | null> {
    const { data, error } = await supabase
      .from('integration_credentials')
      .select('purpose, secret_ref')
      .eq('connection_id', connectionId);

    if (error || !data || data.length === 0) return null;

    const creds: TikTokMarketingCredentials = {
      accessToken: '',
      appSecret: '',
      advertiserId: '',
      pixelCode: '',
      catalogId: '',
    };

    for (const row of data) {
      switch (row.purpose) {
        case TIKTOK_CREDENTIAL_PURPOSES.ACCESS_TOKEN:
          creds.accessToken = row.secret_ref || '';
          break;
        case TIKTOK_CREDENTIAL_PURPOSES.APP_SECRET:
          creds.appSecret = row.secret_ref || '';
          break;
        case TIKTOK_CREDENTIAL_PURPOSES.ADVERTISER_ID:
          creds.advertiserId = row.secret_ref || '';
          break;
        case TIKTOK_CREDENTIAL_PURPOSES.PIXEL_CODE:
          creds.pixelCode = row.secret_ref || '';
          break;
        case TIKTOK_CREDENTIAL_PURPOSES.CATALOG_ID:
          creds.catalogId = row.secret_ref || '';
          break;
      }
    }

    return creds;
  }

  /** Guardar credenciales de TikTok Marketing para una conexión */
  async saveCredentials(
    connectionId: string,
    credentials: TikTokMarketingCredentials
  ): Promise<boolean> {
    const entries = [
      { purpose: TIKTOK_CREDENTIAL_PURPOSES.ACCESS_TOKEN, value: credentials.accessToken },
      { purpose: TIKTOK_CREDENTIAL_PURPOSES.APP_SECRET, value: credentials.appSecret },
      { purpose: TIKTOK_CREDENTIAL_PURPOSES.ADVERTISER_ID, value: credentials.advertiserId },
      { purpose: TIKTOK_CREDENTIAL_PURPOSES.PIXEL_CODE, value: credentials.pixelCode },
      { purpose: TIKTOK_CREDENTIAL_PURPOSES.CATALOG_ID, value: credentials.catalogId },
    ];

    for (const entry of entries) {
      if (!entry.value) continue;

      const { data: existing } = await supabase
        .from('integration_credentials')
        .select('id')
        .eq('connection_id', connectionId)
        .eq('purpose', entry.purpose)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('integration_credentials')
          .update({
            secret_ref: entry.value,
            credential_type: 'oauth2',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) {
          console.error(`Error updating TikTok credential ${entry.purpose}:`, error);
          return false;
        }
      } else {
        const { error } = await supabase
          .from('integration_credentials')
          .insert({
            connection_id: connectionId,
            credential_type: 'oauth2',
            purpose: entry.purpose,
            secret_ref: entry.value,
          });

        if (error) {
          console.error(`Error inserting TikTok credential ${entry.purpose}:`, error);
          return false;
        }
      }
    }

    return true;
  }

  // ──────────────────────────────────────────────
  // Helper: llamadas a la API de TikTok
  // ──────────────────────────────────────────────

  /** Hacer request GET a TikTok API */
  private async apiGet<T>(
    path: string,
    accessToken: string,
    params?: Record<string, string>
  ): Promise<TikTokApiResponse<T>> {
    const apiUrl = getTikTokApiUrl();
    const url = new URL(`${apiUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const response = await fetch(url.toString(), {
      headers: { 'Access-Token': accessToken },
    });

    return response.json();
  }

  /** Hacer request POST a TikTok API */
  private async apiPost<T>(
    path: string,
    accessToken: string,
    body: Record<string, unknown>
  ): Promise<TikTokApiResponse<T>> {
    const apiUrl = getTikTokApiUrl();

    const response = await fetch(`${apiUrl}${path}`, {
      method: 'POST',
      headers: {
        'Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    return response.json();
  }

  // ──────────────────────────────────────────────
  // Health Check – Verificar Token
  // ──────────────────────────────────────────────

  /** Verificar que el access_token es válido consultando info del advertiser */
  async healthCheck(accessToken: string, advertiserId: string): Promise<TikTokHealthCheckResult> {
    try {
      const result = await this.apiGet<{
        list: Array<{ advertiser_id: string; advertiser_name: string }>;
      }>('/advertiser/info/', accessToken, {
        advertiser_ids: JSON.stringify([advertiserId]),
      });

      if (result.code !== 0) {
        return {
          valid: false,
          message: `Error ${result.code}: ${result.message}`,
        };
      }

      const advertiser = result.data?.list?.[0];
      if (!advertiser) {
        return {
          valid: false,
          message: 'Advertiser no encontrado. Verifica el advertiser_id.',
        };
      }

      return {
        valid: true,
        message: `Token válido. Cuenta: ${advertiser.advertiser_name}`,
        advertiserName: advertiser.advertiser_name,
        advertiserId: advertiser.advertiser_id,
      };
    } catch (err) {
      return {
        valid: false,
        message: err instanceof Error ? err.message : 'Error al verificar token',
      };
    }
  }

  // ──────────────────────────────────────────────
  // Creación automática de Pixel y Catálogo
  // ──────────────────────────────────────────────

  /** Listar pixels existentes del advertiser */
  async listPixels(accessToken: string, advertiserId: string): Promise<TikTokCreatePixelResult[]> {
    const result = await this.apiGet<{
      pixels: Array<{ pixel_code: string; pixel_name: string; status: string }>;
    }>('/pixel/list/', accessToken, { advertiser_id: advertiserId });

    if (result.code !== 0 || !result.data?.pixels) return [];

    return result.data.pixels.map((p) => ({
      pixelCode: p.pixel_code,
      pixelName: p.pixel_name,
    }));
  }

  /** Crear pixel en la cuenta del advertiser */
  async createPixel(
    accessToken: string,
    advertiserId: string,
    pixelName: string
  ): Promise<TikTokCreatePixelResult> {
    const result = await this.apiPost<{ pixel_code: string }>('/pixel/create/', accessToken, {
      advertiser_id: advertiserId,
      pixel_name: pixelName,
    });

    if (result.code !== 0) {
      throw new Error(`Error creando pixel TikTok: ${result.message}`);
    }

    return {
      pixelCode: result.data!.pixel_code,
      pixelName: pixelName,
    };
  }

  /** Listar catálogos existentes */
  async listCatalogs(
    accessToken: string,
    advertiserId: string
  ): Promise<TikTokCreateCatalogResult[]> {
    const result = await this.apiGet<{
      catalogs: Array<{ catalog_id: string; catalog_name: string }>;
    }>('/catalog/list/', accessToken, { advertiser_id: advertiserId });

    if (result.code !== 0 || !result.data?.catalogs) return [];

    return result.data.catalogs.map((c) => ({
      catalogId: c.catalog_id,
      catalogName: c.catalog_name,
    }));
  }

  /** Crear catálogo */
  async createCatalog(
    accessToken: string,
    advertiserId: string,
    catalogName: string
  ): Promise<TikTokCreateCatalogResult> {
    const result = await this.apiPost<{ catalog_id: string }>('/catalog/create/', accessToken, {
      advertiser_id: advertiserId,
      catalog_name: catalogName,
    });

    if (result.code !== 0) {
      throw new Error(`Error creando catálogo TikTok: ${result.message}`);
    }

    return {
      catalogId: result.data!.catalog_id,
      catalogName: catalogName,
    };
  }

  /**
   * Setup completo: crear pixel y catálogo (o reusar existentes),
   * guardar IDs en credenciales, y sincronizar productos.
   */
  async fullSetup(
    connectionId: string,
    accessToken: string,
    appSecret: string,
    advertiserId: string,
    organizationId: number,
    organizationName: string,
    domain: string,
    currency: string = 'COP'
  ): Promise<TikTokSetupResult> {
    // 1. Buscar o crear pixel
    const existingPixels = await this.listPixels(accessToken, advertiserId);
    const goAdminPixel = existingPixels.find(
      (p) => p.pixelName.includes('GO Admin') || p.pixelName.includes(organizationName)
    );

    let pixel: TikTokCreatePixelResult;
    if (goAdminPixel) {
      pixel = goAdminPixel;
    } else {
      pixel = await this.createPixel(
        accessToken,
        advertiserId,
        `${organizationName} - GO Admin Pixel`
      );
    }

    // 2. Buscar o crear catálogo
    const existingCatalogs = await this.listCatalogs(accessToken, advertiserId);
    const goAdminCatalog = existingCatalogs.find(
      (c) => c.catalogName.includes('GO Admin') || c.catalogName.includes(organizationName)
    );

    let catalog: TikTokCreateCatalogResult;
    if (goAdminCatalog) {
      catalog = goAdminCatalog;
    } else {
      catalog = await this.createCatalog(
        accessToken,
        advertiserId,
        `${organizationName} - GO Admin`
      );
    }

    // 3. Guardar todas las credenciales (incluyendo IDs creados)
    await this.saveCredentials(connectionId, {
      accessToken,
      appSecret,
      advertiserId,
      pixelCode: pixel.pixelCode,
      catalogId: catalog.catalogId,
    });

    // 4. Sincronizar productos al catálogo
    const products = await this.getProductsForSync(organizationId, domain, currency);
    let productsSynced = 0;
    if (products.length > 0) {
      const syncResult = await this.syncCatalog(
        accessToken,
        advertiserId,
        catalog.catalogId,
        products,
        currency
      );
      productsSynced = syncResult.created;
    }

    return {
      catalogId: catalog.catalogId,
      catalogName: catalog.catalogName,
      pixelCode: pixel.pixelCode,
      pixelName: pixel.pixelName,
      productsSynced,
    };
  }

  // ──────────────────────────────────────────────
  // Catálogo – Sincronización de productos
  // ──────────────────────────────────────────────

  /** Obtener productos de GO Admin listos para sincronizar */
  async getProductsForSync(
    organizationId: number,
    domain: string,
    currency: string = 'COP'
  ): Promise<GOAdminProduct[]> {
    const { data: products, error } = await supabase
      .from('products')
      .select(`
        id, uuid, sku, name, description, status, barcode,
        categories ( name ),
        product_prices ( price, effective_from, effective_to ),
        product_images ( storage_path, is_primary, display_order )
      `)
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .order('id');

    if (error || !products) return [];

    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single();

    const orgName = org?.name || 'GO Admin Store';

    return products.map((p: Record<string, unknown>) => {
      const prices = (p.product_prices as Array<Record<string, unknown>>) || [];
      const now = new Date().toISOString();
      const activePrice =
        prices.find(
          (pp) => pp.effective_from <= now && (!pp.effective_to || pp.effective_to >= now)
        ) || prices[0];

      const images = (p.product_images as Array<Record<string, unknown>>) || [];
      const primaryImg = images.find((img) => img.is_primary) || images[0];
      const additionalImgs = images
        .filter((img) => !img.is_primary)
        .slice(0, 10)
        .map((img) => String(img.storage_path));

      const category = p.categories as Record<string, unknown> | null;

      return {
        id: p.id as number,
        uuid: p.uuid as string,
        sku: p.sku as string,
        name: p.name as string,
        description: (p.description as string) || '',
        status: p.status as string,
        barcode: p.barcode as string | null,
        category_name: category?.name as string | null,
        price: activePrice ? (activePrice.price as number) : null,
        image_url: primaryImg ? String(primaryImg.storage_path) : null,
        additional_images: additionalImgs,
        organization_name: orgName,
        product_url: `https://${domain}/productos/${p.id}`,
      };
    });
  }

  /** Transformar producto GO Admin → formato TikTok */
  transformToTikTokProduct(
    product: GOAdminProduct,
    currency: string = 'COP'
  ): TikTokProductData {
    return {
      sku_id: product.sku,
      title: product.name.substring(0, 150),
      description: (product.description || product.name).substring(0, 5000),
      availability: mapTikTokAvailability(product.status),
      condition: 'NEW',
      price: {
        price: formatTikTokPrice(product.price, currency),
        currency,
      },
      landing_page_url: product.product_url,
      image_link: product.image_url || '',
      brand: product.organization_name,
      item_group_id: product.category_name || undefined,
      additional_image_link:
        product.additional_images.length > 0 ? product.additional_images : undefined,
    };
  }

  /** Sincronizar productos al catálogo de TikTok (batch de 20) */
  async syncCatalog(
    accessToken: string,
    advertiserId: string,
    catalogId: string,
    products: GOAdminProduct[],
    currency: string = 'COP'
  ): Promise<TikTokCatalogSyncResult> {
    const batchSize = 20; // TikTok max 20 productos por request

    let created = 0;
    let updated = 0;
    let errors = 0;
    const details: string[] = [];

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      const tiktokProducts = batch.map((p) => this.transformToTikTokProduct(p, currency));

      try {
        const result = await this.apiPost('/catalog/product/upload/', accessToken, {
          advertiser_id: advertiserId,
          catalog_id: catalogId,
          products: tiktokProducts,
        });

        if (result.code !== 0) {
          errors += batch.length;
          details.push(
            `Batch ${Math.floor(i / batchSize) + 1} error: ${result.message}`
          );
          continue;
        }

        created += batch.length;
        details.push(
          `Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} productos enviados`
        );
      } catch (err) {
        errors += batch.length;
        details.push(
          `Batch ${Math.floor(i / batchSize) + 1} exception: ${err instanceof Error ? err.message : 'Unknown'}`
        );
      }
    }

    return { total: products.length, created, updated, errors, details };
  }

  // ──────────────────────────────────────────────
  // Events API (Server-Side)
  // ──────────────────────────────────────────────

  /** Hash SHA-256 para datos personales */
  hashSHA256(value: string): string {
    return crypto
      .createHash('sha256')
      .update(value.trim().toLowerCase())
      .digest('hex');
  }

  /** Enviar evento(s) a la Events API de TikTok */
  async sendEvent(
    accessToken: string,
    pixelCode: string,
    events: TikTokEventData[]
  ): Promise<TikTokEventResult> {
    // Si es un solo evento, enviar directo; si son varios, usar batch
    const body: Record<string, unknown> =
      events.length === 1
        ? { pixel_code: pixelCode, ...events[0] }
        : { pixel_code: pixelCode, batch: events };

    const result = await this.apiPost<{ events_received: number }>(
      '/pixel/track/',
      accessToken,
      body
    );

    if (result.code !== 0) {
      throw new Error(`TikTok Events API error: ${result.code} - ${result.message}`);
    }

    return {
      code: result.code,
      message: result.message,
      data: result.data,
    };
  }
  // ──────────────────────────────────────────────
  // OAuth – Intercambio de código por token
  // ──────────────────────────────────────────────

  /** Intercambiar auth_code por access_token via TikTok OAuth */
  async exchangeCodeForToken(authCode: string): Promise<{
    accessToken: string;
    advertiserIds: string[];
  }> {
    const appId = process.env.TIKTOK_APP_ID;
    const appSecret = process.env.TIKTOK_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error('TIKTOK_APP_ID o TIKTOK_APP_SECRET no configurados');
    }

    const apiUrl = getTikTokApiUrl();
    const response = await fetch(`${apiUrl}/oauth2/access_token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: appId,
        secret: appSecret,
        auth_code: authCode,
      }),
    });

    const result = await response.json();
    if (result.code !== 0 || !result.data?.access_token) {
      throw new Error(`Error OAuth TikTok: ${result.message || 'No se pudo obtener token'}`);
    }

    return {
      accessToken: result.data.access_token,
      advertiserIds: result.data.advertiser_ids || [],
    };
  }

  /** Obtener info del advertiser (nombre) para mostrar al usuario */
  async getAdvertiserInfo(accessToken: string, advertiserId: string): Promise<{
    id: string;
    name: string;
  }> {
    const result = await this.apiGet<{
      list: Array<{ advertiser_id: string; advertiser_name: string }>;
    }>('/advertiser/info/', accessToken, {
      advertiser_ids: JSON.stringify([advertiserId]),
    });

    if (result.code !== 0 || !result.data?.list?.[0]) {
      throw new Error(`No se pudo obtener info del advertiser: ${result.message}`);
    }

    const adv = result.data.list[0];
    return { id: adv.advertiser_id, name: adv.advertiser_name };
  }

  /**
   * Flujo OAuth completo: code → token → advertiser info.
   * Retorna todo lo necesario para crear la conexión y ejecutar fullSetup.
   */
  async completeOAuthFlow(authCode: string): Promise<{
    accessToken: string;
    advertiserId: string;
    advertiserName: string;
  }> {
    // 1. Intercambiar code por token (también devuelve advertiser_ids)
    const { accessToken, advertiserIds } = await this.exchangeCodeForToken(authCode);

    if (advertiserIds.length === 0) {
      throw new Error('No se encontraron cuentas de anuncios asociadas al usuario');
    }

    // 2. Usar el primer advertiser_id (normalmente solo hay uno)
    const advertiserId = advertiserIds[0];

    // 3. Obtener nombre del advertiser
    const advertiserInfo = await this.getAdvertiserInfo(accessToken, advertiserId);

    return {
      accessToken,
      advertiserId: advertiserInfo.id,
      advertiserName: advertiserInfo.name,
    };
  }
}

export const tiktokMarketingService = new TikTokMarketingService();
