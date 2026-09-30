/**
 * Qué reportes puede correr la persona de la sesión, y con qué sucursal.
 *
 * Una sola regla para el documento de un reporte, el cierre y los envíos
 * programados (y la misma que aplica la interfaz):
 * - El plan: módulos activos de `organization_modules`, leídos en el servidor.
 * - El alcance de sucursal: `resolverAlcanceSucursal`. Sin acceso a todas las
 *   sucursales, los reportes de toda la organización no se ejecutan y el
 *   consolidado tampoco; la RPC lo vuelve a exigir (`reporte_exigir_alcance_sucursal`).
 * - Los alias (`retenciones-por-proveedor`) se resuelven a su destino y vista.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { exigirSucursalPermitida, resolverAlcanceSucursal, type AlcanceSucursal } from '@/lib/security/alcanceSucursal';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { reportePermitido } from './alcanceSucursal';
import { getGrupos, getReporteById } from './reportesCatalogo';
import type { ReportDefinition } from './types';

export interface SujetoReportes {
  userId: string;
  organizationId: number;
  roleId: number;
  isSuperAdmin: boolean;
  /** `organization_members.id`; si no viene, se lee (nunca se asume «sin restricción»). */
  memberId?: number | null;
  supabase: SupabaseClient;
}

export interface AccesoReportes {
  modulosActivos: string[];
  alcance: AlcanceSucursal;
  /** Reportes listados del plan que su alcance deja correr, en el orden de la interfaz. */
  disponibles: ReportDefinition[];
}

async function memberIdDe(sujeto: SujetoReportes): Promise<number | null> {
  if (sujeto.memberId !== undefined) return sujeto.memberId;
  const { data, error } = await sujeto.supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', sujeto.organizationId)
    .eq('user_id', sujeto.userId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la membresía: ${error.message}`);
  const id = (data as { id?: number } | null)?.id;
  if (!id) throw new OrgContextError('Sin membresía activa en la organización', 403, 'ORG_FORBIDDEN');
  return id;
}

export async function resolverAccesoReportes(sujeto: SujetoReportes): Promise<AccesoReportes> {
  const [modulos, memberId] = await Promise.all([
    moduleManagementService.getActiveModules(sujeto.organizationId, sujeto.supabase),
    memberIdDe(sujeto),
  ]);
  const modulosActivos = modulos.map((m) => m.code);
  const alcance = await resolverAlcanceSucursal({ ...sujeto, memberId });
  const disponibles = getGrupos(modulosActivos)
    .flatMap((g) => g.reportes)
    .filter((d) => reportePermitido(d, alcance.accesoTotal));
  return { modulosActivos, alcance, disponibles };
}

export interface ReporteResuelto {
  def: ReportDefinition;
  /** Vista que abre un alias, o null. */
  vista: string | null;
}

/** 404 si no existe; 403 si el plan no lo incluye o el alcance no lo deja correr. */
export function exigirReporteDisponible(acceso: AccesoReportes, reportId: string): ReporteResuelto {
  const pedido = getReporteById(reportId);
  if (!pedido) throw new OrgContextError('Reporte no encontrado', 404, 'NOT_FOUND');
  const def = pedido.alias ? getReporteById(pedido.alias.destino) : pedido;
  if (!def) throw new OrgContextError('Reporte no encontrado', 404, 'NOT_FOUND');
  if (!acceso.disponibles.some((d) => d.id === def.id)) {
    const enPlan = getGrupos(acceso.modulosActivos).some((g) => g.reportes.some((r) => r.id === def.id));
    throw enPlan
      ? new OrgContextError('Este reporte es de toda la organización y requiere acceso a todas las sucursales', 403, 'BRANCH_SCOPE_REQUIRED')
      : new OrgContextError('El plan de la organización no incluye este reporte', 403, 'MODULO_NO_CONTRATADO');
  }
  return { def, vista: pedido.alias?.vista ?? null };
}

/**
 * Sucursal con la que corre el reporte: la pedida si el reporte filtra por
 * sucursal (validada contra el alcance); null en los de toda la organización.
 */
export function sucursalDelReporte(acceso: AccesoReportes, def: Pick<ReportDefinition, 'alcance'>, pedida: number | null): number | null {
  if (def.alcance === 'organizacion') return null;
  exigirSucursalPermitida(acceso.alcance, pedida);
  return pedida;
}

/** `"12"` → 12; vacío, «todas» o inválido → null (consolidado). */
export function sucursalDeParametro(valor: string | null | undefined): number | null {
  if (!valor || !/^\d{1,9}$/.test(valor)) return null;
  const n = Number(valor);
  return n > 0 ? n : null;
}
