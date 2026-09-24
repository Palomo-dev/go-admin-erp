/**
 * Cliente (navegador) de /api/pos/cocina/* y /api/pos/notas-rapidas.
 *
 * La organización viaja solo como cabecera de contexto (`x-organization-id`,
 * igual que el resto de rutas del POS): el servidor la contrasta con la
 * sesión y nunca la toma del body.
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { LineaRonda, RespuestaRonda } from '@/lib/pos/cocina/lineasCarrito';
import type { TipoNotaRapida } from '@/lib/pos/cocina/rutasCocina';

/** Error de la ruta con su código estable (`posCocina.errores.<codigo>`). */
export class CocinaError extends Error {
  constructor(public readonly codigo: string, public readonly status: number) {
    super(codigo);
    this.name = 'CocinaError';
  }
}

function cabeceras(json: boolean): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  let org: number | null = null;
  try {
    org = Number(getOrganizationId()) || null;
  } catch {
    org = null;
  }
  if (org && org > 0) h['x-organization-id'] = String(org);
  return h;
}

async function leer<T>(respuesta: Response): Promise<T> {
  let cuerpo: { codigo?: string } & Record<string, unknown> = {};
  try {
    cuerpo = await respuesta.json();
  } catch {
    cuerpo = {};
  }
  if (!respuesta.ok) {
    throw new CocinaError(typeof cuerpo.codigo === 'string' ? cuerpo.codigo : 'error_interno', respuesta.status);
  }
  return cuerpo as T;
}

async function enviar<T>(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<T> {
  const respuesta = await fetch(url, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: cabeceras(true),
    body: JSON.stringify(body),
  });
  return leer<T>(respuesta);
}

export interface PeticionRonda {
  cart_id: string;
  branch_id: number;
  round_key: string;
  server_name?: string | null;
  legacy_ticket_id?: number | null;
  void_reason?: string | null;
  lines: LineaRonda[];
}

export async function enviarRondaCocina(peticion: PeticionRonda): Promise<RespuestaRonda> {
  const { resultado } = await enviar<{ resultado: RespuestaRonda }>('/api/pos/cocina/ronda', 'POST', peticion);
  return resultado;
}

export interface ResultadoAjusteMesa {
  accion: 'sin_cambio' | 'cantidad' | 'anulada';
  sale_id: string;
  enviado?: boolean;
  ajuste_ticket_id?: number | null;
}

export async function ajustarLineaMesa(saleItemId: string, cantidad: number, motivo?: string | null): Promise<ResultadoAjusteMesa> {
  const { resultado } = await enviar<{ resultado: ResultadoAjusteMesa }>('/api/pos/cocina/mesa-linea', 'POST', {
    sale_item_id: saleItemId,
    cantidad,
    motivo: motivo ?? null,
  });
  return resultado;
}

export interface ResultadoAlergia {
  ticket_id: number;
  has_allergy: boolean;
  allergy_ack_at: string | null;
  allergy_ack_by: string | null;
}

export async function confirmarAlergia(ticketId: number): Promise<ResultadoAlergia> {
  const { resultado } = await enviar<{ resultado: ResultadoAlergia }>('/api/pos/cocina/alergia', 'POST', { ticket_id: ticketId });
  return resultado;
}

export interface NotaRapida {
  id: number;
  organization_id: number;
  branch_id: number | null;
  label: string;
  kind: TipoNotaRapida;
  display_order: number;
  is_active: boolean;
}

export interface NotasRapidas {
  notas: NotaRapida[];
  sugeridas: Array<{ texto: string; usos: number }>;
  puedeConfigurar: boolean;
}

export async function listarNotasRapidas(branchId: number | null, todas = false): Promise<NotasRapidas> {
  const params = new URLSearchParams();
  if (branchId) params.set('branch_id', String(branchId));
  if (todas) params.set('todas', '1');
  const qs = params.toString();
  const respuesta = await fetch(`/api/pos/notas-rapidas${qs ? `?${qs}` : ''}`, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: cabeceras(false),
  });
  return leer<NotasRapidas>(respuesta);
}

export async function crearNotaRapida(nota: { label: string; kind: TipoNotaRapida; branch_id?: number | null }): Promise<NotaRapida> {
  const { nota: creada } = await enviar<{ nota: NotaRapida }>('/api/pos/notas-rapidas', 'POST', nota);
  return creada;
}

export async function editarNotaRapida(
  id: number,
  cambios: Partial<Pick<NotaRapida, 'label' | 'kind' | 'display_order' | 'is_active'>>,
): Promise<NotaRapida> {
  const { nota } = await enviar<{ nota: NotaRapida }>('/api/pos/notas-rapidas', 'PATCH', { id, ...cambios });
  return nota;
}

export async function borrarNotaRapida(id: number): Promise<void> {
  const respuesta = await fetch(`/api/pos/notas-rapidas?id=${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: cabeceras(false),
  });
  await leer<{ ok: true }>(respuesta);
}
