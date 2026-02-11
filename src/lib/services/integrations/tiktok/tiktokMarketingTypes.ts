// ============================================================
// Tipos para la integración TikTok Marketing
// Catálogo de productos, Pixel, Events API
// ============================================================

/** Credenciales almacenadas en integration_credentials */
export interface TikTokMarketingCredentials {
  accessToken: string;
  appSecret: string;
  advertiserId: string;
  pixelCode: string;
  catalogId: string;
}

/** Resultado del health check (verificar token) */
export interface TikTokHealthCheckResult {
  valid: boolean;
  message: string;
  advertiserName?: string;
  advertiserId?: string;
}

/** Resultado del setup automático completo */
export interface TikTokSetupResult {
  catalogId: string;
  catalogName: string;
  pixelCode: string;
  pixelName: string;
  productsSynced: number;
}

/** Resultado de crear pixel */
export interface TikTokCreatePixelResult {
  pixelCode: string;
  pixelName: string;
}

/** Resultado de crear catálogo */
export interface TikTokCreateCatalogResult {
  catalogId: string;
  catalogName: string;
}

/** Producto en formato TikTok Catalog */
export interface TikTokProductData {
  sku_id: string;
  title: string;
  description: string;
  availability: 'IN_STOCK' | 'OUT_OF_STOCK' | 'PREORDER';
  condition: 'NEW' | 'REFURBISHED' | 'USED';
  price: {
    price: string;
    currency: string;
  };
  sale_price?: {
    sale_price: string;
    currency: string;
  };
  landing_page_url: string;
  image_link: string;
  additional_image_link?: string[];
  brand: string;
  google_product_category?: string;
  item_group_id?: string;
}

/** Resultado de sincronización de catálogo */
export interface TikTokCatalogSyncResult {
  total: number;
  created: number;
  updated: number;
  errors: number;
  details: string[];
}

/** Evento para la Events API */
export interface TikTokEventData {
  event: string;
  event_id: string;
  timestamp?: string;
  context: {
    ad?: {
      callback?: string;
    };
    page?: {
      url?: string;
      referrer?: string;
    };
    user?: {
      external_id?: string;
      email?: string;
      phone_number?: string;
      ip?: string;
      user_agent?: string;
    };
    user_agent?: string;
  };
  properties?: {
    contents?: Array<{
      content_id: string;
      content_type: string;
      content_name?: string;
      quantity?: number;
      price?: number;
    }>;
    content_type?: string;
    currency?: string;
    value?: number;
    order_id?: string;
    query?: string;
  };
}

/** Resultado de envío de evento */
export interface TikTokEventResult {
  code: number;
  message: string;
  data?: {
    events_received: number;
  };
}

/** Producto de GO Admin listo para transformar */
export interface GOAdminProduct {
  id: number;
  uuid: string;
  sku: string;
  name: string;
  description: string;
  status: string;
  barcode: string | null;
  category_name: string | null;
  price: number | null;
  image_url: string | null;
  additional_images: string[];
  organization_name: string;
  product_url: string;
}

/** Response genérica de TikTok API */
export interface TikTokApiResponse<T = unknown> {
  code: number;
  message: string;
  request_id?: string;
  data?: T;
}
