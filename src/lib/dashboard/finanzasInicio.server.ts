/**
 * Lecturas del bloque Finanzas del inicio (ver `finanzasInicio.ts`).
 *
 * Con el cliente de la SESIÓN (`ctx.supabase`, RLS) y la organización del
 * contexto. Las cifras salen de las fuentes que ya existen: no se recalcula
 * nada aquí.
 *  - `fn_pendientes_contables` (exige `finance.view` en la base).
 *  - `fn_estado_resultado_integral` (la misma del estado de resultados de Reportes).
 *  - Conteos `head` sobre `bank_reconciliations`, `electronic_invoicing_jobs` y
 *    `fiscal_periods` (los mismos criterios que sus pantallas).
 *
 * Una fuente cuya página no está en el menú de la persona no se consulta: no
 * podría resolverla. Cada fuente falla por separado (`Lectura`): un error en
 * una no tumba el bloque.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { zonaHorariaEnServidor } from '@/lib/utils/zonaHorariaServidor';
import { todayInTz } from '@/lib/utils/dateCore';
import { PAGINAS_FINANZAS, mesAnterior, mesDeFecha, type CrudoFinanzasInicio, type Lectura } from './finanzasInicio';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

type ErrorDb = { code?: string; message?: string } | null;

/** 42501 (sin permiso en la base) → sin acceso; cualquier otro error → error. */
function lectura<T>(error: ErrorDb, datos: () => T): Lectura<T> {
  if (error) return error.code === '42501' ? { estado: 'sinAcceso' } : { estado: 'error' };
  return { estado: 'ok', datos: datos() };
}

async function seguro<T>(etiqueta: string, ctx: Ctx, f: () => Promise<Lectura<T>>): Promise<Lectura<T>> {
  try {
    return await f();
  } catch (err) {
    console.error(`[inicio/finanzas] ${etiqueta}`, { organizationId: ctx.organizationId, message: err instanceof Error ? err.message : String(err) });
    return { estado: 'error' };
  }
}

const SIN_ACCESO = { estado: 'sinAcceso' } as const;

/**
 * Lee las fuentes del bloque. `visible(href)`: ¿la persona ve esa página en su
 * menú? (`seccionesVisiblesServidor`, la misma regla que el menú lateral).
 */
export async function leerFinanzasInicio(
  ctx: Ctx,
  sucursal: number | null,
  visible: (href: string) => boolean,
): Promise<CrudoFinanzasInicio> {
  const org = ctx.organizationId;
  const db = ctx.supabase;
  // «Hoy» en la zona de la organización (regla única de zona del servidor).
  const zona = await zonaHorariaEnServidor(ctx, null);
  const dia = todayInTz(zona);
  const anterior = mesAnterior(dia);

  const [pendientesContables, conciliaciones, dian, periodos, resultado] = await Promise.all([
    !visible(PAGINAS_FINANZAS.pendientesContables)
      ? SIN_ACCESO
      : seguro('pendientes contables', ctx, async () => {
          const { data, error } = await db.rpc('fn_pendientes_contables', {
            p_organization_id: org,
            p_busqueda: null,
            p_limite: 1,
            p_desplazamiento: 0,
          });
          const d = (data ?? {}) as { pendientes?: number; bloquean_cierre?: number };
          return lectura(error, () => ({ cantidad: Number(d.pendientes ?? 0), bloqueanCierre: Number(d.bloquean_cierre ?? 0) }));
        }),

    !visible(PAGINAS_FINANZAS.bancos)
      ? SIN_ACCESO
      : seguro('conciliaciones', ctx, async () => {
          // Con sucursal elegida: solo las conciliaciones de sus cuentas
          // (el mismo criterio que la pantalla de Bancos).
          let cuentas: number[] | null = null;
          if (sucursal !== null) {
            const c = await db.from('bank_accounts').select('id').eq('organization_id', org).eq('branch_id', sucursal);
            if (c.error) return lectura(c.error, () => ({ cantidad: 0, unica: null }));
            cuentas = (c.data ?? []).map((r: { id: number }) => r.id);
            if (cuentas.length === 0) return { estado: 'ok', datos: { cantidad: 0, unica: null } };
          }
          let q = db
            .from('bank_reconciliations')
            .select('id, period_end', { count: 'exact' })
            .eq('organization_id', org)
            .in('status', ['draft', 'in_progress'])
            .order('period_end', { ascending: false })
            .limit(1);
          if (cuentas) q = q.in('bank_account_id', cuentas);
          const { data, error, count } = await q;
          return lectura(error, () => {
            const n = count ?? 0;
            const fila = (data ?? [])[0] as { id: string; period_end: string } | undefined;
            const mes = mesDeFecha(fila?.period_end);
            return { cantidad: n, unica: n === 1 && fila && mes ? { id: fila.id, mes } : null };
          });
        }),

    !visible(PAGINAS_FINANZAS.facturacionElectronica)
      ? SIN_ACCESO
      : seguro('facturación electrónica', ctx, async () => {
          const base = () => db.from('electronic_invoicing_jobs').select('id', { count: 'exact', head: true }).eq('organization_id', org);
          const [rech, sin] = await Promise.all([
            base().eq('status', 'rejected'),
            // Sin enviar: agotó los reintentos, o quedó retenido esperando a
            // que una persona decida enviarlo (`hold_reason`).
            base().or('status.eq.failed,and(status.eq.pending,hold_reason.not.is.null)'),
          ]);
          return lectura(rech.error ?? sin.error, () => ({ rechazados: rech.count ?? 0, sinEnviar: sin.count ?? 0 }));
        }),

    !visible(PAGINAS_FINANZAS.periodosFiscales)
      ? SIN_ACCESO
      : seguro('periodos fiscales', ctx, async () => {
          const { data, error, count } = await db
            .from('fiscal_periods')
            .select('end_date', { count: 'exact' })
            .eq('organization_id', org)
            .eq('period_type', 'monthly')
            .neq('status', 'closed')
            .lt('end_date', dia)
            .order('end_date', { ascending: false })
            .limit(1);
          return lectura(error, () => ({
            cantidad: count ?? 0,
            ultimo: mesDeFecha(((data ?? [])[0] as { end_date?: string } | undefined)?.end_date),
          }));
        }),

    seguro('resultado del mes', ctx, async () => {
      const { data, error } = await db.rpc('fn_estado_resultado_integral', {
        p_organization_id: org,
        p_desde: anterior.desde,
        p_hasta: anterior.hasta,
      });
      const d = (data ?? {}) as { utilidad?: number | string };
      return lectura(error, () => ({ utilidad: Number(d.utilidad ?? 0), mes: anterior.mes, desde: anterior.desde, hasta: anterior.hasta }));
    }),
  ]);

  return { dia, pendientesContables, conciliaciones, dian, periodos, resultado };
}
