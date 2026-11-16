/**
 * Capacidades del menú (`PaginaNav.requiere`), calculadas EN EL SERVIDOR con el
 * cliente de la sesión. Única fuente: las usan `GET /api/me/capacidades` (el
 * menú lateral del navegador) y `seccionesVisiblesServidor` (buscador global e
 * inicio), así que una página con `requiere` se ve o no se ve igual en todas
 * partes.
 *
 * Ninguna se decide por el nombre de un rol (regla 6 de CLAUDE.md):
 *  - gestionarNotificaciones: admin o `notifications.manage`.
 *  - verAnaliticaWeb: la MISMA regla que `GET /api/analitica-web` (panel
 *    completo o `reports.sales`). Sin ella, el menú ofrecía «Analítica» a quien
 *    la API le responde 403.
 *  - variasSedes: la organización tiene más de una sucursal activa (Figma 01b:
 *    «Sedes en la web» solo con más de una sucursal). Se recalcula sola cuando
 *    se crea la segunda sede: no depende de filas guardadas.
 *  - jefeDeEquipo: tiene personas a cargo y no es de RR. HH. (decisión 1 de la
 *    fase 2 de RR. HH.: «Mi equipo»). La misma regla que `GET /api/hrm/pestanas`
 *    (`fn_hr_pestanas`, vista «jefe»).
 *
 * Un error cuenta como «no» (fail-closed): la UI no ofrece lo que no sabe que
 * se puede usar.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { veePanelCompleto } from '@/lib/dashboard/accesoPanel';
import { getServiceClient } from '@/lib/supabase/server-service';
import { CAPACIDADES_NAV, type CapacidadNav } from './catalog';

export type ContextoCapacidades = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'supabase'> &
  Partial<Pick<ServerOrgContext, 'roleId' | 'isSuperAdmin'>>;

/** Permiso que abre la analítica web a quien no ve el panel completo. */
export const PERMISO_ANALITICA_WEB = 'reports.sales';

function sujeto(ctx: ContextoCapacidades) {
  return { ...ctx, roleId: ctx.roleId ?? 0, isSuperAdmin: ctx.isSuperAdmin === true };
}

/** ¿Puede ver la analítica web? Misma regla que `GET /api/analitica-web`. */
export async function puedeVerAnaliticaWeb(ctx: ContextoCapacidades): Promise<boolean> {
  const s = sujeto(ctx);
  return veePanelCompleto(s) || hasOrgAdminOrPermission(s, PERMISO_ANALITICA_WEB);
}

/** ¿La organización tiene más de una sucursal activa? */
export async function tieneVariasSedes(ctx: ContextoCapacidades): Promise<boolean> {
  const { count, error } = await ctx.supabase
    .from('branches')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ctx.organizationId)
    .not('is_active', 'is', false);
  if (error) {
    console.warn('[capacidadesNav] branches', error.message);
    return false;
  }
  return (count ?? 0) > 1;
}

/** ¿Ve la vista del jefe («Mi equipo»)? Misma regla que `GET /api/hrm/pestanas`. */
export async function esJefeDeEquipo(ctx: ContextoCapacidades): Promise<boolean> {
  const { data, error } = await getServiceClient().rpc('fn_hr_pestanas', { p_actor: ctx.userId, p_org: ctx.organizationId });
  if (error) {
    console.warn('[capacidadesNav] fn_hr_pestanas', error.message);
    return false;
  }
  return (data as { vista?: string } | null)?.vista === 'jefe';
}

const CALCULO: Record<CapacidadNav, (ctx: ContextoCapacidades) => Promise<boolean>> = {
  gestionarNotificaciones: (ctx) => hasOrgAdminOrPermission(sujeto(ctx), 'notifications.manage'),
  verAnaliticaWeb: puedeVerAnaliticaWeb,
  variasSedes: tieneVariasSedes,
  jefeDeEquipo: esJefeDeEquipo,
};

/**
 * Las capacidades pedidas que la persona tiene. Solo se consultan las pedidas:
 * quien llama pasa las que exigen las páginas que de verdad podría ver (así una
 * organización sin el módulo no paga la consulta).
 */
export async function capacidadesNavServidor(
  ctx: ContextoCapacidades,
  pedidas: readonly CapacidadNav[] = CAPACIDADES_NAV
): Promise<Set<CapacidadNav>> {
  const unicas = Array.from(new Set(pedidas));
  const valores = await Promise.all(
    unicas.map((c) =>
      CALCULO[c](ctx).catch((err: unknown) => {
        console.warn('[capacidadesNav]', c, err instanceof Error ? err.message : err);
        return false;
      })
    )
  );
  return new Set(unicas.filter((_, i) => valores[i]));
}
