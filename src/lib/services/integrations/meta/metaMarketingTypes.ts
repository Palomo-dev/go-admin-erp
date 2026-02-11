// ============================================================
// Tipos TypeScript para la integración Meta Marketing
// Catálogo de productos, Meta Pixel, Conversions API
// ============================================================

// --- Credenciales ---

export interface MetaMarketingCredentials {
  accessToken: string;
  appSecret: string;
  businessId: string;
  pixelId: string;
  catalogId: string;
}

// --- Setup automático (creación de catálogo y pixel) ---

export interface MetaSetupResult {
  catalogId: string;
  catalogName: string;
  pixelId: string;
  pixelName: string;
  productsSynced: number;
}

export interface MetaCreateCatalogResult {
  id: string;
  name: string;
}

export interface MetaCreatePixelResult {
  id: string;
  name: string;
}

// --- Token Debug ---

export interface MetaTokenDebugResult {
  valid: boolean;
  message: string;
  appId?: string;
  scopes?: string[];
  expiresAt?: number;
}

// --- Catálogo: Producto Facebook ---

export interface FacebookProductData {
  id: string; // retailer_id = SKU
  title: string;
  description: string;
  availability: 'in stock' | 'out of stock' | 'preorder' | 'discontinued';
  condition: 'new' | 'refurbished' | 'used';
  price: string; // "50000 COP"
  link: string; // URL pública del producto
  image_link: string; // URL pública de la imagen principal
  brand?: string;
  category?: string; // Google Product Category
  inventory?: number;
  sale_price?: string;
  additional_image_link?: string[];
  gtin?: string; // Código de barras
}

export interface CatalogBatchRequest {
  method: 'CREATE' | 'UPDATE' | 'DELETE';
  retailer_id: string;
  data?: Partial<FacebookProductData>;
}

export interface CatalogSyncResult {
  total: number;
  created: number;
  updated: number;
  errors: number;
  details?: string[];
}

// --- Conversions API (CAPI) ---

export interface CAPIUserData {
  em?: string[]; // Email hasheado SHA-256
  ph?: string[]; // Teléfono hasheado SHA-256
  fn?: string; // Nombre hasheado SHA-256
  ln?: string; // Apellido hasheado SHA-256
  client_ip_address?: string;
  client_user_agent?: string;
  fbc?: string; // Facebook click ID (cookie _fbc)
  fbp?: string; // Facebook browser ID (cookie _fbp)
  external_id?: string; // ID interno hasheado SHA-256
}

export interface CAPIEventData {
  event_name: string;
  event_time: number; // Unix timestamp
  event_id?: string; // Para deduplicación con Pixel
  event_source_url?: string;
  action_source: 'website' | 'app' | 'phone_call' | 'chat' | 'email' | 'other';
  user_data: CAPIUserData;
  custom_data?: {
    value?: number;
    currency?: string;
    content_ids?: string[];
    content_type?: 'product' | 'product_group';
    num_items?: number;
    content_name?: string;
    content_category?: string;
    search_string?: string;
  };
}

export interface CAPIEventResult {
  events_received: number;
  messages: string[];
  fbtrace_id: string;
}

// --- Webhook ---

export interface MetaWebhookEntry {
  id: string;
  time: number;
  changes?: {
    field: string;
    value: Record<string, unknown>;
  }[];
}

export interface MetaWebhookPayload {
  object: string;
  entry: MetaWebhookEntry[];
}

// --- Health Check ---

export interface MetaHealthCheckResult {
  valid: boolean;
  message: string;
  scopes?: string[];
  expiresAt?: number;
  appId?: string;
  businessId?: string;
}

// --- Mapeo de productos GO Admin → Facebook ---

export interface GOAdminProduct {
  id: number;
  uuid: string;
  sku: string;
  name: string;
  description: string | null;
  status: string | null;
  barcode: string | null;
  category_name: string | null;
  price: number | null;
  image_url: string | null;
  additional_images: string[];
  organization_name: string;
  product_url: string;
}
