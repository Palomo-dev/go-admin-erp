/**
 * «Probar llaves» de verdad (Frente INT). Antes `integrationsService.healthCheck` respondía
 * «Conexión activa» a cualquier proveedor que tuviera una fila de credenciales, sin llamar a
 * nadie. Aquí cada resultado sale de una llamada al proveedor:
 *  - 'correcta'  → el proveedor aceptó las llaves;
 *  - 'rechazada' → el proveedor respondió que no (401/403/llave inválida);
 *  - 'sin_respuesta' → red o tiempo agotado: NO se dice que estén bien;
 *  - 'sin_prueba' → no existe forma automática de probarlas: la UI lo dice tal cual.
 * Nunca escribe en la base ni cambia el estado de la conexión. Nunca devuelve un secreto.
 */
import { getWompiBaseUrl } from '@/lib/services/integrations/wompi/wompiConfig';
import type { Ambiente, ProveedorLlaves } from './definicionesLlaves';

export type ResultadoPrueba = 'correcta' | 'rechazada' | 'sin_respuesta' | 'sin_prueba';

export interface Prueba {
  resultado: ResultadoPrueba;
  /** Código HTTP del proveedor, si hubo respuesta. */
  http?: number;
  /** Qué se verificó (para el detalle del evento): sin secretos. */
  verificado: string[];
  /** Con QUIÉN quedó conectado según el proveedor (sin secretos), si la prueba es correcta. */
  cuenta?: CuentaVerificada;
}

/**
 * Lo que el proveedor dice de la cuenta dueña de las llaves («Conectado como …»), como hacía el
 * asistente viejo con Wompi («Conexión verificada: {nombre}»). Nunca incluye secretos. Se guarda
 * en `integration_connections.settings.cuenta_verificada`.
 */
export interface CuentaVerificada {
  nombre: string;
  razonSocial?: string | null;
  /** Documento del comercio («NIT 900123456»). */
  documento?: string | null;
  correo?: string | null;
  pais?: string | null;
  /** Ambiente según las llaves: 'sandbox' o 'production'. */
  ambiente?: Ambiente | null;
  /** Métodos de pago habilitados (Wompi). */
  metodos?: string[];
  /** Id de la cuenta en el proveedor (comercio, usuario, app). */
  idExterno?: string | null;
}

const textoDe = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);

async function leerJson(r: Response): Promise<Record<string, unknown> | null> {
  try {
    const d = (await r.json()) as unknown;
    return d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Cuenta de Wompi desde `GET /v1/merchants/{llave_pública}` (respuesta `data`). */
export function cuentaWompi(datos: Record<string, unknown> | null, ambiente: Ambiente): CuentaVerificada | undefined {
  const d = datos?.data && typeof datos.data === 'object' ? (datos.data as Record<string, unknown>) : null;
  if (!d) return undefined;
  const nombre = textoDe(d.name) ?? textoDe(d.legal_name);
  if (!nombre) return undefined;
  const tipoDoc = textoDe(d.legal_id_type);
  const doc = textoDe(d.legal_id);
  const metodos = Array.isArray(d.accepted_payment_methods)
    ? (d.accepted_payment_methods as unknown[]).map(textoDe).filter((x): x is string => !!x)
    : [];
  return {
    nombre,
    razonSocial: textoDe(d.legal_name),
    documento: doc ? (tipoDoc ? tipoDoc + ' ' + doc : doc) : null,
    correo: textoDe(d.email),
    ambiente,
    metodos,
    idExterno: textoDe(d.id),
  };
}

type Fetch = typeof fetch;
const TIEMPO_MAXIMO_MS = 10_000;

async function llamar(fetchImpl: Fetch, url: string, init: RequestInit = {}): Promise<Response | null> {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS);
  try {
    return await fetchImpl(url, { ...init, signal: control.signal, cache: 'no-store' });
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

function porRespuesta(r: Response | null, verificado: string[], cuenta?: CuentaVerificada): Prueba {
  if (!r) return { resultado: 'sin_respuesta', verificado };
  if (r.ok) return { resultado: 'correcta', http: r.status, verificado, cuenta };
  if (r.status === 401 || r.status === 403 || r.status === 404 || r.status === 422 || r.status === 400) {
    return { resultado: 'rechazada', http: r.status, verificado };
  }
  return { resultado: 'sin_respuesta', http: r.status, verificado };
}

async function probarWompi(ambiente: Ambiente, v: Record<string, string>, fetchImpl: Fetch): Promise<Prueba> {
  const base = getWompiBaseUrl(ambiente);
  // 1. Llave pública: el comercio existe y la llave es suya.
  const comercio = await llamar(fetchImpl, `${base}/merchants/${encodeURIComponent(v.public_key ?? '')}`);
  if (!comercio || !comercio.ok) return porRespuesta(comercio, ['public_key']);
  // Con quién quedó conectado (como el asistente viejo: «Conexión verificada: {nombre}»).
  const cuenta = cuentaWompi(await leerJson(comercio), ambiente);
  // 2. Llave privada: consultar transacciones exige la privada del mismo comercio.
  const privada = await llamar(fetchImpl, `${base}/transactions?reference=GOADMIN-PRUEBA-DE-LLAVES`, {
    headers: { Authorization: `Bearer ${v.private_key ?? ''}` },
  });
  // Los secretos de eventos e integridad no tienen API para probarlos: se validan por forma y
  // el de eventos se confirma con el primer webhook firmado (paso 4 del asistente).
  return porRespuesta(privada, ['public_key', 'private_key'], cuenta);
}

/**
 * Prueba las llaves contra el proveedor. `fetchImpl` se inyecta en las pruebas.
 * Los servicios de cada pasarela se importan bajo demanda (traen SDKs pesados).
 */
export async function probarLlaves(
  proveedor: ProveedorLlaves,
  ambiente: Ambiente,
  valores: Record<string, string>,
  fetchImpl: Fetch = fetch,
): Promise<Prueba> {
  const v = Object.fromEntries(Object.entries(valores).map(([k, x]) => [k, String(x ?? '').trim()]));
  switch (proveedor) {
    case 'wompi':
      return probarWompi(ambiente, v, fetchImpl);
    case 'mercadopago': {
      const r = await llamar(fetchImpl, 'https://api.mercadopago.com/users/me', { headers: { Authorization: `Bearer ${v.access_token}` } });
      if (!r || !r.ok) return porRespuesta(r, ['access_token']);
      const d = await leerJson(r);
      const nombre = textoDe(d?.nickname) ?? textoDe(d?.first_name);
      return porRespuesta(r, ['access_token'], nombre ? {
        nombre,
        razonSocial: textoDe((d?.company as Record<string, unknown> | undefined)?.brand_name),
        correo: textoDe(d?.email),
        pais: textoDe(d?.country_id) ?? textoDe(d?.site_id),
        ambiente: (v.access_token ?? '').startsWith('TEST-') ? 'sandbox' : 'production',
        idExterno: textoDe(d?.id),
      } : undefined);
    }
    case 'stripe': {
      const r = await llamar(fetchImpl, 'https://api.stripe.com/v1/account', { headers: { Authorization: `Bearer ${v.secret_key}` } });
      if (!r || !r.ok) return porRespuesta(r, ['secret_key']);
      const d = await leerJson(r);
      const perfil = (d?.business_profile ?? {}) as Record<string, unknown>;
      const panel = (((d?.settings ?? {}) as Record<string, unknown>).dashboard ?? {}) as Record<string, unknown>;
      const nombre = textoDe(perfil.name) ?? textoDe(panel.display_name) ?? textoDe(d?.email) ?? textoDe(d?.id);
      return porRespuesta(r, ['secret_key'], nombre ? {
        nombre,
        correo: textoDe(d?.email),
        pais: textoDe(d?.country),
        ambiente: /^(sk|rk)_live_/.test(v.secret_key ?? '') ? 'production' : 'sandbox',
        idExterno: textoDe(d?.id),
      } : undefined);
    }
    case 'paypal': {
      const base = ambiente === 'production' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
      const basic = Buffer.from(`${v.client_id}:${v.client_secret}`).toString('base64');
      const r = await llamar(fetchImpl, `${base}/v1/oauth2/token`, {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials',
      });
      if (!r || !r.ok) return porRespuesta(r, ['client_id', 'client_secret']);
      // El token de PayPal no trae el nombre del negocio: se muestra la app y el ambiente.
      const app = textoDe((await leerJson(r))?.app_id);
      return porRespuesta(r, ['client_id', 'client_secret'], app ? { nombre: app, ambiente, idExterno: app } : undefined);
    }
    case 'payu': {
      const url = ambiente === 'production'
        ? 'https://api.payulatam.com/payments-api/4.0/service.cgi'
        : 'https://sandbox.api.payulatam.com/payments-api/4.0/service.cgi';
      const r = await llamar(fetchImpl, url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ test: ambiente !== 'production', language: 'es', command: 'PING', merchant: { apiLogin: v.api_login, apiKey: v.api_key } }),
      });
      if (!r || !r.ok) return porRespuesta(r, ['api_key', 'api_login']);
      // PayU responde 200 también cuando rechaza: manda `code`.
      try {
        const json = (await r.json()) as { code?: unknown };
        // El PING de PayU no trae el nombre del comercio: se muestra el id de comercio y el ambiente.
        return json?.code === 'SUCCESS'
          ? {
              resultado: 'correcta',
              http: r.status,
              verificado: ['api_key', 'api_login'],
              cuenta: v.merchant_id ? { nombre: 'PayU ' + v.merchant_id, ambiente, idExterno: v.merchant_id } : undefined,
            }
          : { resultado: 'rechazada', http: r.status, verificado: ['api_key', 'api_login'] };
      } catch {
        return { resultado: 'sin_respuesta', http: r.status, verificado: ['api_key', 'api_login'] };
      }
    }
    case 'sendgrid': {
      const r = await llamar(fetchImpl, 'https://api.sendgrid.com/v3/scopes', { headers: { Authorization: `Bearer ${v.api_key}` } });
      if (!r || !r.ok) return porRespuesta(r, ['api_key']);
      // Perfil de la cuenta (opcional: una llave restringida puede no tener permiso de leerlo).
      const perfil = await llamar(fetchImpl, 'https://api.sendgrid.com/v3/user/profile', { headers: { Authorization: `Bearer ${v.api_key}` } });
      const d = perfil && perfil.ok ? await leerJson(perfil) : null;
      const persona = [textoDe(d?.first_name), textoDe(d?.last_name)].filter(Boolean).join(' ');
      const nombre = textoDe(d?.company) ?? (persona || null) ?? textoDe(v.from_email) ?? 'SendGrid';
      return porRespuesta(r, ['api_key'], { nombre, pais: textoDe(d?.country), correo: textoDe(v.from_email), ambiente: 'production' });
    }
    default:
      return { resultado: 'sin_prueba', verificado: [] };
  }
}
