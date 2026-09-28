/**
 * Historial de cajas leído EN EL SERVIDOR (`GET /api/pos/cajas/historial`)
 * con la máscara del cierre ciego aplicada antes de salir: quien no tiene
 * `pos.cajas.ver_esperado` en una organización con cierre ciego no recibe
 * `final_amount` ni `difference`, ni puede filtrar u ordenar por ellos.
 * Los filtros de la URL pasan por la lista blanca de `consultaHistorialDeUrl`
 * (historialConsulta.ts).
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { visibilidadImportes } from './cierreCiego';
import { organizacionUsaCierreCiego, resolverPermisosCaja } from './permisosCaja';

type Ctx = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'roleId' | 'isSuperAdmin' | 'supabase'>;

/** ¿Puede ver monto contado y diferencia? (misma regla que el resumen de una caja). */
export async function verImportesHistorial(ctx: Ctx): Promise<boolean> {
  const [permisos, cierreCiego] = await Promise.all([resolverPermisosCaja(ctx), organizacionUsaCierreCiego(ctx)]);
  return visibilidadImportes(cierreCiego, permisos.verEsperadoEnCierreCiego);
}
