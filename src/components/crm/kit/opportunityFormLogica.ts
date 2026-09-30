/**
 * Lógica de `OpportunityForm` (Figma 766:448739), el formulario ÚNICO de
 * oportunidad. Sin React.
 *
 * `Layout` (page · dialog · sheet) solo cambia la presentación. `Origen`
 * decide qué llega prellenado y **bloqueado**:
 *
 * - general: nada;
 * - cliente (ficha del cliente), lead (Leads › Calificar) y conversación
 *   (chat): el cliente;
 * - factura (Finanzas): cliente, monto y moneda (las líneas se copian).
 *
 * El cuerpo que arma `cuerpoAlta` / `cuerpoEdicion` es el que validan
 * `POST` y `PATCH /api/crm/opportunities` (ola 1, `opportunityWriteService`,
 * RPC `crm_create_opportunity` / `crm_update_opportunity`). Columnas de
 * `opportunities` verificadas por MCP el 2026-09-29. D4: la «Prioridad»
 * (Baja · Media · Alta) es `temperature` (cold · warm · hot).
 */
import { parsearMonto } from './camposCrm';
import { deFechaHoraLocal } from './fechasCrm';
import type { Temperatura } from './opportunityCardLogica';

/** Espejo de `OPORTUNIDAD_ORIGENES` del servicio de escritura (D8: sin `pos`). */
export const ORIGENES_FORMULARIO = ['general', 'cliente', 'factura', 'conversacion', 'lead'] as const;
export type OrigenFormulario = (typeof ORIGENES_FORMULARIO)[number];
export type LayoutFormulario = 'page' | 'dialog' | 'sheet';
export type ModoFormulario = 'create' | 'edit';

export interface ValoresOportunidad {
  customer_id: string;
  name: string;
  pipeline_id: string;
  stage_id: string;
  /** Texto como lo escribe el usuario («12.500.000»). */
  amount: string;
  currency: string;
  /** `date` (YYYY-MM-DD) o ''. */
  expected_close_date: string;
  salesperson_id: string;
  /** `datetime-local` en la hora de la organización («2026-09-24T10:00») o ''. */
  next_contact_at: string;
  next_action: string;
  temperature: Temperatura | '';
  source: string;
  discovery_data: Record<string, unknown>;
}

export type CampoOportunidad = keyof ValoresOportunidad;

/** Etapa elegible del formulario (`stages`). */
export interface EtapaFormulario {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  probability: number | null;
  is_won?: boolean | null;
  is_lost?: boolean | null;
}

const BLOQUEADOS: Record<OrigenFormulario, readonly CampoOportunidad[]> = {
  general: [],
  cliente: ['customer_id'],
  lead: ['customer_id'],
  conversacion: ['customer_id'],
  factura: ['customer_id', 'amount', 'currency'],
};

export function camposBloqueados(origen: OrigenFormulario): readonly CampoOportunidad[] {
  return BLOQUEADOS[origen];
}

export function estaBloqueado(origen: OrigenFormulario, campo: CampoOportunidad): boolean {
  return BLOQUEADOS[origen].includes(campo);
}

/** Etapas abiertas (ni ganada ni perdida) del embudo, por `position`. */
export function etapasAbiertas(etapas: readonly EtapaFormulario[], pipelineId: string): EtapaFormulario[] {
  return etapas
    .filter((e) => e.pipeline_id === pipelineId && !e.is_won && !e.is_lost)
    .sort((a, b) => a.position - b.position);
}

/** Primera etapa no terminal: donde nace una oportunidad sin etapa elegida. */
export function etapaInicial(etapas: readonly EtapaFormulario[], pipelineId: string): string {
  return etapasAbiertas(etapas, pipelineId)[0]?.id ?? '';
}

export function valoresIniciales(opciones: {
  monedaBase: string;
  usuarioId?: string | null;
  pipelineId?: string | null;
  etapas?: readonly EtapaFormulario[];
  stageId?: string | null;
  prefill?: Partial<ValoresOportunidad>;
}): ValoresOportunidad {
  const pipeline = opciones.prefill?.pipeline_id || opciones.pipelineId || '';
  const base: ValoresOportunidad = {
    customer_id: '',
    name: '',
    pipeline_id: pipeline,
    stage_id: opciones.stageId || etapaInicial(opciones.etapas ?? [], pipeline),
    amount: '',
    currency: opciones.monedaBase,
    expected_close_date: '',
    salesperson_id: opciones.usuarioId ?? '',
    next_contact_at: '',
    next_action: '',
    temperature: 'warm',
    source: '',
    discovery_data: {},
  };
  const prefill = Object.fromEntries(Object.entries(opciones.prefill ?? {}).filter(([, v]) => v !== undefined && v !== ''));
  return { ...base, ...prefill };
}

/** Probabilidad de la etapa elegida (0–100) o null. */
export function probabilidadDeEtapa(etapas: readonly EtapaFormulario[], stageId: string): number | null {
  const p = etapas.find((e) => e.id === stageId)?.probability;
  return typeof p === 'number' && Number.isFinite(p) ? Math.min(100, Math.max(0, p)) : null;
}

/** Valor ponderado = monto × probabilidad de la etapa. */
export function ponderado(monto: string, probabilidad: number | null): number | null {
  const n = parsearMonto(monto);
  if (n === null || Number.isNaN(n) || probabilidad === null) return null;
  return (n * probabilidad) / 100;
}

export type ErrorCampo = 'obligatorio' | 'montoInvalido' | 'monedaInvalida' | 'fechaInvalida' | 'muyLargo';
export type ErroresOportunidad = Partial<Record<CampoOportunidad, ErrorCampo>>;

export function validarOportunidad(v: ValoresOportunidad): ErroresOportunidad {
  const e: ErroresOportunidad = {};
  if (!v.name.trim()) e.name = 'obligatorio';
  else if (v.name.trim().length > 255) e.name = 'muyLargo';
  if (!v.customer_id) e.customer_id = 'obligatorio';
  if (!v.pipeline_id) e.pipeline_id = 'obligatorio';
  if (!v.stage_id) e.stage_id = 'obligatorio';
  const monto = parsearMonto(v.amount);
  if (monto !== null && (Number.isNaN(monto) || monto < 0)) e.amount = 'montoInvalido';
  if (!/^[A-Za-z]{3}$/.test(v.currency)) e.currency = 'monedaInvalida';
  if (v.expected_close_date && !/^\d{4}-\d{2}-\d{2}$/.test(v.expected_close_date)) e.expected_close_date = 'fechaInvalida';
  if (v.next_contact_at && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v.next_contact_at)) e.next_contact_at = 'fechaInvalida';
  if (v.next_action.trim().length > 500) e.next_action = 'muyLargo';
  return e;
}

const nulo = (s: string) => (s.trim() ? s.trim() : null);

function camposComunes(v: ValoresOportunidad, zona: string) {
  const monto = parsearMonto(v.amount);
  return {
    name: v.name.trim(),
    customer_id: v.customer_id || null,
    amount: monto !== null && !Number.isNaN(monto) ? monto : 0,
    currency: v.currency.toUpperCase(),
    expected_close_date: v.expected_close_date || null,
    salesperson_id: v.salesperson_id || null,
    temperature: v.temperature || null,
    next_contact_at: deFechaHoraLocal(v.next_contact_at, zona),
    next_action: nulo(v.next_action),
    source: nulo(v.source),
    discovery_data: v.discovery_data,
  };
}

/** Cuerpo de `POST /api/crm/opportunities`. `origenRef`: ids del origen (factura, conversación…). */
export function cuerpoAlta(
  v: ValoresOportunidad,
  opciones: { origen: OrigenFormulario; zona: string; origenRef?: Record<string, unknown> },
) {
  return {
    ...camposComunes(v, opciones.zona),
    pipeline_id: v.pipeline_id,
    stage_id: v.stage_id,
    origen: opciones.origen,
    origen_ref: opciones.origenRef ?? {},
  };
}

/**
 * Cuerpo de `PATCH /api/crm/opportunities/[id]`: la etapa no va aquí (se
 * cambia por `…/stage`, con sus requisitos). `expectedUpdatedAt` = bloqueo
 * optimista.
 */
export function cuerpoEdicion(v: ValoresOportunidad, opciones: { zona: string; expectedUpdatedAt?: string | null }) {
  return {
    ...camposComunes(v, opciones.zona),
    ...(opciones.expectedUpdatedAt ? { expected_updated_at: opciones.expectedUpdatedAt } : {}),
  };
}
