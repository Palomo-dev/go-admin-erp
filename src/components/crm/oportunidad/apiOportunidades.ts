/**
 * Escrituras y lecturas de oportunidades desde el navegador, SIEMPRE por las
 * rutas del servidor de la ola 1 (guardarraíl 36): `/api/crm/opportunities/**`.
 * Cada escritura emite `crm:entity-changed` para que tablero, lista, drawer,
 * detalle, Leads, Actividades y la ficha se refresquen con un solo evento.
 */
import { emitirCambioCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { MotivoPerdida } from '@/components/crm/kit/loseDialogLogica';
import type { ScoreResult } from '@/lib/services/crm/scoringCalculo';
import type { OportunidadApi } from './oportunidadLogica';

const base = (id: string) => `/api/crm/opportunities/${encodeURIComponent(id)}`;

async function escribir<T>(url: string, method: string, cuerpo: unknown, accion: string, id?: string | null): Promise<T> {
  const { data } = await pedirCrm<T>(url, { method, cuerpo });
  emitirCambioCrm({ entidad: 'opportunity', id: id ?? null, accion });
  return data;
}

export interface CuerpoEtapa {
  stage_id: string;
  override?: boolean;
  override_reason?: string;
}

/** `PATCH …/stage`: gate, permisos (`edit`/`close`/`override_gate`) y bloqueo por el servidor. */
export function moverEtapa(id: string, cuerpo: CuerpoEtapa) {
  return escribir<{ opportunity?: Partial<OportunidadApi> }>(`${base(id)}/stage`, 'PATCH', cuerpo, 'mover', id);
}

/** `POST …/win`: SIEMPRE a la etapa `is_won` (la indicada o la primera). */
export function ganarOportunidad(id: string, cuerpo: { won_data: Record<string, unknown>; stage_id?: string; override?: boolean }) {
  return escribir<{ opportunity?: Partial<OportunidadApi> }>(`${base(id)}/win`, 'POST', cuerpo, 'ganar', id);
}

/** `POST …/lose`: SIEMPRE a la etapa `is_lost` con el motivo del catálogo. */
export function perderOportunidad(id: string, cuerpo: { loss_data: Record<string, unknown>; stage_id?: string; override?: boolean }) {
  return escribir<{ opportunity?: Partial<OportunidadApi> }>(`${base(id)}/lose`, 'POST', cuerpo, 'perder', id);
}

/** `PATCH …/[id]` (RPC `crm_update_opportunity`): sin etapa, estado ni cierre. */
export function editarOportunidad(id: string, cuerpo: Record<string, unknown>) {
  return escribir<OportunidadApi>(base(id), 'PATCH', cuerpo, 'editar', id);
}

/** `POST /api/crm/opportunities` (RPC `crm_create_opportunity`). */
export function crearOportunidad(cuerpo: Record<string, unknown>) {
  return escribir<OportunidadApi>('/api/crm/opportunities', 'POST', cuerpo, 'crear');
}

/** `DELETE …/[id]` (RPC con guarda: ganada o con documentos → 409). */
export function eliminarOportunidad(id: string) {
  return escribir<unknown>(base(id), 'DELETE', undefined, 'eliminar', id);
}

/** `PUT …/customer` (CustomerLinkPicker). */
export function vincularCliente(id: string, customerId: string | null) {
  return escribir<OportunidadApi>(`${base(id)}/customer`, 'PUT', { customer_id: customerId }, 'vincular', id);
}

/** `PUT …/score`: el servidor calcula con la configuración de la organización. */
export function puntuarOportunidad(id: string, answers: { key: string; value: string }[]) {
  return escribir<ScoreResult>(`${base(id)}/score`, 'PUT', { answers }, 'puntuar', id);
}

/** `PATCH …/seguimiento`: próximo paso, temperatura, canal y resultado del último contacto. */
export function guardarSeguimiento(id: string, cuerpo: Record<string, unknown>) {
  return escribir<Partial<OportunidadApi>>(`${base(id)}/seguimiento`, 'PATCH', cuerpo, 'seguimiento', id);
}

export const CANALES_CONTACTO = ['call', 'email', 'whatsapp', 'meeting', 'visit'] as const;
export const RESULTADOS_CONTACTO = ['reached', 'no_answer', 'left_voicemail', 'callback_scheduled', 'qualified', 'not_interested', 'objection'] as const;

export async function leerOportunidad(id: string, signal?: AbortSignal) {
  return (await pedirCrm<OportunidadDetalleApi>(base(id), { signal })).data;
}

export async function leerMotivosPerdida(): Promise<MotivoPerdida[]> {
  return (await pedirCrm<MotivoPerdida[]>('/api/crm/loss-reasons')).data ?? [];
}

/** Copia para «Duplicar»: mismos datos comerciales y líneas, nombre «(copia)», nace abierta. */
export function cuerpoDuplicado(op: OportunidadDetalleApi, sufijo: string): Record<string, unknown> {
  return {
    name: `${op.name} ${sufijo}`.slice(0, 255),
    customer_id: op.customer_id,
    pipeline_id: op.pipeline_id,
    amount: Number(op.amount) || 0,
    currency: op.currency,
    expected_close_date: op.expected_close_date ?? null,
    salesperson_id: op.salesperson_id,
    temperature: op.temperature ?? null,
    source: op.source ?? null,
    origen: 'general',
    products: (op.opportunity_products ?? []).map((p) => ({ product_id: p.product_id, quantity: Number(p.quantity) || 1, unit_price: Number(p.unit_price) || 0 })),
    custom_lines: (op.opportunity_custom_lines ?? []).map((c) => ({ concept: c.concept, quantity: Number(c.quantity) || 1, unit_price: Number(c.unit_price) || 0 })),
    spaces: (op.opportunity_spaces ?? []).map((s) => ({ space_id: s.space_id, nights: Number(s.nights) || 1, unit_price: Number(s.unit_price) || 0 })),
  };
}

export interface LineaProductoApi {
  id: string;
  product_id: number;
  quantity: number | string | null;
  unit_price: number | string | null;
  total_price?: number | string | null;
  producto?: { name?: string | null; sku?: string | null } | null;
}

export interface LineaLibreApi {
  id: string;
  concept: string;
  quantity: number | string | null;
  unit_price: number | string | null;
  total_price?: number | string | null;
}

export interface LineaEspacioApi {
  id: string;
  space_id: string;
  nights: number | string | null;
  unit_price: number | string | null;
  total_price?: number | string | null;
  espacio?: { label?: string | null } | null;
}

export interface ClienteDetalleApi {
  id: string;
  full_name: string | null;
  customer_type: string | null;
  doc_type?: string | null;
  doc_number?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  avatar_url?: string | null;
  lifecycle_stage?: string | null;
  created_at?: string | null;
  do_not_call?: boolean | null;
}

export interface OportunidadDetalleApi extends OportunidadApi {
  source?: string | null;
  contact_result?: string | null;
  commission_rate?: number | string | null;
  commission_type?: string | null;
  vertical_id?: string | null;
  sales_team_id?: string | null;
  territory_id?: string | null;
  win_data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  discovery_data?: Record<string, unknown> | null;
  billing_cycle_months?: number | null;
  organization_id?: number;
  opportunity_products?: LineaProductoApi[] | null;
  opportunity_custom_lines?: LineaLibreApi[] | null;
  opportunity_spaces?: LineaEspacioApi[] | null;
  cliente?: ClienteDetalleApi | null;
  pipeline?: { id: string; name: string; pipeline_type?: string | null } | null;
}
