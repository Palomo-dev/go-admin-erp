/**
 * Dinero de terceros — servicio de servidor (solo lectura, más el alta de las
 * dos categorías de tesorería de recaudos). Todo con el cliente de la SESIÓN:
 * RLS por pertenencia y las funciones de lectura que ya existen
 * (`fn_cuenta_por_clave`, `fn_auxiliar_tercero`). No escribe asientos ni saldos:
 * registrar y liquidar recaudos va por el formulario único de Movimientos de
 * Tesorería, y repartir propinas por la pantalla de propinas del POS.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import {
  CUENTA_RECAUDOS_RESPALDO,
  esCuentaPasivo,
  resumirPropinas,
  resumirRecaudos,
  type FilaAuxiliar,
  type FilaPropina,
  type RespuestaDineroTerceros,
} from '@/lib/finanzas/dineroTerceros/dineroTercerosLogica';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

/** Tope de lectura de propinas (páginas de 1.000): si se alcanza, la pantalla lo dice. */
const PAGINAS_PROPINAS = 20;
const TAM_PAGINA = 1000;

export class ErrorDineroTerceros extends Error {
  constructor(public readonly codigo: 'error_desconocido' | 'sin_permiso') {
    super(codigo);
  }
}

async function cuentaPorClave(ctx: Ctx, clave: string): Promise<string | null> {
  const { data, error } = await ctx.supabase.rpc('fn_cuenta_por_clave', { p_organization_id: ctx.organizationId, p_branch_id: null, p_clave: clave });
  if (error) return null;
  return typeof data === 'string' && data ? data : null;
}

async function leerPropinas(ctx: Ctx): Promise<{ filas: FilaPropina[]; truncadas: boolean }> {
  const filas: FilaPropina[] = [];
  for (let pagina = 0; pagina < PAGINAS_PROPINAS; pagina += 1) {
    const { data, error } = await ctx.supabase
      .from('tips')
      .select('amount, is_distributed, voided_at')
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false })
      .range(pagina * TAM_PAGINA, pagina * TAM_PAGINA + TAM_PAGINA - 1);
    if (error) throw new ErrorDineroTerceros('error_desconocido');
    const lote = (data ?? []) as FilaPropina[];
    filas.push(...lote);
    if (lote.length < TAM_PAGINA) return { filas, truncadas: false };
  }
  return { filas, truncadas: true };
}

export async function resumenDineroTerceros(ctx: Ctx): Promise<RespuestaDineroTerceros> {
  const [configRes, cuentaPropinas, cuentaRecaudosConfig, propinas] = await Promise.all([
    ctx.supabase
      .from('configuracion_contable')
      .select('clave, account_code')
      .eq('organization_id', ctx.organizationId)
      .in('clave', ['propinas', 'recaudos_terceros']),
    cuentaPorClave(ctx, 'propinas'),
    cuentaPorClave(ctx, 'recaudos_terceros'),
    leerPropinas(ctx),
  ]);
  const configuradas = new Set(((configRes.data ?? []) as { clave: string }[]).map((c) => c.clave));
  const cuentaRecaudos = cuentaRecaudosConfig ?? CUENTA_RECAUDOS_RESPALDO;

  const [auxRes, categoriasRes] = await Promise.all([
    ctx.supabase.rpc('fn_auxiliar_tercero', {
      p_organization_id: ctx.organizationId,
      p_desde: '2000-01-01T00:00:00Z',
      p_hasta: new Date().toISOString(),
      p_cuenta: cuentaRecaudos,
      p_limite: 2000,
    }),
    ctx.supabase
      .from('categorias_tesoreria')
      .select('id, tipo, cuenta_sugerida, activa')
      .eq('organization_id', ctx.organizationId)
      .eq('cuenta_sugerida', cuentaRecaudos)
      .eq('activa', true),
  ]);
  if (auxRes.error) {
    console.error('[dinero-terceros] fn_auxiliar_tercero', { organizationId: ctx.organizationId, message: auxRes.error.message });
    throw new ErrorDineroTerceros('error_desconocido');
  }

  const p = resumirPropinas(propinas.filas);
  const r = resumirRecaudos((auxRes.data ?? []) as FilaAuxiliar[]);
  const categorias = (categoriasRes.data ?? []) as { id: number; tipo: string }[];

  return {
    conceptos: [
      {
        clave: 'propinas',
        ...p,
        cuenta: cuentaPropinas,
        cuentaConfirmada: configuradas.has('propinas') && esCuentaPasivo(cuentaPropinas),
        cuentaNoEsPasivo: !esCuentaPasivo(cuentaPropinas),
        terceros: [],
      },
      {
        clave: 'recaudos',
        recibido: r.recibido,
        liquidado: r.liquidado,
        porPagar: r.porPagar,
        cuenta: cuentaRecaudos,
        cuentaConfirmada: configuradas.has('recaudos_terceros') && esCuentaPasivo(cuentaRecaudos),
        cuentaNoEsPasivo: !esCuentaPasivo(cuentaRecaudos),
        terceros: r.terceros,
      },
    ],
    cuentaRecaudos,
    categorias: {
      ingreso: categorias.find((c) => c.tipo === 'ingreso')?.id ?? null,
      egreso: categorias.find((c) => c.tipo === 'egreso')?.id ?? null,
    },
    propinasTruncadas: propinas.truncadas,
  };
}

/**
 * Crea las categorías de tesorería de recaudos que falten («Recaudos para
 * terceros» de ingreso y «Pago de recaudos a terceros» de egreso), con la
 * cuenta de recaudos. Es la misma alta que hace la pantalla de Categorías de
 * tesorería (RLS + el disparador `fn_categorias_tesoreria_guardar` valida).
 */
export async function asegurarCategoriasRecaudo(
  ctx: Ctx,
  nombres: { ingreso: string; egreso: string },
): Promise<{ ingreso: number | null; egreso: number | null }> {
  const actual = await resumenDineroTerceros(ctx);
  const faltan: { tipo: 'ingreso' | 'egreso'; nombre: string }[] = [];
  if (!actual.categorias.ingreso) faltan.push({ tipo: 'ingreso', nombre: nombres.ingreso });
  if (!actual.categorias.egreso) faltan.push({ tipo: 'egreso', nombre: nombres.egreso });
  for (const f of faltan) {
    const { error } = await ctx.supabase.from('categorias_tesoreria').insert({
      organization_id: ctx.organizationId,
      tipo: f.tipo,
      nombre: f.nombre,
      icono: f.tipo === 'ingreso' ? 'wallet' : 'users',
      cuenta_sugerida: actual.cuentaRecaudos,
      activa: true,
      es_predefinida: false,
      orden: 900,
    });
    // Un nombre ya usado (índice por organización, tipo y nombre) no es un error: se busca por cuenta.
    if (error && error.code !== '23505') {
      console.error('[dinero-terceros] categoría', { organizationId: ctx.organizationId, message: error.message });
      throw new ErrorDineroTerceros('error_desconocido');
    }
  }
  return (await resumenDineroTerceros(ctx)).categorias;
}
