/**
 * Cliente HTTP de las integraciones: timeout siempre, y reintento SOLO si la operación es
 * idempotente (consultar, cotizar, rastrear). Crear una guía o un pedido no se reintenta aquí:
 * la idempotencia la da el envío (shipment_id) en quien llama, para no generar dos guías.
 *
 * Traduce los fallos a errores tipados: 401/403 → AuthError, 429 → RateLimitError,
 * red/timeout/5xx → ProviderUnavailableError. El resto se devuelve al adaptador, que sabe leer
 * el cuerpo de error de su proveedor.
 */
import { AuthError, ProviderUnavailableError, RateLimitError } from './errores';

export interface OpcionesSolicitud {
  proveedor: string;
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  /** Solo las operaciones sin efecto (o con su propia clave de idempotencia) se reintentan. */
  idempotente: boolean;
  reintentos?: number;
  /** Inyectable en tests. */
  fetchImpl?: typeof fetch;
  esperarImpl?: (ms: number) => Promise<void>;
}

export interface RespuestaHttp {
  status: number;
  headers: Headers;
  texto: string;
}

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function solicitar(op: OpcionesSolicitud): Promise<RespuestaHttp> {
  const fetchImpl = op.fetchImpl ?? fetch;
  const dormir = op.esperarImpl ?? esperar;
  const maxIntentos = op.idempotente ? Math.max(1, (op.reintentos ?? 2) + 1) : 1;
  const timeoutMs = op.timeoutMs ?? 20_000;
  let ultimoError: unknown;

  for (let intento = 1; intento <= maxIntentos; intento++) {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), timeoutMs);
    try {
      const res = await fetchImpl(op.url, {
        method: op.method ?? 'POST',
        headers: op.headers,
        body: op.body,
        signal: control.signal,
        cache: 'no-store',
      });
      const texto = await res.text();
      if (res.status === 401 || res.status === 403) throw new AuthError(op.proveedor, undefined, { status: res.status });
      if (res.status === 429) {
        const espera = Number(res.headers.get('retry-after'));
        const error = new RateLimitError(op.proveedor, Number.isFinite(espera) ? espera * 1000 : undefined, { status: 429 });
        if (intento < maxIntentos) { ultimoError = error; await dormir(error.reintentarEnMs ?? 1000 * intento); continue; }
        throw error;
      }
      if (res.status >= 500) {
        const error = new ProviderUnavailableError(op.proveedor, undefined, { status: res.status });
        if (intento < maxIntentos) { ultimoError = error; await dormir(500 * intento); continue; }
        throw error;
      }
      return { status: res.status, headers: res.headers, texto };
    } catch (err) {
      if (err instanceof AuthError || err instanceof RateLimitError || err instanceof ProviderUnavailableError) throw err;
      // Red caída o timeout (AbortError).
      ultimoError = err;
      if (intento < maxIntentos) { await dormir(500 * intento); continue; }
      const timeout = err instanceof Error && err.name === 'AbortError';
      throw new ProviderUnavailableError(
        op.proveedor,
        timeout ? 'El proveedor tardó demasiado en responder.' : undefined,
        { motivo: timeout ? 'timeout' : 'red' },
        err,
      );
    } finally {
      clearTimeout(reloj);
    }
  }
  throw new ProviderUnavailableError(op.proveedor, undefined, { motivo: 'sin_respuesta' }, ultimoError);
}
