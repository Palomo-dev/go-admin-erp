'use client';

/**
 * Cliente del navegador de los dominios del sitio: solo `fetch`. La
 * organización la resuelve el servidor desde la sesión (la cabecera es la
 * organización activa, que el servidor valida contra la membresía); nunca
 * viaja en el body.
 *
 * - `/api/sitio-web/dominios/**`: lista, detalle, conectar, verificar,
 *   principal, renovación, quitar, subdominio y código de transferencia.
 * - `/api/domains/check|setup-intent|purchase`: el ÚNICO punto de búsqueda y
 *   compra (Stripe + registrador); aquí solo se llaman, no se duplican.
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type {
  CodigoErrorDominio,
  DominioSitio,
  RespuestaConectar,
  RespuestaDetalleDominio,
  RespuestaDominios,
  RespuestaVerificacion,
} from './tiposDominios';

export const RUTA_API_DOMINIOS = '/api/sitio-web/dominios';

export class ErrorApiDominios extends Error {
  constructor(
    public readonly estado: number,
    public readonly codigo: CodigoErrorDominio | 'red' | string,
    mensaje: string,
    public readonly cuerpo: Record<string, unknown> = {},
  ) {
    super(mensaje);
    this.name = 'ErrorApiDominios';
  }

  get esSinPermiso(): boolean {
    return this.estado === 401 || this.estado === 403;
  }
}

async function pedir<T>(ruta: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const org = getOrganizationId();
  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, {
      method: init?.method ?? 'GET',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(org > 0 ? { 'x-organization-id': String(org) } : {}) },
      ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch {
    throw new ErrorApiDominios(0, 'red', 'Revisa tu conexión e inténtalo de nuevo.');
  }
  let cuerpo: Record<string, unknown> = {};
  try {
    cuerpo = ((await respuesta.json()) ?? {}) as Record<string, unknown>;
  } catch {
    cuerpo = {};
  }
  if (!respuesta.ok) {
    const codigo = typeof cuerpo.codigo === 'string' ? cuerpo.codigo : typeof cuerpo.code === 'string' ? cuerpo.code : respuesta.status === 403 ? 'sin_permiso' : 'error_interno';
    const mensaje = typeof cuerpo.error === 'string' ? cuerpo.error : 'No pudimos completar la acción.';
    throw new ErrorApiDominios(respuesta.status, codigo, mensaje, cuerpo);
  }
  return cuerpo as T;
}

const rutaId = (id: string) => `${RUTA_API_DOMINIOS}/${encodeURIComponent(id)}`;

export const apiDominios = {
  /** `sedeId`: la sede de `?sede=`; el servidor la valida y devuelve su nombre en `sede`. */
  listar: (sedeId?: number | null) => pedir<RespuestaDominios>(sedeId ? `${RUTA_API_DOMINIOS}?sede=${sedeId}` : RUTA_API_DOMINIOS),
  detalle: (id: string) => pedir<RespuestaDetalleDominio>(rutaId(id)),
  conectar: (host: string, sedeId?: number | null) => pedir<RespuestaConectar>(RUTA_API_DOMINIOS, { method: 'POST', body: { host, ...(sedeId ? { sedeId } : {}) } }),
  verificar: (id: string) => pedir<RespuestaVerificacion>(`${rutaId(id)}/verificar`, { method: 'POST' }),
  hacerPrincipal: (id: string) => pedir<{ dominio: DominioSitio }>(rutaId(id), { method: 'PATCH', body: { principal: true } }),
  autoRenovar: (id: string, encender: boolean) => pedir<{ dominio: DominioSitio }>(rutaId(id), { method: 'PATCH', body: { autoRenovar: encender } }),
  quitar: (id: string) => pedir<{ ok: true }>(rutaId(id), { method: 'DELETE' }),
  cambiarSubdominio: (subdominio: string) => pedir<{ subdominio: string; host: string }>(`${RUTA_API_DOMINIOS}/subdominio`, { method: 'PUT', body: { subdominio } }),
  codigoTransferencia: (id: string) => pedir<{ correo: string }>(`${rutaId(id)}/codigo-transferencia`, { method: 'POST' }),
};

// ─── Búsqueda y compra (rutas existentes) ────────────────────────────────────

export interface ResultadoBusqueda {
  domain: string;
  available: boolean;
  price: number | null;
  renewalPrice: number | null;
  currency: string;
}

/** POST /api/domains/check. Un 400 «TLD no soportado» llega como no disponible. */
export async function consultarDominio(dominio: string): Promise<ResultadoBusqueda> {
  const r = await pedir<{ success: boolean; data?: ResultadoBusqueda; error?: string }>('/api/domains/check', { method: 'POST', body: { domain: dominio } });
  if (!r.success || !r.data) throw new ErrorApiDominios(500, 'error_interno', r.error ?? 'No pudimos consultar el dominio.');
  return r.data;
}

/** POST /api/domains/setup-intent: SetupIntent de Stripe para la tarjeta. */
export function prepararPago(correo: string, nombre: string) {
  return pedir<{ success: boolean; clientSecret: string; setupIntentId: string }>('/api/domains/setup-intent', {
    method: 'POST',
    body: { email: correo, name: nombre },
  });
}

export interface ContactoRegistrador {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface RespuestaCompra {
  success: true;
  domain: string;
  paymentIntentId: string;
  domainId?: string;
  expiresAt?: string | null;
}

/** POST /api/domains/purchase. Los códigos de error (DOMAIN_ALREADY_REGISTERED, …) llegan en `ErrorApiDominios.codigo`. */
export function comprarDominio(dominio: string, setupIntentId: string, contacto: ContactoRegistrador) {
  return pedir<RespuestaCompra>('/api/domains/purchase', {
    method: 'POST',
    body: { domain: dominio, setupIntentId, contactInfo: contacto },
  });
}

/**
 * Mensaje para la persona: el texto traducido del código si existe; si no, el
 * del servidor (ya en español, sin detalles internos); si no, uno genérico.
 */
export function mensajeDeError(t: (clave: string) => string, error: unknown): string {
  if (error instanceof ErrorApiDominios) {
    const clave = `errores.${error.codigo}`;
    const traducido = t(clave);
    if (traducido !== clave) return traducido;
    if (error.message) return error.message;
  }
  return t('errores.error_interno');
}
