/**
 * Lecturas del widget «Logística» del inicio (ver `logisticaInicio.ts`).
 *
 * Con el cliente de la SESIÓN (`ctx.supabase`, RLS por pertenencia) y la
 * organización del contexto. Nada se recalcula aquí: se leen los envíos con los
 * servicios del módulo (`despachoService`, `cuadresDomiciliarioService`) y se
 * pasan por SUS reglas (`kpisDespacho`, `conteosSeguimiento`, `kpisCuadres`,
 * `tasaPrimerIntento`), las mismas de Por despachar, Seguimiento y Cuadres. Así
 * el widget cuadra con cada pantalla.
 *
 * Si la fila aparece lo decidió la base (`fn_inicio_modulos_resumen`: módulo
 * activo, `logistica.view` y que la persona vea toda la operación). Cada fuente
 * falla por separado: un error en una no tumba el panel.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { addPlainDays, startOfDayInstant } from '@/lib/utils/dateCore';
import { entregadosDesde, listarPorDespachar, listarSeguimiento } from '@/lib/services/logistica/despachoService';
import { listarCuadres, pendientesPorCuadrar } from '@/lib/services/logistica/cuadresDomiciliarioService';
import { kpisDespacho, ordenarDespacho, promesaDe } from '@/lib/logistica/despacho';
import { conteosSeguimiento, tasaPrimerIntento, META_PRIMER_INTENTO, ESTADOS_CON_NOVEDAD_ABIERTA } from '@/lib/logistica/seguimiento';
import { filasCuadres, kpisCuadres, type CuadreGuardado, type EnvioCobrado } from '@/lib/logistica/cuadresVista';
import { CLAVE_AJUSTES_LOGISTICA, normalizarAjustesLogistica } from '@/lib/logistica/ajustesLogistica';
import type { CrudoLogisticaInicio } from './logisticaInicio';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'supabase'>;

/** Estados «en camino» del desglose de envíos abiertos. */
const EN_CAMINO = new Set(['picked', 'dispatched', 'in_transit', 'out_for_delivery']);

async function seguro<T>(etiqueta: string, ctx: Ctx, f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch (err) {
    console.error(`[inicio/logistica] ${etiqueta}`, {
      organizationId: ctx.organizationId,
      message: err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err),
    });
    return null;
  }
}

/**
 * @param zona  zona horaria de la organización (la del resumen de módulos).
 * @param dia   hoy en esa zona (`YYYY-MM-DD`).
 */
export async function leerLogisticaInicio(
  ctx: Ctx,
  p: { sucursal: number | null; zona: string; dia: string; hayEnvios: boolean; ahora?: Date },
): Promise<CrudoLogisticaInicio> {
  const ahora = p.ahora ?? new Date();
  const vacio: CrudoLogisticaInicio = {
    hayEnvios: false,
    despacho: null,
    masAtrasado: null,
    seguimiento: null,
    cuadres: null,
    abiertos: null,
    primerIntento: null,
    metaPrimerIntento: META_PRIMER_INTENTO,
  };
  // Sin ningún envío nunca: estado «Sin datos», no hay nada más que leer.
  if (!p.hayEnvios) return vacio;

  const db = ctx.supabase;
  const org = ctx.organizationId;
  const finDeHoy = startOfDayInstant(addPlainDays(p.dia, 1), p.zona);
  const hace30 = startOfDayInstant(addPlainDays(p.dia, -30), p.zona).toISOString();

  const [ajustes, bandeja, seguimiento, entregados, cuadres] = await Promise.all([
    seguro('ajustes', ctx, async () => {
      const { data } = await db.from('organization_settings').select('settings').eq('organization_id', org).eq('key', CLAVE_AJUSTES_LOGISTICA).maybeSingle();
      return normalizarAjustesLogistica((data as { settings?: unknown } | null)?.settings);
    }),
    seguro('por despachar', ctx, () => listarPorDespachar(db, { organizationId: org, branchId: p.sucursal })),
    seguro('seguimiento', ctx, () => listarSeguimiento(db, { organizationId: org, branchId: p.sucursal })),
    seguro('primer intento', ctx, () => entregadosDesde(db, org, hace30, p.sucursal)),
    seguro('cuadres', ctx, async () => {
      const [lista, cobrados] = await Promise.all([
        listarCuadres(db, org, { branchId: p.sucursal, limite: 200 }),
        pendientesPorCuadrar(db, org, p.sucursal),
      ]);
      const guardados = lista as unknown as CuadreGuardado[];
      const abiertos = guardados.filter((c) => c.status === 'open').map((c) => c.id);
      // Envíos que ya tienen línea en un cuadre abierto: no se cuentan dos veces (misma regla que Cuadres).
      let enCuadreAbierto = new Set<string>();
      if (abiertos.length > 0) {
        const { data, error } = await db
          .from('courier_settlement_lines')
          .select('shipment_id, status')
          .eq('organization_id', org)
          .in('settlement_id', abiertos);
        if (error) throw error;
        enCuadreAbierto = new Set(
          ((data ?? []) as Array<{ shipment_id: string | null; status: string }>)
            .filter((l) => l.status !== 'cancelled' && l.shipment_id)
            .map((l) => l.shipment_id as string),
        );
      }
      const filas = filasCuadres(guardados, cobrados as EnvioCobrado[], enCuadreAbierto);
      return kpisCuadres(filas, guardados, p.dia, p.zona);
    }),
  ]);

  const filasDespacho = bandeja?.filas ?? null;
  let masAtrasado: CrudoLogisticaInicio['masAtrasado'] = null;
  if (filasDespacho) {
    const primero = ordenarDespacho(filasDespacho).find((f) => promesaDe(f, ahora)?.tipo === 'tarde');
    const pr = primero ? promesaDe(primero, ahora) : null;
    if (primero && pr) masAtrasado = { numero: primero.pedido ?? primero.numero, minutos: pr.minutos };
  }

  // Envíos abiertos por estado: la bandeja de salida y lo que ya va en camino o con novedad.
  let abiertos: CrudoLogisticaInicio['abiertos'] = null;
  if (filasDespacho && seguimiento) {
    const estados = new Map<string, string>();
    for (const f of filasDespacho) estados.set(f.id, f.status);
    for (const f of seguimiento) estados.set(f.id, f.status);
    const novedad = new Set<string>(ESTADOS_CON_NOVEDAD_ABIERTA);
    let porDespachar = 0;
    let enCamino = 0;
    let conNovedad = 0;
    for (const st of estados.values()) {
      if (novedad.has(st)) conNovedad += 1;
      else if (EN_CAMINO.has(st)) enCamino += 1;
      else porDespachar += 1;
    }
    abiertos = { porDespachar, enCamino, conNovedad };
  }

  return {
    hayEnvios: true,
    despacho: filasDespacho ? kpisDespacho(filasDespacho, ahora, p.zona) : null,
    masAtrasado,
    seguimiento: seguimiento ? conteosSeguimiento(seguimiento, ahora, finDeHoy, ajustes ?? undefined) : null,
    cuadres,
    abiertos,
    primerIntento: entregados ? tasaPrimerIntento(entregados) : null,
    metaPrimerIntento: META_PRIMER_INTENTO,
  };
}
