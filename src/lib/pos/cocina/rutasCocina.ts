/**
 * Contratos de las rutas /api/pos/cocina/* y /api/pos/notas-rapidas: esquemas
 * del body y traducción de los errores de las RPC a código HTTP + código
 * estable (el cliente lo traduce con next-intl, `posCocina.errores.<codigo>`).
 *
 * Puro (sin Supabase ni Next) para que los tests de las rutas lo compartan.
 */

import { z } from 'zod';
import { ORG_BODY_KEYS } from '@/lib/security/organizationBody';
import { NOTA_MAX } from './lineasCarrito';

export const MOTIVO_MAX = 500;
const UUID = z.string().uuid();

const lineaRonda = z
  .object({
    line_id: UUID,
    product_name: z.string().trim().min(1).max(255),
    quantity: z.number().positive().max(10000),
    station: z.string().max(60).nullable().optional(),
    notes: z.string().max(NOTA_MAX * 2).nullable().optional(),
    is_allergy: z.boolean().optional(),
    variant_data: z.record(z.string(), z.string()).nullable().optional(),
    modifiers: z
      .array(z.object({ name: z.string().max(255), extraPrice: z.number().optional() }).passthrough())
      .max(50)
      .nullable()
      .optional(),
  })
  .strict();

export const rondaSchema = z
  .object({
    cart_id: UUID,
    branch_id: z.number().int().positive(),
    round_key: UUID,
    server_name: z.string().max(120).nullable().optional(),
    legacy_ticket_id: z.number().int().positive().nullable().optional(),
    void_reason: z.string().max(MOTIVO_MAX).nullable().optional(),
    lines: z.array(lineaRonda).max(200),
  })
  .strict();

export type RondaBody = z.infer<typeof rondaSchema>;

export const lineaMesaSchema = z
  .object({
    sale_item_id: UUID,
    cantidad: z.number().min(0).max(10000),
    motivo: z.string().max(MOTIVO_MAX).nullable().optional(),
  })
  .strict();

export const alergiaSchema = z.object({ ticket_id: z.number().int().positive() }).strict();

export const TIPOS_NOTA_RAPIDA = ['kitchen', 'customer', 'allergy'] as const;
export type TipoNotaRapida = (typeof TIPOS_NOTA_RAPIDA)[number];

export const notaRapidaCrearSchema = z
  .object({
    label: z.string().trim().min(1).max(NOTA_MAX),
    kind: z.enum(TIPOS_NOTA_RAPIDA).default('kitchen'),
    branch_id: z.number().int().positive().nullable().optional(),
    display_order: z.number().int().min(0).max(10000).optional(),
  })
  .strict();

export const notaRapidaEditarSchema = z
  .object({
    id: z.number().int().positive(),
    label: z.string().trim().min(1).max(NOTA_MAX).optional(),
    kind: z.enum(TIPOS_NOTA_RAPIDA).optional(),
    display_order: z.number().int().min(0).max(10000).optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

/** El body sin las claves con las que un cliente declararía la organización (ya validadas por readOrgBody). */
export function sinClavesDeOrganizacion(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return body;
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => !(ORG_BODY_KEYS as readonly string[]).includes(key)),
  );
}

const CODIGOS = new Set([
  'sin_membresia',
  'datos_invalidos',
  'sucursal_de_otra_organizacion',
  'ronda_de_otro_carrito',
  'linea_invalida',
  'linea_duplicada',
  'cantidad_invalida',
  'linea_no_encontrada',
  'linea_de_otra_organizacion',
  'motivo_requerido',
  'comanda_no_encontrada',
  'alergia_sin_confirmar',
]);

/** Error de la RPC → { status, codigo }. Un mensaje desconocido nunca sale al cliente. */
export function errorDeRpcCocina(error: { message?: string | null; code?: string | null }): { status: number; codigo: string } {
  const mensaje = (error.message ?? '').trim();
  const codigo = CODIGOS.has(mensaje) ? mensaje : 'error_interno';
  switch (error.code) {
    case 'P0002':
      return { status: 404, codigo };
    case '42501':
      return { status: 403, codigo };
    case '22023':
      return { status: 400, codigo };
    case 'P0001':
      return { status: codigo === 'error_interno' ? 500 : 409, codigo };
    default:
      return { status: 500, codigo: 'error_interno' };
  }
}
