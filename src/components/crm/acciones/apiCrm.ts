/**
 * Llamadas del navegador a las rutas `/api/crm/**` (CRM ola 3A). Toda
 * escritura del CRM pasa por el servidor (guardarraíl 36): aquí solo `fetch`.
 * Sin React: lo usan los hooks y las pantallas, y se prueba con jest.
 */

export class ErrorApiCrm extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: string | null,
    message: string,
    /** Cuerpo JSON de la respuesta (ola 3B: `reason` y `gate` del 409 de etapa). */
    public readonly cuerpo: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = 'ErrorApiCrm';
  }
}

/** Evento que refresca las pantallas tras una acción (plan §4.10: uno solo). */
export const EVENTO_CAMBIO_CRM = 'crm:entity-changed';

export interface DetalleCambioCrm {
  entidad: 'customer' | 'opportunity' | 'activity' | 'note' | 'task' | 'lead';
  id?: string | null;
  accion: string;
}

export function emitirCambioCrm(detalle: DetalleCambioCrm): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent<DetalleCambioCrm>(EVENTO_CAMBIO_CRM, { detail: detalle }));
}

/** GET/POST/PATCH/DELETE con JSON. Lanza `ErrorApiCrm` si `success` no es true. */
export async function pedirCrm<T = unknown>(url: string, init: { method?: string; cuerpo?: unknown; signal?: AbortSignal } = {}): Promise<{ data: T; extra: Record<string, unknown> }> {
  const enviar = async (): Promise<Response> => {
    try { return await fetch(url, {
      method: init.method ?? 'GET',
      headers: init.cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.cuerpo === undefined ? undefined : JSON.stringify(init.cuerpo),
      cache: 'no-store',
      signal: init.signal,
      credentials: 'same-origin',
    }); } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      throw new ErrorApiCrm(0, 'red', e instanceof Error ? e.message : 'red');
    }
  };
  type Cuerpo = ({ success?: boolean; data?: T; error?: string; code?: string } & Record<string, unknown>) | null;
  let res = await enviar();
  let json = (await res.json().catch(() => null)) as Cuerpo;
  // Solo este 401 se produce antes de ejecutar la acción. Resincronizar una
  // vez la sesión con su escritor canónico; un 403 nunca se reintenta.
  if (res.status === 401 && json?.code === 'UNAUTHENTICATED' && typeof window !== 'undefined' && /^\/api\/crm(?:\/|$)/.test(url)) {
    const synced = await import('@/lib/supabase/config').then(m => m.ensureSessionSynced()).catch(() => false);
    if (init.signal?.aborted) throw new DOMException('Solicitud cancelada', 'AbortError');
    if (synced) {
      res = await enviar();
      json = (await res.json().catch(() => null)) as Cuerpo;
    }
  }
  if (!res.ok || !json || json.success === false) {
    throw new ErrorApiCrm(res.status, (json?.code as string | undefined) ?? (json?.reason as string | undefined) ?? null, (json?.error as string | undefined) ?? `HTTP ${res.status}`, json);
  }
  const { data, success: _s, ...extra } = json;
  void _s;
  return { data: data as T, extra };
}

export type ClaveErrorCrm = 'sesionVencida' | 'organizacionCambiada' | 'sinPermiso' | 'noEncontrado' | 'sinEmbudo' | 'conflicto' | 'datos' | 'red' | 'generico';

/** Qué mensaje (clave `crm.accionesRapidas.errores.*`) corresponde a un error. */
export function claveError(e: unknown): ClaveErrorCrm {
  if (!(e instanceof ErrorApiCrm)) return 'generico';
  if (e.status === 0) return 'red';
  if (e.status === 401) return 'sesionVencida';
  if (e.status === 403 && e.codigo === 'ORG_AMBIGUOUS') return 'organizacionCambiada';
  if (e.status === 403) return 'sinPermiso';
  if (e.status === 404) return 'noEncontrado';
  if (e.codigo === 'sin_embudo_ventas') return 'sinEmbudo';
  if (e.status === 409) return 'conflicto';
  if (e.status === 400) return 'datos';
  return 'generico';
}
