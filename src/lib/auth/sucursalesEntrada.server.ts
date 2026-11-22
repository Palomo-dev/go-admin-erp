/**
 * Datos y validación del paso «¿En qué sucursal trabajas hoy?» en el
 * servidor. Lo usa `GET/POST /api/me/sucursales`.
 *
 * Qué sucursales le corresponden NO se decide aquí: sale de
 * `resolverAlcanceSucursal` (misma regla que `reporte_exigir_alcance_sucursal`
 * en la base y que `GET /api/me/capacidades`): admin o sin asignaciones →
 * todas las activas; con asignaciones en `member_branches` → solo esas. La
 * organización y la persona salen de la sesión (`ServerOrgContext`), nunca del
 * navegador.
 *
 * Todo se lee con el cliente de la sesión (RLS):
 * - `branches`: nombre, ciudad, dirección, principal, horario y zona propia.
 * - `cash_sessions`: cajas ABIERTAS por esta persona (`opened_by`) en la
 *   organización. Una sola consulta acotada por organización, persona y
 *   estado; la caja global (`branch_id` NULL) no se pinta en ninguna tarjeta.
 * - `organization_members`: cuántas organizaciones tiene (para ofrecer «Cambiar
 *   de organización»), con `count` y sin filas.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolverAlcanceSucursal, exigirSucursalPermitida, type AlcanceSucursal } from '@/lib/security/alcanceSucursal';
import { resolveTimezoneCascade } from '@/lib/utils/branchTimezoneCascade';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import {
  estadoHorario,
  momentoEnZona,
  TODAS_LAS_SUCURSALES,
  type EleccionSucursal,
  type RespuestaSucursalesEntrada,
  type SucursalEntrada,
} from './seleccionSucursal';

export interface SujetoEntrada {
  userId: string;
  organizationId: number;
  organizationName: string;
  roleId: number;
  roleName: string;
  isSuperAdmin: boolean;
  memberId: number | null;
  supabase: SupabaseClient;
}

interface FilaSucursal {
  id: number;
  name: string;
  city: string | null;
  address: string | null;
  is_main: boolean | null;
  opening_hours: unknown;
  timezone: string | null;
}

/** Lista para el paso de sucursal. `ahora` solo se inyecta en pruebas. */
export async function sucursalesDeEntrada(ctx: SujetoEntrada, ahora: Date = new Date()): Promise<RespuestaSucursalesEntrada> {
  const alcance = await resolverAlcanceSucursal(ctx);
  const ids = alcance.permitidas;

  const [sucursales, cajas, membresias, zonaOrganizacion] = await Promise.all([
    ids.length > 0
      ? ctx.supabase
          .from('branches')
          .select('id, name, city, address, is_main, opening_hours, timezone')
          .eq('organization_id', ctx.organizationId)
          .in('id', ids)
      : Promise.resolve({ data: [] as FilaSucursal[], error: null }),
    ids.length > 0
      ? ctx.supabase
          .from('cash_sessions')
          .select('id, branch_id')
          .eq('organization_id', ctx.organizationId)
          .eq('opened_by', ctx.userId)
          .eq('status', 'open')
          .in('branch_id', ids)
      : Promise.resolve({ data: [] as { id: number; branch_id: number | null }[], error: null }),
    ctx.supabase
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ctx.userId)
      .eq('is_active', true),
    getOrganizationTimezone(ctx.organizationId, ctx.supabase),
  ]);

  if (sucursales.error) throw new Error(`No se pudieron leer las sucursales: ${sucursales.error.message}`);
  // Sin cajas o sin el conteo la pantalla sigue sirviendo: se omite ese dato.
  if (cajas.error) console.warn('[sucursalesEntrada] cajas abiertas', cajas.error.message);
  if (membresias.error) console.warn('[sucursalesEntrada] organizaciones', membresias.error.message);

  const cajaPorSucursal = new Map<number, number>();
  for (const c of (cajas.error ? [] : cajas.data ?? []) as { id: number; branch_id: number | null }[]) {
    if (c.branch_id != null && !cajaPorSucursal.has(c.branch_id)) cajaPorSucursal.set(c.branch_id, c.id);
  }

  const lista: SucursalEntrada[] = ((sucursales.data ?? []) as FilaSucursal[]).map((b) => {
    const { timezone } = resolveTimezoneCascade({ branchTimezone: b.timezone, organizationTimezone: zonaOrganizacion });
    return {
      id: b.id,
      nombre: b.name,
      ciudad: b.city?.trim() || null,
      direccion: b.address?.trim() || null,
      principal: b.is_main === true,
      horario: estadoHorario(b.opening_hours, momentoEnZona(ahora, timezone)),
      cajaAbierta: cajaPorSucursal.get(b.id) ?? null,
    };
  });

  return {
    organizacion: { id: ctx.organizationId, nombre: ctx.organizationName },
    rol: ctx.roleName,
    verTodas: alcance.accesoTotal && lista.length > 1,
    organizaciones: membresias.error ? 1 : membresias.count ?? 1,
    sucursales: lista,
  };
}

/**
 * Valida la sucursal elegida contra el alcance de la persona. Lanza
 * `OrgContextError` 403 (`BRANCH_FORBIDDEN` o `BRANCH_SCOPE_REQUIRED`) si no le
 * corresponde. «Todas» es el consolidado y exige `accesoTotal`.
 */
export async function validarEleccionSucursal(ctx: SujetoEntrada, eleccion: EleccionSucursal): Promise<AlcanceSucursal> {
  const alcance = await resolverAlcanceSucursal(ctx);
  exigirSucursalPermitida(alcance, eleccion === TODAS_LAS_SUCURSALES ? null : eleccion);
  return alcance;
}
