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
  /** Nombre del comercio o cuenta, si el proveedor lo da. */
  cuenta?: string;
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

function porRespuesta(r: Response | null, verificado: string[], cuenta?: string): Prueba {
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
  let cuenta: string | undefined;
  try {
    const json = (await comercio.json()) as { data?: { name?: unknown } };
    cuenta = typeof json?.data?.name === 'string' ? json.data.name : undefined;
  } catch {
    cuenta = undefined;
  }
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
      return porRespuesta(r, ['access_token']);
    }
    case 'stripe': {
      const r = await llamar(fetchImpl, 'https://api.stripe.com/v1/balance', { headers: { Authorization: `Bearer ${v.secret_key}` } });
      return porRespuesta(r, ['secret_key']);
    }
    case 'paypal': {
      const base = ambiente === 'production' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
      const basic = Buffer.from(`${v.client_id}:${v.client_secret}`).toString('base64');
      const r = await llamar(fetchImpl, `${base}/v1/oauth2/token`, {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials',
      });
      return porRespuesta(r, ['client_id', 'client_secret']);
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
        return json?.code === 'SUCCESS'
          ? { resultado: 'correcta', http: r.status, verificado: ['api_key', 'api_login'] }
          : { resultado: 'rechazada', http: r.status, verificado: ['api_key', 'api_login'] };
      } catch {
        return { resultado: 'sin_respuesta', http: r.status, verificado: ['api_key', 'api_login'] };
      }
    }
    case 'sendgrid': {
      const r = await llamar(fetchImpl, 'https://api.sendgrid.com/v3/scopes', { headers: { Authorization: `Bearer ${v.api_key}` } });
      return porRespuesta(r, ['api_key']);
    }
    default:
      return { resultado: 'sin_prueba', verificado: [] };
  }
}
