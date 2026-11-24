/**
 * Lecturas del widget «Ventas» del inicio (ver `ventasWidgetInicio.ts`).
 *
 * Con el cliente de la SESIÓN (`ctx.supabase`, RLS) y la organización del
 * contexto. Dos lecturas en paralelo, ambas sobre la regla única de «Todas las
 * ventas»:
 *  - `fn_inicio_ventas_widget`: cifras de hoy, del periodo y del anterior, por
 *    canal, por sede y pedidos por atender (SECURITY DEFINER, pertenencia,
 *    sucursal y permiso de ventas resueltos en la base).
 *  - `listarVentas` (`pos_ventas_listado_v2`): las últimas ventas de hoy, el
 *    mismo listado de /app/pos/ventas.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { toPlainDate } from '@/lib/utils/dateCore';
import { listarVentas, type FilaVenta } from '@/lib/pos/ventas/listadoServidor';
import type { RangoPeriodo } from './periodo';
import type { CrudoVentasWidget, DiasVentas } from './ventasWidgetInicio';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

export interface LecturaVentasInicio {
  crudo: CrudoVentasWidget;
  ultimas: FilaVenta[];
  /** Días calendario del periodo y de hoy: los filtros de los enlaces a «Todas las ventas». */
  dias: DiasVentas;
}

/**
 * Días calendario (zona de la organización, la misma de «Todas las ventas») de
 * un rango de instantes `[inicio, fin)`: el filtro `desde`/`hasta` de la página.
 */
export function diasDelRango(rango: Pick<RangoPeriodo, 'inicio' | 'fin'>, zona: string): { desde: string; hasta: string } {
  const desde = toPlainDate(new Date(rango.inicio), zona);
  const fin = Date.parse(rango.fin);
  const hasta = toPlainDate(new Date(Math.max(Date.parse(rango.inicio), fin - 1)), zona);
  return { desde, hasta: hasta < desde ? desde : hasta };
}

/** Lanza si la RPC de cifras falla (el llamador decide: la fila sigue sin panel). */
export async function leerVentasInicio(
  ctx: Ctx,
  p: { rango: RangoPeriodo; rangoHoy: RangoPeriodo; dia: string; sucursal: number | null; zona: string },
): Promise<LecturaVentasInicio> {
  const [cifras, ultimas] = await Promise.all([
    ctx.supabase.rpc('fn_inicio_ventas_widget', {
      p_organization_id: ctx.organizationId,
      p_desde: p.rango.inicio,
      p_hasta: p.rango.fin,
      p_desde_anterior: p.rango.inicioAnterior,
      p_hasta_anterior: p.rango.finAnterior,
      p_hoy_desde: p.rangoHoy.inicio,
      p_hoy_hasta: p.rangoHoy.fin,
      p_branch_id: p.sucursal,
    }),
    // Las últimas de hoy: si el listado falla, el panel sale sin la lista (no tumba las cifras).
    listarVentas(ctx, { desde: p.dia, hasta: p.dia, tamano: '10', pagina: '1' }, p.sucursal)
      .then((r) => r.filas.slice(0, 5))
      .catch((err: unknown) => {
        console.error('[inicio/ventas] últimas ventas', { organizationId: ctx.organizationId, message: err instanceof Error ? err.message : String(err) });
        return [] as FilaVenta[];
      }),
  ]);
  if (cifras.error) throw new Error(`fn_inicio_ventas_widget: ${cifras.error.message ?? cifras.error.code ?? 'error'}`);
  return {
    crudo: (cifras.data ?? {}) as CrudoVentasWidget,
    ultimas,
    dias: { periodo: diasDelRango(p.rango, p.zona), hoy: p.dia },
  };
}
