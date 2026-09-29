/**
 * Manejo de cookies de atribución y consentimiento (contrato del 27-sep-2026).
 *
 * - `goadmin_consent`: JSON con {"v":1,"analytics":bool,"marketing":bool,"ts":epoch}
 *   o valor heredado 'all' (ambos true) o cualquier otro (ambos false).
 *   domain=.goadmin.io, path=/, SameSite=Lax, Secure, 180 días.
 *
 * - `goadmin_attr`: JSON con atribución de primer y último toque.
 *   domain=.goadmin.io, path=/, SameSite=Lax, Secure en producción, 90 días,
 *   httpOnly=false (leída por el cliente para signup_data).
 *   Modelo first-touch: no sobrescribir si ya existe, salvo que llegue un ref nuevo.
 */

import type { AttributionData, Consent, ConsentData } from './types';

const COOKIE_NAME_CONSENT = 'goadmin_consent';
const COOKIE_NAME_ATTR = 'goadmin_attr';
const CONSENT_MAX_AGE = 180 * 24 * 60 * 60; // 180 días
const ATTR_MAX_AGE = 90 * 24 * 60 * 60; // 90 días
const DOMAIN = typeof window !== 'undefined' && window.location.hostname.includes('goadmin.io') ? '.goadmin.io' : undefined;

/**
 * Lee una cookie por nombre (cliente y servidor compatibles).
 */
function getCookie(name: string, cookieHeader?: string): string | null {
  if (typeof window === 'undefined') {
    // Servidor: leer del header Cookie
    if (!cookieHeader) return null;
    const match = cookieHeader.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  }
  // Cliente
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Escribe una cookie (solo cliente).
 */
function setCookie(name: string, value: string, maxAge: number): void {
  if (typeof window === 'undefined') return;
  
  const isSecure = window.location.protocol === 'https:';
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `path=/`,
    `max-age=${maxAge}`,
    `SameSite=Lax`,
  ];
  
  if (DOMAIN) parts.push(`domain=${DOMAIN}`);
  if (isSecure) parts.push('Secure');
  
  document.cookie = parts.join('; ');
}

/**
 * Lee el consentimiento de la cookie goadmin_consent.
 */
export function readConsent(cookieHeader?: string): ConsentData {
  const raw = getCookie(COOKIE_NAME_CONSENT, cookieHeader);
  if (!raw) return { v: 1, analytics: false, marketing: false, ts: Date.now() };
  
  // Valor heredado 'all' = ambos true
  if (raw === 'all') return { v: 1, analytics: true, marketing: true, ts: Date.now() };
  
  // JSON nuevo
  try {
    const parsed = JSON.parse(raw) as Consent;
    if (typeof parsed === 'object' && 'v' in parsed) {
      return parsed;
    }
    // Cualquier otro valor heredado = ambos false
    return { v: 1, analytics: false, marketing: false, ts: Date.now() };
  } catch {
    return { v: 1, analytics: false, marketing: false, ts: Date.now() };
  }
}

/**
 * Escribe el consentimiento en la cookie goadmin_consent (solo cliente).
 */
export function writeConsent(consent: ConsentData): void {
  setCookie(COOKIE_NAME_CONSENT, JSON.stringify(consent), CONSENT_MAX_AGE);
  
  // Emitir evento para que se activen tags sin recargar
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('goadmin:consent', { detail: consent }));
  }
}

/**
 * Lee la atribución de la cookie goadmin_attr o sessionStorage goadmin_attr_session.
 * Sin consentimiento de marketing: lee solo de sessionStorage (UTM básicos).
 * Con consentimiento: lee de la cookie (incluye IDs de clic).
 */
export function readAttribution(cookieHeader?: string): AttributionData | null {
  const consent = readConsent(cookieHeader);
  
  if (consent.marketing) {
    // Con consentimiento de marketing: leer de cookie
    const raw = getCookie(COOKIE_NAME_ATTR, cookieHeader);
    if (!raw) return null;
    
    try {
      return JSON.parse(raw) as AttributionData;
    } catch {
      return null;
    }
  } else {
    // Sin consentimiento de marketing: leer de sessionStorage (solo cliente)
    if (typeof window === 'undefined') return null;
    
    const raw = sessionStorage.getItem('goadmin_attr_session');
    if (!raw) return null;
    
    try {
      return JSON.parse(raw) as AttributionData;
    } catch {
      return null;
    }
  }
}

/**
 * Escribe la atribución (solo cliente).
 * - Sin consentimiento de marketing: sessionStorage con solo UTM básicos.
 * - Con consentimiento: cookie con todo (UTM + IDs de clic).
 * - Modelo first-touch: no sobrescribir si ya existe, salvo que llegue un ref nuevo.
 */
export function writeAttribution(data: AttributionData): void {
  if (typeof window === 'undefined') return;
  
  const consent = readConsent();
  const existing = readAttribution();
  
  // Modelo first-touch: si ya existe, solo actualizar ref y last_touch si llega un ref nuevo
  if (existing) {
    const hasNewRef = data.ref && data.ref !== existing.ref;
    if (!hasNewRef) return; // No sobrescribir
    
    // Actualizar solo ref y last_touch
    const updated: AttributionData = {
      ...existing,
      ref: data.ref,
      utm_source_last: data.utm_source_last,
      utm_medium_last: data.utm_medium_last,
      utm_campaign_last: data.utm_campaign_last,
      utm_content_last: data.utm_content_last,
      utm_term_last: data.utm_term_last,
      last_touch_at: new Date().toISOString(),
    };
    
    if (consent.marketing) {
      setCookie(COOKIE_NAME_ATTR, JSON.stringify(updated), ATTR_MAX_AGE);
    } else {
      sessionStorage.setItem('goadmin_attr_session', JSON.stringify(updated));
    }
    return;
  }
  
  // Primera vez: guardar todo
  const now = new Date().toISOString();
  const attribution: AttributionData = {
    ...data,
    first_seen_at: now,
    last_touch_at: now,
  };
  
  if (consent.marketing) {
    // Con consentimiento: cookie con todo
    setCookie(COOKIE_NAME_ATTR, JSON.stringify(attribution), ATTR_MAX_AGE);
  } else {
    // Sin consentimiento: sessionStorage solo con UTM básicos (sin IDs de clic)
    const basic: AttributionData = {
      utm_source_first: attribution.utm_source_first,
      utm_medium_first: attribution.utm_medium_first,
      utm_campaign_first: attribution.utm_campaign_first,
      utm_content_first: attribution.utm_content_first,
      utm_term_first: attribution.utm_term_first,
      utm_source_last: attribution.utm_source_last,
      utm_medium_last: attribution.utm_medium_last,
      utm_campaign_last: attribution.utm_campaign_last,
      utm_content_last: attribution.utm_content_last,
      utm_term_last: attribution.utm_term_last,
      landing_page: attribution.landing_page,
      referrer: attribution.referrer,
      ref: attribution.ref,
      first_seen_at: attribution.first_seen_at,
      last_touch_at: attribution.last_touch_at,
    };
    sessionStorage.setItem('goadmin_attr_session', JSON.stringify(basic));
  }
}

/**
 * Sanea y recorta un valor (máximo 200 caracteres, solo caracteres seguros).
 */
function sanitize(value: string | null | undefined, maxLength = 200): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // Solo permitir caracteres seguros: letras, números, guiones, puntos, espacios, ~
  const safe = trimmed.replace(/[^\w.\-~ ]/g, '');
  return safe.slice(0, maxLength) || undefined;
}

/**
 * Captura la atribución de la URL y el navegador actual.
 * Llama a writeAttribution() para guardarla según el consentimiento.
 */
export function captureAttribution(): void {
  if (typeof window === 'undefined') return;
  
  const url = new URL(window.location.href);
  const params = url.searchParams;
  
  // Leer UTM y parámetros de tracking
  const utm_source = sanitize(params.get('utm_source'));
  const utm_medium = sanitize(params.get('utm_medium'));
  const utm_campaign = sanitize(params.get('utm_campaign'));
  const utm_content = sanitize(params.get('utm_content'));
  const utm_term = sanitize(params.get('utm_term'));
  const gclid = sanitize(params.get('gclid'));
  const fbclid = sanitize(params.get('fbclid'));
  const ref = sanitize(params.get('ref'), 100);
  
  // Referrer (solo si no es del propio dominio)
  const referrer = document.referrer;
  const referrerUrl = referrer ? new URL(referrer) : null;
  const isOwnDomain = referrerUrl?.hostname.includes('goadmin.io');
  const referrerClean = !isOwnDomain && referrerUrl ? `${referrerUrl.origin}${referrerUrl.pathname}` : undefined;
  
  // Landing page (sin query string)
  const landing_page = `${window.location.pathname}`;
  
  // Leer cookies de tracking (solo con consentimiento de marketing)
  const consent = readConsent();
  const fbp = consent.marketing ? getCookie('_fbp') || undefined : undefined;
  let fbc = consent.marketing ? getCookie('_fbc') || undefined : undefined;
  
  // Construir _fbc si hay fbclid y no existe
  if (consent.marketing && fbclid && !fbc) {
    fbc = `fb.1.${Date.now()}.${fbclid}`;
  }
  
  // _ga client ID (formato: GA1.2.xxxxxxxxxx.yyyyyyyyyy)
  const ga_raw = consent.marketing ? getCookie('_ga') || undefined : undefined;
  const ga_client_id = ga_raw?.split('.').slice(2).join('.') || undefined;
  
  // Si no hay nada que capturar, no hacer nada
  const hasData = utm_source || utm_medium || utm_campaign || utm_content || utm_term || 
                  gclid || fbclid || ref || referrerClean;
  
  if (!hasData) return;
  
  // Construir objeto de atribución
  const data: AttributionData = {
    utm_source_first: utm_source,
    utm_medium_first: utm_medium,
    utm_campaign_first: utm_campaign,
    utm_content_first: utm_content,
    utm_term_first: utm_term,
    utm_source_last: utm_source,
    utm_medium_last: utm_medium,
    utm_campaign_last: utm_campaign,
    utm_content_last: utm_content,
    utm_term_last: utm_term,
    gclid: consent.marketing ? gclid : undefined,
    fbclid: consent.marketing ? fbclid : undefined,
    fbp,
    fbc,
    ga_client_id,
    landing_page: sanitize(landing_page, 500),
    referrer: sanitize(referrerClean, 500),
    ref,
  };
  
  writeAttribution(data);
}
