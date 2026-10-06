/**
 * Cliente (navegador) de /api/pos/avisos-cliente/* y de los avisos de un
 * pedido. La organización viaja solo como cabecera de contexto
 * (`x-organization-id`); el servidor la contrasta con la sesión.
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { AjustesAvisos, CanalAviso, EstadoRegistroAviso, MomentoAviso } from '@/lib/pos/pedidosWeb/avisosCliente';

function cabeceras(json: boolean): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  const org = Number(getOrganizationId()) || null;
  if (org) h['x-organization-id'] = String(org);
  return h;
}

export class AvisosError extends Error {
  constructor(public readonly codigo: string, public readonly status: number) {
    super(codigo);
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
  if (!r.ok) throw new AvisosError(typeof cuerpo.codigo === 'string' ? cuerpo.codigo : 'error', r.status);
  return cuerpo as T;
}

export interface RespuestaAjustes {
  ajustes: AjustesAvisos;
  disponible: boolean;
  guardados: boolean;
  puedeEditar: boolean;
}

export const leerAjustes = () => pedir<RespuestaAjustes>('/api/pos/avisos-cliente');

export const guardarAjustes = (ajustes: AjustesAvisos) =>
  pedir<{ ok: true }>('/api/pos/avisos-cliente', { method: 'PUT', body: JSON.stringify(ajustes) });

export interface VistaPrevia {
  pedido: string;
  de: string;
  para: string;
  asunto: string;
  texto: string;
}

export const leerVistaPrevia = (momento: MomentoAviso) =>
  pedir<VistaPrevia>(`/api/pos/avisos-cliente/vista-previa?momento=${encodeURIComponent(momento)}`);

export const enviarPrueba = (momento: MomentoAviso) =>
  pedir<{ ok: true; para: string }>('/api/pos/avisos-cliente/prueba', { method: 'POST', body: JSON.stringify({ momento }) });

export interface AvisoDePedido {
  id: string;
  moment: MomentoAviso;
  channel: CanalAviso;
  status: EstadoRegistroAviso;
  recipient: string | null;
  detail: string | null;
  created_at: string;
}

export const leerAvisosPedido = (orderId: string) =>
  pedir<{ avisos: AvisoDePedido[]; disponible: boolean }>(`/api/web-orders/${encodeURIComponent(orderId)}/avisos`);

export const reenviarAviso = (orderId: string, canal: CanalAviso) =>
  pedir<{ success: boolean; enviado: boolean }>(`/api/web-orders/${encodeURIComponent(orderId)}/aviso-estado`, {
    method: 'POST',
    body: JSON.stringify({ canal }),
  });
