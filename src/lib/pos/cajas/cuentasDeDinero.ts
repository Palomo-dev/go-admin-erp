/**
 * Cajas del POS como cuentas de dinero (paso 18 de
 * docs/implementacion/CAJAS-VENTAS-PLAN.md; contrato para Finanzas › Tesorería,
 * `CuentaDineroCard Tipo=caja` de FINANZAS-TESORERIA-FIGMA §3).
 *
 * Solo lectura EN EL SERVIDOR, con el cliente de la sesión:
 * - Las sesiones ABIERTAS de la organización; el alcance sale del modo de caja
 *   (`branch`: una por sucursal o «Todas»; `user`: una por persona).
 * - El saldo es el efectivo esperado de `pos_caja_esperado` a través de
 *   `resumenesCompactos`, así que el cierre ciego se respeta igual que en
 *   «Cajas abiertas»: sin permiso `pos.cajas.ver_esperado`, `saldo = null`.
 * Tesorería no debe recalcular el esperado por su cuenta (R8 del plan): si
 * necesita otra cifra, se pide aquí.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { ErrorResumenCaja, modoCajaOrganizacion, resumenesCompactos } from './resumenServidor';

type Ctx = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'roleId' | 'isSuperAdmin' | 'supabase'>;

export interface CajaComoCuenta {
  tipo: 'caja';
  sesion_id: number;
  uuid: string;
  /** `sucursal`: caja de una sucursal · `todas`: caja global · `usuario`: caja personal (modo por usuario). */
  alcance: 'sucursal' | 'todas' | 'usuario';
  sucursal: { id: number; nombre: string | null } | null;
  responsable: { id: string; nombre: string | null };
  abierta_desde: string;
  /** Efectivo esperado ahora; `null` si el cierre ciego lo oculta a quien pregunta. */
  saldo: number | null;
  /** Detalle de la caja (la URL de detalle usa el uuid). */
  href: string;
}

export async function cajasComoCuentasDeDinero(ctx: Ctx): Promise<{ modo: 'branch' | 'user'; cuentas: CajaComoCuenta[] }> {
  const [modo, sesionesRes] = await Promise.all([
    modoCajaOrganizacion(ctx),
    ctx.supabase
      .from('cash_sessions')
      .select('id, uuid, branch_id, opened_by, opened_at')
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'open')
      .order('opened_at', { ascending: true }),
  ]);
  if (sesionesRes.error) throw new ErrorResumenCaja('lectura_fallida', 500, sesionesRes.error.message);
  const sesiones = (sesionesRes.data ?? []) as Array<{ id: number; uuid: string; branch_id: number | null; opened_by: string; opened_at: string }>;
  if (sesiones.length === 0) return { modo, cuentas: [] };

  const sucursalesIds = [...new Set(sesiones.map((s) => s.branch_id).filter((x): x is number => x !== null))];
  const personasIds = [...new Set(sesiones.map((s) => s.opened_by))];
  const [resumenes, sucursales, personas] = await Promise.all([
    resumenesCompactos(ctx, sesiones.map((s) => s.id)),
    sucursalesIds.length ? ctx.supabase.from('branches').select('id, name').in('id', sucursalesIds) : Promise.resolve({ data: [] as unknown[] }),
    ctx.supabase.from('profiles').select('id, first_name, last_name, email').in('id', personasIds),
  ]);
  const nombreSucursal = new Map(((sucursales.data ?? []) as Array<{ id: number; name: string | null }>).map((b) => [b.id, b.name]));
  const nombrePersona = new Map(
    ((personas.data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>).map((p) => [
      p.id,
      [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || p.email || null,
    ]),
  );

  return {
    modo,
    cuentas: sesiones.map((s) => ({
      tipo: 'caja' as const,
      sesion_id: s.id,
      uuid: s.uuid,
      alcance: modo === 'user' ? ('usuario' as const) : s.branch_id === null ? ('todas' as const) : ('sucursal' as const),
      sucursal: s.branch_id === null ? null : { id: s.branch_id, nombre: nombreSucursal.get(s.branch_id) ?? null },
      responsable: { id: s.opened_by, nombre: nombrePersona.get(s.opened_by) ?? null },
      abierta_desde: s.opened_at,
      saldo: resumenes[s.id]?.expected_amount ?? null,
      href: `/app/pos/cajas/${s.uuid}`,
    })),
  };
}
