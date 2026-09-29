/**
 * Tipos para la atribución de campañas de marketing (contrato de consentimiento
 * del 27-sep-2026; tarea 02 atribución utm-ref).
 */

export interface AttributionData {
  // UTM parámetros de primer toque
  utm_source_first?: string;
  utm_medium_first?: string;
  utm_campaign_first?: string;
  utm_content_first?: string;
  utm_term_first?: string;
  
  // UTM parámetros de último toque
  utm_source_last?: string;
  utm_medium_last?: string;
  utm_campaign_last?: string;
  utm_content_last?: string;
  utm_term_last?: string;
  
  // IDs de clic (solo con consentimiento de marketing)
  gclid?: string;
  fbclid?: string;
  fbp?: string;
  fbc?: string;
  ga_client_id?: string;
  
  // Navegación
  landing_page?: string;
  referrer?: string;
  
  // Referido de vendedor
  ref?: string;
  
  // Marcas de tiempo
  first_seen_at?: string; // ISO 8601
  last_touch_at?: string; // ISO 8601
}

export interface ConsentData {
  v: number; // versión del schema
  analytics: boolean;
  marketing: boolean;
  ts: number; // timestamp en milisegundos
}

export type LegacyConsent = 'all' | string;

export type Consent = ConsentData | LegacyConsent;
