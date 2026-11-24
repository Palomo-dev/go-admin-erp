/**
 * Cliente (navegador) de las rutas de logística que hacen falta además de las RPC: avisos al
 * cliente, fin de jornada y alta de domiciliarios. La organización viaja solo como cabecera de
 * contexto (`x-organization-id`); el servidor la contrasta con la sesión y resuelve los permisos.
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { estadoPedidoDelAviso, type EnvioDomiciliario } from '@/lib/logistica/misEnvios';
import type { AltaDomiciliario } from '@/lib/logistica/domiciliarios';
import type { CandidatosAlta, DomiciliarioFila } from '@/lib/services/logistica/domiciliariosService';

function cabeceras(json: boolean): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  const org = Number(getOrganizationId()) || null;
  if (org) h['x-organization-id'] = String(org);
  return h;
}

export class LogisticaApiError extends Error {
  constructor(public readonly codigo: string, public readonly status: number) {
    super(codigo);
    this.name = 'LogisticaApiError';
  }
}

async function pedir<T>(url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init, headers: { ...cabeceras(!!init.body), ...(init.headers ?? {}) } });
  let cuerpo: Record<string, unknown> = {};
  try {
    cuerpo = await r.json();
  } catch {
    cuerpo = {};
  }
  if (!r.ok) throw new LogisticaApiError(typeof cuerpo.code === 'string' ? cuerpo.code : 'error', r.status);
  return cuerpo as T;
}

/**
 * Avisa al cliente del pedido web tras una RPC que devolvió `aviso` (en camino, entregado,
 * novedad). Usa la ruta de siempre (`/api/web-orders/[id]/aviso-estado`): mismos canales, ajustes y
 * registro que «Pedidos online». Nunca lanza: un aviso que no sale no deshace la entrega.
 *
 * - `en_camino` / `entregado`: `{ estado }` (la ruta solo avisa si el pedido está en ese estado).
 * - `novedad` (intento fallido): `{ momento: 'novedad' }`; la ruta arma el texto con el motivo
 *   GUARDADO en el envío (`shipments.exception_reason`), nunca con uno del navegador.
 */
export async function avisarCliente(envio: Pick<EnvioDomiciliario, 'source_type' | 'source_id'>, aviso: string | null | undefined): Promise<boolean> {
  if (envio.source_type !== 'web_order' || !envio.source_id) return false;
  const estado = estadoPedidoDelAviso(aviso);
  const cuerpo = aviso === 'novedad' ? { momento: 'novedad' } : estado ? { estado } : null;
  if (!cuerpo) return false;
  try {
    await pedir(`/api/web-orders/${encodeURIComponent(envio.source_id)}/aviso-estado`, { method: 'POST', body: JSON.stringify(cuerpo) });
    return true;
  } catch {
    return false;
  }
}

/** «Enviar resumen para el cuadre»: cierra la jornada del domiciliario de la sesión. */
export const cerrarJornada = () => pedir<{ ok: true; finJornadaAt: string }>('/api/logistica/mis-envios/fin-jornada', { method: 'POST' });

export const registrarDomiciliario = (alta: AltaDomiciliario) =>
  pedir<{ domiciliario: DomiciliarioFila }>('/api/logistica/domiciliarios', { method: 'POST', body: JSON.stringify(alta) });

export const leerCandidatos = () => pedir<CandidatosAlta>('/api/logistica/domiciliarios/candidatos');

export const cambiarActivoDomiciliario = (id: string, activo: boolean) =>
  pedir<{ ok: true }>(`/api/logistica/domiciliarios/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ activo }) });
