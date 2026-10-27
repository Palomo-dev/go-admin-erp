/**
 * Renovación central de la sesión para las llamadas del navegador a `/api/*`
 * (QA 27-oct, A4).
 *
 * Desde A4 el servidor (`withOrg`/`server-user`) nunca renueva el token: con el
 * access token vencido responde 401 y la renovación es del navegador. Este
 * envoltorio de `window.fetch` lo hace en un solo sitio para las ~170 pantallas
 * que llaman a `/api`: ante un 401 de una ruta `/api/*` del mismo origen,
 * renueva la sesión UNA vez (las peticiones simultáneas comparten la misma
 * renovación) y reintenta la petición UNA vez, con el `Authorization: Bearer`
 * nuevo si la petición original lo llevaba.
 *
 * No reintenta: 401 de credenciales (ver `esRutaDeCredenciales`), otros orígenes, rutas fuera de `/api/`, cuerpos que no se
 * pueden reenviar (streams) ni peticiones que ya son el reintento. Un 401 se
 * produce antes de que la ruta haga nada, así que reenviar un POST es seguro.
 */

type Renovar = () => Promise<string | null>;

const MARCA = '__goadminFetchConRenovacion';
let renovando: Promise<string | null> | null = null;

/** Una sola renovación a la vez: todas las peticiones con 401 esperan la misma. */
export function renovarUnaVez(renovar: Renovar): Promise<string | null> {
  if (!renovando) {
    renovando = renovar()
      .catch(() => null)
      .finally(() => {
        // Se libera en el siguiente tick para que las 401 que llegan juntas compartan el resultado.
        setTimeout(() => {
          renovando = null;
        }, 0);
      });
  }
  return renovando;
}

function urlDe(input: RequestInfo | URL): URL | null {
  try {
    const crudo = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return new URL(crudo, window.location.href);
  } catch {
    return null;
  }
}

export function esApiPropia(input: RequestInfo | URL): boolean {
  if (typeof window === 'undefined') return false;
  const url = urlDe(input);
  return !!url && url.origin === window.location.origin && url.pathname.startsWith('/api/') && !esRutaDeCredenciales(url.pathname);
}

/**
 * Un 401 que responde a una credencial (contraseña mala en el login) no es una sesión vencida: ni
 * se renueva ni se reintenta, para que un intento fallido no cuente doble en el límite de intentos
 * (QA 27-oct, A4). Se reconoce por la ruta del login con contraseña (`/api/auth/acceso`) o porque
 * el cuerpo trae `codigo: 'credenciales'`. El resto de `/api/auth/*` (cambiar contraseña,
 * invitaciones…), la verificación de Twilio y el login de Open Finance sí se renuevan cuando la
 * sesión vence: su 401 es de sesión; un dato malo lo responden con 400.
 */
const RUTAS_DE_CREDENCIALES: readonly RegExp[] = [/^\/api\/auth\/acceso(\/|$)/];

export function esRutaDeCredenciales(pathname: string): boolean {
  return RUTAS_DE_CREDENCIALES.some((r) => r.test(pathname));
}

/** ¿El cuerpo del 401 dice `codigo: 'credenciales'`? Se lee de una copia: la respuesta sigue intacta. */
export async function esRespuestaDeCredenciales(respuesta: Response): Promise<boolean> {
  try {
    if (typeof respuesta.clone !== 'function') return false;
    const cuerpo = (await respuesta.clone().json()) as { codigo?: unknown } | null;
    return !!cuerpo && typeof cuerpo === 'object' && cuerpo.codigo === 'credenciales';
  } catch {
    return false;
  }
}

function cuerpoReenviable(init?: RequestInit): boolean {
  const b = init?.body;
  return b == null || typeof b === 'string' || b instanceof URLSearchParams || b instanceof FormData || b instanceof Blob || b instanceof ArrayBuffer || ArrayBuffer.isView(b);
}

/** Solo para tests: olvida la renovación en curso. */
export function reiniciarRenovacionParaTests(): void {
  renovando = null;
}

/** Envuelve un `fetch` (exportado para los tests). */
export function crearFetchConRenovacion(fetchBase: typeof fetch, renovar: Renovar): typeof fetch {
  return async function fetchConRenovacion(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (!esApiPropia(input) || !cuerpoReenviable(init)) return fetchBase(input, init);
    // Un Request solo se puede leer una vez: se guarda una copia para el reintento.
    const copia = typeof Request !== 'undefined' && input instanceof Request ? input.clone() : null;
    const respuesta = await fetchBase(input, init);
    if (respuesta.status !== 401) return respuesta;
    if (await esRespuestaDeCredenciales(respuesta)) return respuesta;

    const token = await renovarUnaVez(renovar);
    if (!token) return respuesta;

    const cabeceras = new Headers(init?.headers ?? (copia ? copia.headers : undefined));
    if (cabeceras.has('Authorization') && /^Bearer\s/i.test(cabeceras.get('Authorization') ?? '')) {
      cabeceras.set('Authorization', `Bearer ${token}`);
    }
    return fetchBase(copia ?? input, { ...init, headers: cabeceras });
  } as typeof fetch;
}

/** Instala el envoltorio en `window.fetch` una sola vez (idempotente). */
export function instalarFetchConRenovacion(renovar: Renovar): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as Record<string, unknown> & { fetch: typeof fetch };
  if (w[MARCA]) return;
  w[MARCA] = true;
  w.fetch = crearFetchConRenovacion(w.fetch.bind(window), renovar);
}
