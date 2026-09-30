/**
 * CRM ola 1 — escritura de oportunidades por el servidor (plan §4.7, M4).
 *
 * Única puerta de alta, edición y borrado de oportunidades: las RPC
 * transaccionales `crm_create_opportunity`, `crm_update_opportunity` y
 * `crm_delete_opportunity` (migración 20260930160600), que exigen el permiso,
 * validan pertenencia a la organización, aplican las líneas por diferencia y
 * escriben la actividad «creada». Este módulo valida la FORMA del cuerpo (400
 * antes de llegar a la base) y resuelve quién puede tocar QUÉ oportunidad
 * (propia o `edit_any`) para los flujos que no pasan por esas RPC (etapa,
 * ganar, perder).
 *
 * D2: `record_type` no se acepta en el cuerpo; la RPC siempre crea 'deal'.
 * D4: la prioridad es `temperature` (cold|warm|hot).
 * D8: el POS no abre oportunidades (no hay origen `pos`).
 */

import { z } from 'zod';
import { OPPORTUNITY_DEAL_TYPES } from './leadCreateService';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, tienePermisoCrm, type CrmPermiso, type CrmSesion } from './crmRouteSupport';

export const OPORTUNIDAD_ORIGENES = ['general', 'cliente', 'factura', 'conversacion', 'lead'] as const;
export type OrigenOportunidad = (typeof OPORTUNIDAD_ORIGENES)[number];

const uuid = z.string().uuid();
const uuidONull = uuid.nullable();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha YYYY-MM-DD');

const lineaProducto = z
  .object({
    id: uuid.optional(),
    product_id: z.number().int().positive(),
    quantity: z.number().positive().max(1_000_000).optional(),
    unit_price: z.number().min(0).optional(),
  })
  .strict();

const lineaLibre = z
  .object({
    id: uuid.optional(),
    concept: z.string().trim().min(1).max(500),
    quantity: z.number().positive().max(1_000_000).optional(),
    unit_price: z.number().min(0).optional(),
  })
  .strict();

/** Campos editables de una oportunidad (alta y edición). */
const camposEditables = {
  name: z.string().trim().min(1).max(255),
  customer_id: uuidONull,
  amount: z.number().min(0).max(1e13),
  currency: z.string().regex(/^[A-Za-z]{3}$/).nullable(),
  expected_close_date: fecha.nullable(),
  source: z.string().trim().max(60).nullable(),
  deal_type: z.enum(OPPORTUNITY_DEAL_TYPES).nullable(),
  salesperson_id: uuidONull,
  temperature: z.enum(['cold', 'warm', 'hot']).nullable(),
  next_contact_at: z.string().datetime({ offset: true }).nullable(),
  next_action: z.string().trim().max(500).nullable(),
  commission_type: z.enum(['salesperson', 'intermediation_sale', 'none']),
  commission_rate: z.number().min(0).max(100),
  branch_id: z.number().int().positive().nullable(),
  vertical_id: uuidONull,
  sales_team_id: uuidONull,
  territory_id: uuidONull,
  billing_cycle_months: z.number().int().min(1).max(120).nullable(),
  discovery_data: z.record(z.unknown()),
  metadata: z.record(z.unknown()),
  products: z.array(lineaProducto).max(200),
  custom_lines: z.array(lineaLibre).max(200),
};

export const oportunidadAltaSchema = z
  .object({
    ...camposEditables,
    pipeline_id: uuid,
    stage_id: uuid,
    origen: z.enum(OPORTUNIDAD_ORIGENES),
    origen_ref: z.record(z.unknown()),
  })
  .partial()
  .required({ name: true })
  .strict();

export const oportunidadEdicionSchema = z
  .object({ ...camposEditables, expected_updated_at: z.string().datetime({ offset: true }) })
  .partial()
  .strict();

export type OportunidadAlta = z.infer<typeof oportunidadAltaSchema>;
export type OportunidadEdicion = z.infer<typeof oportunidadEdicionSchema>;

/** Alta transaccional (la RPC exige `crm.opportunities.create`). Lanza el error de la RPC. */
export async function crearOportunidad(ctx: CrmSesion, datos: OportunidadAlta): Promise<Record<string, unknown>> {
  const { data, error } = await ctx.supabase.rpc('crm_create_opportunity', { p_org: ctx.organizationId, p_data: datos });
  if (error) throw error;
  return data as Record<string, unknown>;
}

/** Edición (propia o `edit_any`; la RPC lo decide). `expected_updated_at` → bloqueo optimista. */
export async function actualizarOportunidad(ctx: CrmSesion, id: string, datos: OportunidadEdicion): Promise<Record<string, unknown>> {
  const { expected_updated_at, ...resto } = datos;
  const { data, error } = await ctx.supabase.rpc('crm_update_opportunity', {
    p_org: ctx.organizationId,
    p_id: id,
    p_data: resto,
    p_expected_updated_at: expected_updated_at ?? null,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}

/** Borrado con guarda (ganada o con documentos → 409) y limpieza. */
export async function eliminarOportunidad(ctx: CrmSesion, id: string): Promise<Record<string, unknown>> {
  const { data, error } = await ctx.supabase.rpc('crm_delete_opportunity', { p_org: ctx.organizationId, p_id: id });
  if (error) throw error;
  return data as Record<string, unknown>;
}

export interface OportunidadAcceso {
  id: string;
  pipeline_id: string;
  stage_id: string;
  status: string | null;
  customer_id: string | null;
  salesperson_id: string | null;
  created_by: string | null;
}

/**
 * Carga la oportunidad de la organización de la sesión y comprueba que el
 * usuario pueda EDITARLA: `edit_any`, o `edit` siendo responsable o creador.
 * `extra` añade permisos obligatorios (p. ej. `close` para ganar o perder).
 * 404 si no existe en la organización; 403 si no es suya o le falta permiso.
 */
export async function cargarOportunidadEditable(
  ctx: CrmSesion,
  id: string,
  etiqueta: string,
  extra: readonly CrmPermiso[] = [],
): Promise<OportunidadAcceso> {
  const { data, error } = await ctx.supabase
    .from('opportunities')
    .select('id, pipeline_id, stage_id, status, customer_id, salesperson_id, created_by')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new CrmHttpError(404, 'oportunidad_no_encontrada', 'Oportunidad no encontrada');
  const opp = data as OportunidadAcceso;

  if (!(await tienePermisoCrm(ctx, CRM_PERMISOS.oportunidadesEditarCualquiera))) {
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesEditar], etiqueta);
    if (opp.salesperson_id !== ctx.userId && opp.created_by !== ctx.userId) {
      console.warn('[crm] %s sobre oportunidad ajena sin edit_any (org %s)', etiqueta, ctx.organizationId);
      throw new CrmHttpError(403, 'no_es_propia', 'Solo puedes modificar tus oportunidades');
    }
  }
  for (const p of extra) await exigirPermisoCrm(ctx, [p], etiqueta);
  return opp;
}
