/**
 * Contrato de `POST /api/inventario/variantes`: las escrituras del catálogo de
 * variantes (B6a). Puro (sin Supabase ni React) para que lo usen la ruta, el
 * cliente del navegador y los tests.
 *
 * La organización NO viaja en el cuerpo: la pone el servidor desde la sesión.
 */
import { z } from 'zod';

const id = z.number().int().positive();
const ids = z.array(id).max(500);
const traducciones = z
  .object({ en: z.string().max(80).optional(), fr: z.string().max(80).optional(), pt: z.string().max(80).optional() })
  .strict();

const datosTipo = z
  .object({
    nombre: z.string().trim().min(1).max(60),
    estilo: z.enum(['texto', 'color', 'imagen']).optional(),
    meta: z.enum(['color', 'size', 'material', 'pattern', 'gender', 'age_group']).nullable().optional(),
    traducciones: traducciones.optional(),
    activo: z.boolean().optional(),
    unificar: z.boolean().optional(),
  })
  .strict();

const datosValor = z
  .object({
    tipo_id: id.optional(),
    valor: z.string().trim().min(1).max(80),
    hex: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .nullable()
      .optional(),
    imagen: z.string().url().max(1000).nullable().optional(),
    sku: z
      .string()
      .regex(/^[A-Za-z0-9]{1,8}$/)
      .nullable()
      .optional(),
    traducciones: traducciones.optional(),
    activo: z.boolean().optional(),
    unificar: z.boolean().optional(),
  })
  .strict();

export const escrituraVariantesSchema = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('tipo_guardar'), id: id.nullable(), datos: datosTipo }).strict(),
  z.object({ accion: z.literal('valor_guardar'), id: id.nullable(), datos: datosValor }).strict(),
  z.object({ accion: z.literal('fusionar_tipos'), ids: ids.min(1), destino: id }).strict(),
  z.object({ accion: z.literal('fusionar_valores'), ids: ids.min(1), destino: id }).strict(),
  z.object({ accion: z.literal('reordenar'), tipo: id.nullable(), ids }).strict(),
  z
    .object({
      accion: z.literal('cambiar'),
      ids: ids.default([]),
      valores: ids.default([]),
      cambios: z.object({ activo: z.boolean().optional(), estilo: z.enum(['texto', 'color', 'imagen']).optional() }).strict(),
    })
    .strict(),
  z.object({ accion: z.literal('eliminar'), ids: ids.default([]), valores: ids.default([]) }).strict(),
  z.object({ accion: z.literal('completar') }).strict(),
  z.object({ accion: z.literal('sugeridos'), ids: ids.optional() }).strict(),
]);

export type EscrituraVariantes = z.input<typeof escrituraVariantesSchema>;
export type AccionVariantes = EscrituraVariantes['accion'];

/** Permiso de inventario que exige cada acción (el mismo que vuelve a exigir la RPC). */
export function permisoDeAccion(accion: AccionVariantes): 'editar_catalogo' | 'eliminar' {
  return accion === 'eliminar' ? 'eliminar' : 'editar_catalogo';
}

/** Estado HTTP para el error de la RPC (código SQLSTATE). */
export function estadoHttpDeError(codigo: string | undefined): number {
  switch (codigo) {
    case '42501':
      return 403;
    case 'P0002':
      return 404;
    case '23505':
    case '23503':
      return 409;
    case '22023':
    case '23502':
    case '22001':
    case '23514':
    case '22P02':
      return 400;
    default:
      return 500;
  }
}

/** Cuerpo de error de la ruta. `codigo` es el mensaje estable de la RPC (`nombre_repetido`, `en_uso`…). */
export interface ErrorRutaVariantes {
  codigo: string;
  sqlstate?: string;
  relacionado?: number | null;
}
