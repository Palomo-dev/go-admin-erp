/** Validación única de oportunidades; módulo hoja compartido por rutas y GO Assistant. */
import { z } from 'zod';
import { OPPORTUNITY_DEAL_TYPES } from './opportunityDealTypes';

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

/** CRM ola 3B: espacios del PMS (`opportunity_spaces`), por la misma RPC (migración 20260930210000). */
const lineaEspacio = z
  .object({
    id: uuid.optional(),
    space_id: uuid,
    nights: z.number().int().positive().max(3650).optional(),
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
  spaces: z.array(lineaEspacio).max(200),
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

