/**
 * Alcance de sucursal de la persona en la organización de la sesión.
 *
 * Una sola definición para el servidor: la usan `GET /api/me/capacidades`
 * (qué ofrece la UI) y las rutas que ejecutan reportes con una sucursal que
 * llega del cliente (`/api/ai-assistant/reportes`). Es la misma regla que
 * `reporte_exigir_alcance_sucursal` en la base, que es la barrera final.
 *
 * - Admin (`is_super_admin` o `role_id` 1/2, nunca por el nombre del rol): todas.
 * - Sin asignaciones en `member_branches`: todas (coincide con la RLS vigente).
 * - Con asignaciones: solo esas. `accesoTotal` si cubren todas las activas.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isOrgAdminLike } from '@/lib/utils/orgAdmin';
import { OrgContextError } from '@/lib/utils/orgContextError';

export interface AlcanceSucursal {
  esAdmin: boolean;
  /** Sucursales activas de la organización. */
  todas: number[];
  /** Sucursales que puede ver. */
  permitidas: number[];
  /** Consolidado y reportes de toda la organización. */
  accesoTotal: boolean;
}

interface SujetoAlcance {
  organizationId: number;
  roleId: number;
  isSuperAdmin: boolean;
  memberId: number | null;
  supabase: SupabaseClient;
}

export function calcularAlcance(esAdmin: boolean, todas: number[], asignadas: number[]): AlcanceSucursal {
  const sinRestriccion = esAdmin || asignadas.length === 0;
  const permitidas = sinRestriccion ? todas : todas.filter((id) => asignadas.includes(id));
  const accesoTotal = sinRestriccion || todas.every((id) => asignadas.includes(id));
  return { esAdmin, todas, permitidas, accesoTotal };
}

export async function resolverAlcanceSucursal(ctx: SujetoAlcance): Promise<AlcanceSucursal> {
  const esAdmin = isOrgAdminLike(ctx);
  const [sucursales, asignaciones] = await Promise.all([
    ctx.supabase.from('branches').select('id').eq('organization_id', ctx.organizationId).eq('is_active', true),
    ctx.memberId && !esAdmin
      ? ctx.supabase.from('member_branches').select('branch_id').eq('organization_member_id', ctx.memberId)
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (sucursales.error) throw new Error(`No se pudieron leer las sucursales: ${sucursales.error.message}`);
  // Sin poder leer las asignaciones no se asume «sin restricción».
  if (asignaciones.error) throw new Error(`No se pudieron leer las asignaciones de sucursal: ${asignaciones.error.message}`);

  const todas = (sucursales.data ?? []).map((b) => b.id as number);
  const asignadas = (asignaciones.data ?? []).map((a) => a.branch_id as number);
  return calcularAlcance(esAdmin, todas, asignadas);
}

/**
 * Lanza 403 si la sucursal pedida no le corresponde. `null` es el consolidado
 * de todas las sucursales y exige `accesoTotal`.
 */
export function exigirSucursalPermitida(alcance: AlcanceSucursal, branchId: number | null): void {
  if (branchId == null) {
    if (!alcance.accesoTotal) {
      throw new OrgContextError('El consolidado requiere acceso a todas las sucursales', 403, 'BRANCH_SCOPE_REQUIRED');
    }
    return;
  }
  if (!alcance.permitidas.includes(branchId)) {
    throw new OrgContextError('No tienes acceso a esa sucursal', 403, 'BRANCH_FORBIDDEN');
  }
}
