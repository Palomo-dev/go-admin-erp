/**
 * Persistencia de parámetros del registro (?plan=, ?cycle=, UTM) durante el
 * flujo completo: /auth/signup → verificación de correo → /auth/signup/organizacion.
 * 
 * Los parámetros se guardan en sessionStorage para sobrevivir:
 * - La creación de cuenta
 * - La verificación de correo (el enlace del correo no los incluye)
 * - El login con Google u OAuth
 * - La navegación entre páginas
 */

const STORAGE_KEY = 'go_admin_signup_params';

export interface RegistroParams {
  plan?: string;
  cycle?: 'monthly' | 'yearly';
  /** Parámetros UTM y otros query params para analytics. */
  utm?: Record<string, string>;
}

/**
 * Guarda los parámetros del registro en sessionStorage.
 * Se llama desde /auth/signup cuando el usuario entra con ?plan=, ?cycle=, etc.
 */
export function guardarParamsRegistro(params: URLSearchParams): void {
  if (typeof window === 'undefined') return;
  
  const plan = params.get('plan');
  const cycle = params.get('cycle');
  
  // Capturar parámetros UTM y otros relevantes.
  const utm: Record<string, string> = {};
  const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  for (const key of utmKeys) {
    const value = params.get(key);
    if (value) utm[key] = value;
  }
  
  const datos: RegistroParams = {};
  if (plan) datos.plan = plan;
  if (cycle === 'monthly' || cycle === 'yearly') datos.cycle = cycle;
  if (Object.keys(utm).length > 0) datos.utm = utm;
  
  if (Object.keys(datos).length > 0) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(datos));
  }
}

/**
 * Lee los parámetros del registro desde sessionStorage.
 * Se llama desde /auth/signup/organizacion para preseleccionar el plan.
 */
export function leerParamsRegistro(): RegistroParams {
  if (typeof window === 'undefined') return {};
  
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as RegistroParams;
  } catch {
    return {};
  }
}

/**
 * Limpia los parámetros del registro de sessionStorage.
 * Se llama después de usarlos para evitar que se reutilicen en futuras sesiones.
 */
export function limpiarParamsRegistro(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
}
