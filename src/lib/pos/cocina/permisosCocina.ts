/**
 * Permisos de Comandas y de la pantalla de cocina, resueltos EN EL SERVIDOR
 * (regla dura 6) con el usuario y la organización de la sesión.
 *
 * - `operar`: empezar, marcar lista, entregar, tocar ítems, confirmar alergia,
 *   avisar al mesero (KDS).
 * - `gestionar`: devolver a «Nuevas», cancelar, mover un ítem de estación,
 *   cerrar en bloque las comandas de días anteriores.
 *
 * Los códigos nuevos (`pos.cocina.*`) los crea la migración
 * 20261006190000_cocina_comandas_v2. Mientras nadie los asigne, se aceptan los
 * que hoy dan acceso al POS (`pos.view`, `pos_access`) y a anular (`pos.void`),
 * igual que `fn_pos_cocina_puede` en la base: quien hoy usa la cocina sigue
 * pudiendo.
 */
import { hasOrgAdminOrPermission, type ServerOrgContext } from '@/lib/utils/orgContext';

export type NivelCocina = 'operar' | 'gestionar';

type Sujeto = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'roleId' | 'isSuperAdmin' | 'supabase'>;

export const CODIGOS_COCINA: Record<NivelCocina, readonly string[]> = {
  gestionar: ['pos.cocina.gestionar', 'pos.void'],
  operar: ['pos.cocina.operar', 'pos.cocina.gestionar', 'pos.view', 'pos_access'],
};

export async function puedeCocina(ctx: Sujeto, nivel: NivelCocina): Promise<boolean> {
  for (const codigo of CODIGOS_COCINA[nivel]) {
    if (await hasOrgAdminOrPermission(ctx, codigo)) return true;
  }
  return false;
}
