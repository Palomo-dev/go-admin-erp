// ============================================================
// Servicio Meta Marketing para CLIENTES de GO Admin ERP
// Catálogo de productos, Conversions API, Webhook verification
// ============================================================

import { supabase } from '@/lib/supabase/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import {
  META_CREDENTIAL_PURPOSES,
  getMetaApiUrl,
  getMetaRedirectUri,
  mapProductAvailability,
  formatFacebookPrice,
} from './metaMarketingConfig';
import type {
  MetaMarketingCredentials,
  MetaHealthCheckResult,
  MetaSetupResult,
  MetaCreateCatalogResult,
  MetaCreatePixelResult,
  MetaProductSetResult,
  FacebookProductData,
  CatalogBatchRequest,
  CatalogSyncResult,
  CAPIEventData,
  CAPIEventResult,
  GOAdminProduct,
} from './metaMarketingTypes';

class MetaMarketingService {
  // ──────────────────────────────────────────────
  // Credenciales
  // ──────────────────────────────────────────────

  /** Obtener credenciales de Meta Marketing para una conexión */
  async getCredentials(connectionId: string): Promise<MetaMarketingCredentials | null> {
    const { data, error } = await supabase
      .from('integration_credentials')
      .select('purpose, secret_ref')
      .eq('connection_id', connectionId);

    if (error || !data || data.length === 0) return null;

    const creds: MetaMarketingCredentials = {
      accessToken: '',
      appSecret: '',
      businessId: '',
      adAccountId: '',
      pixelId: '',
      catalogId: '',
      productSetId: '',
    };

    for (const row of data) {
      switch (row.purpose) {
        case META_CREDENTIAL_PURPOSES.ACCESS_TOKEN:
          creds.accessToken = row.secret_ref || '';
          break;
        case META_CREDENTIAL_PURPOSES.APP_SECRET:
          creds.appSecret = row.secret_ref || '';
          break;
        case META_CREDENTIAL_PURPOSES.BUSINESS_ID:
          creds.businessId = row.secret_ref || '';
          break;
        case META_CREDENTIAL_PURPOSES.AD_ACCOUNT_ID:
          creds.adAccountId = row.secret_ref || '';
          break;
        case META_CREDENTIAL_PURPOSES.PIXEL_ID:
          creds.pixelId = row.secret_ref || '';
          break;
        case META_CREDENTIAL_PURPOSES.CATALOG_ID:
          creds.catalogId = row.secret_ref || '';
          break;
        case META_CREDENTIAL_PURPOSES.PRODUCT_SET_ID:
          creds.productSetId = row.secret_ref || '';
          break;
      }
    }

    return creds;
  }

  /** Guardar credenciales de Meta Marketing para una conexión */
  async saveCredentials(
    connectionId: string,
    credentials: MetaMarketingCredentials,
    db: SupabaseClient = supabase
  ): Promise<boolean> {
    const entries = [
      { purpose: META_CREDENTIAL_PURPOSES.ACCESS_TOKEN, value: credentials.accessToken },
      { purpose: META_CREDENTIAL_PURPOSES.APP_SECRET, value: credentials.appSecret },
      { purpose: META_CREDENTIAL_PURPOSES.BUSINESS_ID, value: credentials.businessId },
      { purpose: META_CREDENTIAL_PURPOSES.AD_ACCOUNT_ID, value: credentials.adAccountId },
      { purpose: META_CREDENTIAL_PURPOSES.PIXEL_ID, value: credentials.pixelId },
      { purpose: META_CREDENTIAL_PURPOSES.CATALOG_ID, value: credentials.catalogId },
      { purpose: META_CREDENTIAL_PURPOSES.PRODUCT_SET_ID, value: credentials.productSetId || '' },
    ];

    for (const entry of entries) {
      if (!entry.value) continue;

      const { data: existing } = await db
        .from('integration_credentials')
        .select('id')
        .eq('connection_id', connectionId)
        .eq('purpose', entry.purpose)
        .maybeSingle();

      if (existing) {
        const { error } = await db
          .from('integration_credentials')
          .update({
            secret_ref: entry.value,
            credential_type: 'oauth2',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) {
          console.error(`Error updating Meta credential ${entry.purpose}:`, error);
          return false;
        }
      } else {
        const { error } = await db
          .from('integration_credentials')
          .insert({
            connection_id: connectionId,
            credential_type: 'oauth2',
            purpose: entry.purpose,
            secret_ref: entry.value,
          });

        if (error) {
          console.error(`Error inserting Meta credential ${entry.purpose}:`, error);
          return false;
        }
      }
    }

    return true;
  }

  // ──────────────────────────────────────────────
  // OAuth – Flujo automático de autenticación
  // ──────────────────────────────────────────────

  /** Intercambiar code de OAuth por access_token de corta duración */
  async exchangeCodeForToken(code: string): Promise<{ accessToken: string; expiresIn: number }> {
    const apiUrl = getMetaApiUrl();
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const redirectUri = getMetaRedirectUri();

    const response = await fetch(
      `${apiUrl}/oauth/access_token` +
      `?client_id=${appId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&client_secret=${appSecret}` +
      `&code=${encodeURIComponent(code)}`
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Error al obtener token: ${err.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return { accessToken: data.access_token, expiresIn: data.expires_in || 3600 };
  }

  /** Intercambiar token de corta duración por uno de larga duración (~60 días) */
  async getLongLivedToken(shortLivedToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    const apiUrl = getMetaApiUrl();
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    const response = await fetch(
      `${apiUrl}/oauth/access_token` +
      `?grant_type=fb_exchange_token` +
      `&client_id=${appId}` +
      `&client_secret=${appSecret}` +
      `&fb_exchange_token=${encodeURIComponent(shortLivedToken)}`
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Error al obtener token largo: ${err.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return { accessToken: data.access_token, expiresIn: data.expires_in || 5184000 };
  }

  /** Obtener las cuentas de Business Manager del usuario autenticado */
  async getBusinessAccounts(accessToken: string): Promise<Array<{ id: string; name: string }>> {
    const apiUrl = getMetaApiUrl();
    const response = await fetch(
      `${apiUrl}/me/businesses?fields=id,name&access_token=${encodeURIComponent(accessToken)}`
    );

    if (!response.ok) return [];
    const data = await response.json();
    return (data.data || []).map((b: Record<string, string>) => ({ id: b.id, name: b.name }));
  }

  /**
   * Obtener las Ad Accounts (cuentas publicitarias) propias de un Business Manager.
   * Los pixels se crean a nivel de Ad Account, no de Business Manager.
   * Endpoint: GET /{business_id}/owned_ad_accounts
   */
  async getAdAccounts(
    accessToken: string,
    businessId: string
  ): Promise<Array<{ id: string; name: string; account_id: string; currency: string; account_status: number }>> {
    const apiUrl = getMetaApiUrl();
    const response = await fetch(
      `${apiUrl}/${businessId}/owned_ad_accounts` +
      `?fields=id,name,account_id,currency,account_status` +
      `&access_token=${encodeURIComponent(accessToken)}`
    );

    if (!response.ok) return [];
    const data = await response.json();
    return (data.data || []).map((a: Record<string, unknown>) => ({
      id: String(a.id),
      name: String(a.name || ''),
      account_id: String(a.account_id || ''),
      currency: String(a.currency || 'COP'),
      account_status: Number(a.account_status ?? 1),
    }));
  }

  /**
   * Flujo OAuth completo: intercambiar code → long-lived token → obtener business + ad account.
   * Retorna las credenciales listas para fullSetup.
   */
  async completeOAuthFlow(code: string): Promise<{
    accessToken: string;
    businessId: string;
    businessName: string;
    adAccountId: string;
    adAccountName: string;
    expiresIn: number;
  }> {
    // 1. Code → short-lived token
    const shortLived = await this.exchangeCodeForToken(code);

    // 2. Short-lived → long-lived token (~60 días)
    const longLived = await this.getLongLivedToken(shortLived.accessToken);

    // 3. Obtener Business Managers del usuario
    const businesses = await this.getBusinessAccounts(longLived.accessToken);
    if (businesses.length === 0) {
      throw new Error('No se encontraron Business Managers. El usuario debe tener al menos un Business Manager en Meta.');
    }

    // Usar el primer Business Manager (el más común para un solo negocio)
    const business = businesses[0];

    // 4. Obtener Ad Accounts del Business Manager (necesario para crear pixel)
    const adAccounts = await this.getAdAccounts(longLived.accessToken, business.id);
    if (adAccounts.length === 0) {
      throw new Error(
        'No se encontraron cuentas publicitarias (Ad Accounts) en el Business Manager. ' +
        'El usuario debe tener al menos una Ad Account activa para crear el Pixel.'
      );
    }

    // Usar la primera Ad Account activa (account_status === 1 = ACTIVE)
    const activeAdAccount = adAccounts.find((a) => a.account_status === 1) || adAccounts[0];

    return {
      accessToken: longLived.accessToken,
      businessId: business.id,
      businessName: business.name,
      adAccountId: activeAdAccount.id,
      adAccountName: activeAdAccount.name,
      expiresIn: longLived.expiresIn,
    };
  }

  // ──────────────────────────────────────────────
  // Health Check – Debug Token
  // ──────────────────────────────────────────────

  /** Verificar que el access_token es válido usando debug_token */
  async healthCheck(accessToken: string, appSecret: string): Promise<MetaHealthCheckResult> {
    try {
      // Necesitamos app_id para construir el app token; extraer del debug response
      // Usar el propio token para debuggearse a sí mismo
      const apiUrl = getMetaApiUrl();
      const appToken = accessToken; // System User tokens se pueden auto-debuggear

      const response = await fetch(
        `${apiUrl}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(accessToken)}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          valid: false,
          message: `Error ${response.status}: ${errorData.error?.message || response.statusText}`,
        };
      }

      const result = await response.json();
      const data = result.data;

      if (!data?.is_valid) {
        return {
          valid: false,
          message: 'Token inválido o expirado. Genera un nuevo token en Business Settings.',
        };
      }

      return {
        valid: true,
        message: `Token válido. Permisos: ${(data.scopes || []).join(', ')}`,
        scopes: data.scopes,
        expiresAt: data.expires_at,
      };
    } catch (err) {
      return {
        valid: false,
        message: err instanceof Error ? err.message : 'Error al verificar token',
      };
    }
  }

  // ──────────────────────────────────────────────
  // Creación automática de Catálogo y Pixel
  // ──────────────────────────────────────────────

  /** Listar catálogos existentes del Business Manager */
  async listCatalogs(accessToken: string, businessId: string): Promise<MetaCreateCatalogResult[]> {
    const apiUrl = getMetaApiUrl();
    const response = await fetch(
      `${apiUrl}/${businessId}/owned_product_catalogs?fields=id,name&access_token=${encodeURIComponent(accessToken)}`
    );
    if (!response.ok) return [];
    const data = await response.json();
    return (data.data || []).map((c: Record<string, string>) => ({ id: c.id, name: c.name }));
  }

  /** Crear catálogo de productos en el Business Manager */
  async createCatalog(
    accessToken: string,
    businessId: string,
    catalogName: string
  ): Promise<MetaCreateCatalogResult> {
    const apiUrl = getMetaApiUrl();
    const response = await fetch(`${apiUrl}/${businessId}/owned_product_catalogs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: catalogName }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Error creando catálogo: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return { id: data.id, name: catalogName };
  }

  /** Listar conjuntos de productos (product sets) existentes en un catálogo */
  async listProductSets(
    accessToken: string,
    catalogId: string
  ): Promise<MetaProductSetResult[]> {
    const apiUrl = getMetaApiUrl();
    const response = await fetch(
      `${apiUrl}/${catalogId}/product_sets?fields=id,name,filter&access_token=${encodeURIComponent(accessToken)}`
    );
    if (!response.ok) return [];
    const data = await response.json();
    return (data.data || []).map((s: Record<string, unknown>) => ({
      id: String(s.id),
      name: String(s.name || ''),
      filter: s.filter as Record<string, unknown> | undefined,
    }));
  }

  /**
   * Crear un conjunto de productos (product set) dentro de un catálogo.
   * Los product sets agrupan productos y son necesarios para asociarlos
   * a campañas de dynamic ads.
   * Endpoint: POST /{catalog_id}/product_sets
   */
  async createProductSet(
    accessToken: string,
    catalogId: string,
    name: string,
    filter?: Record<string, unknown>
  ): Promise<MetaProductSetResult> {
    const apiUrl = getMetaApiUrl();
    const body: Record<string, unknown> = { name };
    if (filter) {
      body.filter = filter;
    } else {
      // Sin filtro = incluye todos los productos del catálogo
      body.filter = { all_products: true };
    }

    const response = await fetch(`${apiUrl}/${catalogId}/product_sets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Error creando conjunto de productos: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return { id: data.id, name, filter: body.filter as Record<string, unknown> };
  }

  /**
   * Listar pixels existentes de una Ad Account.
   * Los pixels pertenecen a la Ad Account, no al Business Manager.
   * Endpoint: GET /act_{ad_account_id}/adspixels
   */
  async listPixels(accessToken: string, adAccountId: string): Promise<MetaCreatePixelResult[]> {
    const apiUrl = getMetaApiUrl();
    const response = await fetch(
      `${apiUrl}/${adAccountId}/adspixels?fields=id,name&access_token=${encodeURIComponent(accessToken)}`
    );
    if (!response.ok) return [];
    const data = await response.json();
    return (data.data || []).map((p: Record<string, string>) => ({ id: p.id, name: p.name }));
  }

  /**
   * Crear pixel en la Ad Account.
   * Los pixels se crean a nivel de Ad Account (act_{id}), no de Business Manager.
   * Endpoint: POST /act_{ad_account_id}/adspixels
   */
  async createPixel(
    accessToken: string,
    adAccountId: string,
    pixelName: string
  ): Promise<MetaCreatePixelResult> {
    const apiUrl = getMetaApiUrl();
    const response = await fetch(`${apiUrl}/${adAccountId}/adspixels`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: pixelName }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Error creando pixel: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return { id: data.id, name: pixelName };
  }

  /**
   * Setup completo: crear catálogo y pixel (o reusar existentes),
   * guardar IDs en credenciales, y sincronizar productos.
   *
   * El catálogo se crea a nivel de Business Manager, pero el pixel
   * se crea a nivel de Ad Account (act_{id}), por lo que se requiere
   * adAccountId además de businessId.
   */
  async fullSetup(
    connectionId: string,
    accessToken: string,
    appSecret: string,
    businessId: string,
    adAccountId: string,
    organizationId: number,
    organizationName: string,
    domain: string,
    currency: string = 'COP',
    db: SupabaseClient = supabase
  ): Promise<MetaSetupResult> {
    // 1. Buscar o crear catálogo (a nivel de Business Manager)
    const existingCatalogs = await this.listCatalogs(accessToken, businessId);
    const goAdminCatalog = existingCatalogs.find((c) =>
      c.name.includes('GO Admin') || c.name.includes(organizationName)
    );

    let catalog: MetaCreateCatalogResult;
    if (goAdminCatalog) {
      catalog = goAdminCatalog;
    } else {
      catalog = await this.createCatalog(
        accessToken,
        businessId,
        `${organizationName} - GO Admin`
      );
    }

    // 2. Buscar o crear pixel (a nivel de Ad Account)
    const existingPixels = await this.listPixels(accessToken, adAccountId);
    const goAdminPixel = existingPixels.find((p) =>
      p.name.includes('GO Admin') || p.name.includes(organizationName)
    );

    let pixel: MetaCreatePixelResult;
    if (goAdminPixel) {
      pixel = goAdminPixel;
    } else {
      pixel = await this.createPixel(
        accessToken,
        adAccountId,
        `${organizationName} - GO Admin Pixel`
      );
    }

    // 3. Guardar todas las credenciales (incluyendo IDs creados)
    await this.saveCredentials(connectionId, {
      accessToken,
      appSecret,
      businessId,
      adAccountId,
      pixelId: pixel.id,
      catalogId: catalog.id,
    }, db);

    // 4. Sincronizar productos al catálogo
    const products = await this.getProductsForSync(organizationId, domain, currency, db);
    let productsSynced = 0;
    if (products.length > 0) {
      const syncResult = await this.syncCatalog(accessToken, catalog.id, products, currency);
      productsSynced = syncResult.created;
    }

    // 5. Buscar o crear conjunto de productos (product set) en el catálogo
    let productSet: MetaProductSetResult | null = null;
    try {
      const existingSets = await this.listProductSets(accessToken, catalog.id);
      const goAdminSet = existingSets.find((s) =>
        s.name.includes('GO Admin') || s.name.includes(organizationName) || s.name.includes('Todos')
      );

      if (goAdminSet) {
        productSet = goAdminSet;
      } else {
        productSet = await this.createProductSet(
          accessToken,
          catalog.id,
          `${organizationName} - Todos los productos`
        );
      }

      // Guardar product_set_id en credenciales
      await this.saveCredentials(connectionId, {
        accessToken,
        appSecret,
        businessId,
        adAccountId,
        pixelId: pixel.id,
        catalogId: catalog.id,
        productSetId: productSet.id,
      }, db);
    } catch (err) {
      console.error('Error creando product set (no crítico):', err);
    }

    return {
      catalogId: catalog.id,
      catalogName: catalog.name,
      pixelId: pixel.id,
      pixelName: pixel.name,
      adAccountId,
      adAccountName: '',
      productsSynced,
      productSetId: productSet?.id,
      productSetName: productSet?.name,
    };
  }

  // ──────────────────────────────────────────────
  // Catálogo – Sincronización de productos
  // ──────────────────────────────────────────────

  /** Obtener productos de GO Admin listos para sincronizar */
  async getProductsForSync(
    organizationId: number,
    domain: string,
    currency: string = 'COP',
    db: SupabaseClient = supabase
  ): Promise<GOAdminProduct[]> {
    // Productos con precio activo e imagen principal
    const { data: products, error } = await db
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

    // Obtener nombre de la organización
    const { data: org } = await db
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single();

    const orgName = org?.name || 'GO Admin Store';

    return products.map((p: Record<string, unknown>) => {
      const prices = (p.product_prices as Array<Record<string, unknown>>) || [];
      const now = new Date().toISOString();
      const activePrice = prices.find(
        (pp) => (pp.effective_from as string) <= now && (!pp.effective_to || (pp.effective_to as string) >= now)
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

  /** Transformar producto GO Admin → formato Facebook */
  transformToFacebookProduct(
    product: GOAdminProduct,
    currency: string = 'COP'
  ): FacebookProductData {
    return {
      id: product.sku,
      title: product.name.substring(0, 150),
      description: (product.description || product.name).substring(0, 5000),
      availability: mapProductAvailability(product.status),
      condition: 'new',
      price: formatFacebookPrice(product.price, currency),
      link: product.product_url,
      image_link: product.image_url || '',
      brand: product.organization_name,
      category: product.category_name || undefined,
      gtin: product.barcode || undefined,
      additional_image_link:
        product.additional_images.length > 0 ? product.additional_images : undefined,
    };
  }

  /** Sincronizar productos al catálogo de Facebook (batch) */
  async syncCatalog(
    accessToken: string,
    catalogId: string,
    products: GOAdminProduct[],
    currency: string = 'COP'
  ): Promise<CatalogSyncResult> {
    const apiUrl = getMetaApiUrl();
    const batchSize = 4999; // Max 5000 por request

    let created = 0;
    let updated = 0;
    let errors = 0;
    const details: string[] = [];

    // Dividir en lotes
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);

      const requests: CatalogBatchRequest[] = batch.map((product) => ({
        method: 'CREATE', // CREATE actúa como upsert en Facebook
        retailer_id: product.sku,
        data: this.transformToFacebookProduct(product, currency),
      }));

      try {
        const response = await fetch(`${apiUrl}/${catalogId}/items_batch`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ requests }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          errors += batch.length;
          details.push(
            `Batch ${Math.floor(i / batchSize) + 1} error: ${errorData.error?.message || response.statusText}`
          );
          continue;
        }

        const result = await response.json();

        // Facebook batch API retorna handles, no resultados inmediatos
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

    return {
      total: products.length,
      created,
      updated,
      errors,
      details,
    };
  }

  // ──────────────────────────────────────────────
  // Conversions API (CAPI)
  // ──────────────────────────────────────────────

  /** Hash SHA-256 para datos personales */
  hashSHA256(value: string): string {
    return crypto
      .createHash('sha256')
      .update(value.trim().toLowerCase())
      .digest('hex');
  }

  /** Enviar evento(s) a la Conversions API */
  async sendEvent(
    accessToken: string,
    pixelId: string,
    events: CAPIEventData[]
  ): Promise<CAPIEventResult> {
    const apiUrl = getMetaApiUrl();

    const response = await fetch(`${apiUrl}/${pixelId}/events`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: events }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `CAPI error: ${response.status} - ${errorData.error?.message || response.statusText}`
      );
    }

    return response.json();
  }

  // ──────────────────────────────────────────────
  // Webhooks
  // ──────────────────────────────────────────────

  /** Verificar firma HMAC-SHA256 del webhook */
  verifyWebhookSignature(
    rawBody: string,
    signature: string,
    appSecret: string
  ): boolean {
    const expectedSig =
      'sha256=' +
      crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

    return expectedSig === signature;
  }
}

export const metaMarketingService = new MetaMarketingService();
