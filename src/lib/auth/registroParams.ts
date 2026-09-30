/**
 * Persistencia de parámetros del registro (?plan=, ?cycle=, UTM) durante el
 * flujo completo: /auth/signup → verificación de correo → /auth/signup/organizacion.
 * 
 * Los parámetros se guardan en localStorage (no sessionStorage) para sobrevivir:
 * - La creación de cuenta
 * - La verificación de correo en pestaña nueva (el enlace abre otra pestaña)
 * - El login con Google u OAuth
 * - La navegación entre páginas
 * 
 * POLÍTICA DE PRIVACIDAD (criterio de Legal):
 * - Parámetros funcionales (plan, cycle): se guardan siempre (no requieren consentimiento).
 * - Parámetros analíticos (UTM, gclid, fbclid): SOLO se guardan si el usuario ha dado
 *   consentimiento explícito para Medición (goadmin_consent.analytics === true).
 * - Sin consentimiento: los parámetros analíticos se DESCARTAN completamente. No se guardan
 *   en localStorage, no se mantienen en memoria, no se envían al backend, no quedan en la
 *   organización ni en el perfil. Solo plan y cycle viajan.
 */

const STORAGE_KEY = 'go_admin_signup_params';
const STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

export interface RegistroParams {
  plan?: string;
  cycle?: 'monthly' | 'yearly';
  /** Parámetros UTM y otros query params para analytics. Solo se guardan con consentimiento. */
  utm?: Record<string, string>;
  /** Timestamp de cuando se guardaron (para vencimiento). */
  ts?: number;
}

interface ConsentCookie {
  v: number;
  analytics: boolean;
  marketing: boolean;
  ts: number;
}

/**
 * Lee la cookie de consentimiento goadmin_consent.
 * Formato: {"v":1,"analytics":bool,"marketing":bool,"ts":epoch}
 */
function leerConsentimiento(): ConsentCookie | null {
  if (typeof document === 'undefined') return null;
  
  const cookies = document.cookie.split(';').map(c => c.trim());
  const consentCookie = cookies.find(c => c.startsWith('goadmin_consent='));
  if (!consentCookie) return null;
  
  try {
    const value = decodeURIComponent(consentCookie.split('=')[1]);
    return JSON.parse(value) as ConsentCookie;
  } catch {
    return null;
  }
}

/**
 * Guarda los parámetros del registro en localStorage con vencimiento de 7 días.
 * Se llama desde /auth/signup cuando el usuario entra con ?plan=, ?cycle=, etc.
 * 
 * Los parámetros funcionales (plan, cycle) se guardan siempre.
 * Los parámetros analíticos (UTM, gclid, fbclid) SOLO se guardan si el usuario
 * ha dado consentimiento explícito para Medición (analytics === true).
 * Sin consentimiento, los parámetros analíticos se descartan completamente.
 */
export function guardarParamsRegistro(params: URLSearchParams): void {
  if (typeof window === 'undefined') return;
  
  const plan = params.get('plan');
  const cycle = params.get('cycle');
  
  // Capturar parámetros analíticos (UTM, gclid, fbclid).
  const utm: Record<string, string> = {};
  const analyticsKeys = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'gclid', // Google Click ID
    'fbclid', // Facebook Click ID
  ];
  for (const key of analyticsKeys) {
    const value = params.get(key);
    if (value) utm[key] = value;
  }
  
  const datos: RegistroParams = { ts: Date.now() };
  if (plan) datos.plan = plan;
  if (cycle === 'monthly' || cycle === 'yearly') datos.cycle = cycle;
  
  // POLÍTICA DE PRIVACIDAD: Solo guardar parámetros analíticos si el usuario ha dado
  // consentimiento explícito para Medición. Sin consentimiento, se descartan completamente.
  const consent = leerConsentimiento();
  if (Object.keys(utm).length > 0 && consent?.analytics === true) {
    datos.utm = utm;
  }
  
  if (datos.plan || datos.cycle || datos.utm) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(datos));
  }
}

/**
 * Lee los parámetros del registro desde localStorage.
 * Se llama desde /auth/signup/organizacion para preseleccionar el plan.
 * Verifica el vencimiento de 7 días y limpia si expiró.
 */
export function leerParamsRegistro(): RegistroParams {
  if (typeof window === 'undefined') return {};
  
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    
    const datos = JSON.parse(raw) as RegistroParams;
    
    // Verificar vencimiento (7 días).
    if (datos.ts && Date.now() - datos.ts > STORAGE_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return {};
    }
    
    return datos;
  } catch {
    return {};
  }
}

/**
 * Limpia los parámetros del registro de localStorage.
 * Se llama después de usarlos para evitar que se reutilicen en futuras sesiones.
 */
export function limpiarParamsRegistro(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
