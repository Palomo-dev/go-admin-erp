/**
 * Permisos del módulo de productos resueltos EN EL SERVIDOR (regla dura 6):
 * super admin / rol 1-2, o alguno de los códigos por rol o cargo
 * (`check_user_permission`), con el usuario y la organización de la sesión.
 * Mismos códigos que usa el GO Assistant para la carga masiva
 * (`src/lib/ai/agent/tools/cargaMasiva.ts`).
 */

import { hasOrgAdminOrPermission, type ServerOrgContext } from '@/lib/utils/orgContext';

type Sujeto = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'roleId' | 'isSuperAdmin' | 'supabase'>;

async function alguno(ctx: Sujeto, codigos: string[]): Promise<boolean> {
  for (const codigo of codigos) {
    if (await hasOrgAdminOrPermission(ctx, codigo)) return true;
  }
  return false;
}

/** Crear/actualizar productos en bloque (importar archivo o web). */
export function puedeImportarProductos(ctx: Sujeto): Promise<boolean> {
  return alguno(ctx, ['inventory.create', 'inventory_management', 'product_management']);
}

/** Regenerar el token del feed o cambiar su moneda (afecta a lo que ve Meta). */
export function puedeGestionarFeedMeta(ctx: Sujeto): Promise<boolean> {
  return alguno(ctx, ['integrations.edit', 'inventory.edit', 'inventory_management', 'product_management']);
}
