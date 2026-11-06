/**
 * Lectura de los estados financieros en el servidor, con el cliente de la
 * sesión: la organización sale del contexto y las funciones vuelven a exigir
 * pertenencia, `finance.view` y alcance sobre todas las sucursales.
 */
import { rangoComparativo } from '@/lib/finanzas/reportes/estadosNiif';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { getDateRange } from '@/lib/utils/timezone';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import type {
  BaseIndicadores,
  Certificacion,
  ClaveNota,
  ConfiguracionEstados,
  EstadoFlujos,
  EstadoPatrimonio,
  EstadoPresupuesto,
  EstadoResultado,
  FilaResumenLibro,
  LibroInventarios,
  LibroMayor,
  LineaLibro,
  MarcaCuenta,
  NotaGuardada,
  PoliticasFlujo,
} from './tipos';
import type { IdLibro } from './libros';

type Contexto = Pick<ServerOrgContext, 'organizationId' | 'supabase'>;

/** Tope de seguridad de un libro por líneas: se avisa, no se corta en silencio. */
export const MAXIMO_LINEAS_LIBRO = 100_000;
const LOTE = 1000;

export const INFORMES = ['flujo', 'patrimonio', 'resultado', 'indicadores', 'presupuesto'] as const;
export type IdInforme = (typeof INFORMES)[number];

export class ErrorEstados extends Error {
  constructor(public codigo: string, public estado: number) {
    super(codigo);
  }
}

function fallo(error: { code?: string; message?: string }): ErrorEstados {
  const mensaje = error.message ?? '';
  if (mensaje.includes('BRANCH_SCOPE_REQUIRED')) return new ErrorEstados('alcance_sucursal', 403);
  if (error.code === '42501') return new ErrorEstados('sin_permiso', 403);
  if (error.code === '40001') return new ErrorEstados('version_obsoleta', 409);
  if (error.code === '22023') return new ErrorEstados(mensaje || 'datos_invalidos', 400);
  if (error.code === '23514') return new ErrorEstados('datos_invalidos', 400);
  console.error('Estados financieros: fallo de la base', error);
  return new ErrorEstados('error_consulta', 500);
}

async function rpc<T>(ctx: Contexto, funcion: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await ctx.supabase.rpc(funcion, { p_organization_id: ctx.organizationId, ...args });
  if (error) throw fallo(error);
  return data as T;
}

const rango = (desde: string, hasta: string) => ({ p_desde: desde, p_hasta: hasta });

async function presupuesto(ctx: Contexto, desde: string, hasta: string): Promise<EstadoPresupuesto> {
  const zona = await getOrganizationTimezone(ctx.organizationId, ctx.supabase);
  const { start, end } = getDateRange(desde, hasta, zona);
  return rpc<EstadoPresupuesto>(ctx, 'fn_reporte_presupuesto_vs_real', { p_from: start, p_to: end });
}

export interface InformeLeido<T> {
  actual: T;
  anterior: T | null;
}

/** Cada informe con su periodo comparativo (mismo rango del año anterior). */
export async function leerInforme(
  ctx: Contexto,
  informe: IdInforme,
  desde: string,
  hasta: string,
  comparar: boolean,
): Promise<InformeLeido<unknown>> {
  const leer = (d: string, h: string): Promise<unknown> => {
    switch (informe) {
      case 'flujo': return rpc<EstadoFlujos>(ctx, 'fn_estado_flujos_efectivo', rango(d, h));
      case 'patrimonio': return rpc<EstadoPatrimonio>(ctx, 'fn_estado_cambios_patrimonio', rango(d, h));
      case 'resultado': return rpc<EstadoResultado>(ctx, 'fn_estado_resultado_integral', rango(d, h));
      case 'indicadores': return rpc<BaseIndicadores>(ctx, 'fn_indicadores_financieros_base', rango(d, h));
      default: return presupuesto(ctx, d, h);
    }
  };
  const previo = rangoComparativo(desde, hasta);
  const [actual, anterior] = await Promise.all([
    leer(desde, hasta),
    comparar ? leer(previo.desde, previo.hasta) : Promise.resolve(null),
  ]);
  return { actual, anterior };
}

async function lineas(ctx: Contexto, desde: string, hasta: string): Promise<{ filas: LineaLibro[]; truncado: boolean }> {
  const filas: LineaLibro[] = [];
  let despues = 0;
  for (;;) {
    const lote = await rpc<LineaLibro[]>(ctx, 'fn_libro_lineas', { ...rango(desde, hasta), p_despues: despues, p_limite: LOTE });
    filas.push(...lote);
    if (lote.length < LOTE) return { filas, truncado: false };
    if (filas.length >= MAXIMO_LINEAS_LIBRO) return { filas, truncado: true };
    despues = lote[lote.length - 1].id;
  }
}

export async function leerLibro(ctx: Contexto, libro: IdLibro, desde: string, hasta: string, largo: number): Promise<unknown> {
  switch (libro) {
    case 'mayor':
      return rpc<LibroMayor>(ctx, 'fn_libro_mayor_balances', { ...rango(desde, hasta), p_largo: largo });
    case 'inventarios':
      return rpc<LibroInventarios>(ctx, 'fn_libro_inventarios_balances', { p_corte: hasta, p_largo: largo });
    case 'tercero':
    case 'centro':
      return rpc<FilaResumenLibro[]>(ctx, 'fn_libro_resumen', { ...rango(desde, hasta), p_por: libro });
    default:
      return lineas(ctx, desde, hasta);
  }
}

const POLITICAS_POR_DEFECTO: PoliticasFlujo = {
  intereses_pagados: 'operacion',
  intereses_recibidos: 'operacion',
  dividendos_recibidos: 'operacion',
  dividendos_pagados: 'financiacion',
  impuestos: 'operacion',
};

export async function leerConfiguracion(ctx: Contexto): Promise<ConfiguracionEstados> {
  const [ajustes, marcas, empresa] = await Promise.all([
    ctx.supabase.from('financial_report_settings')
      .select('version, notas, certificacion, politicas_flujo, politicas_confirmadas_en')
      .eq('organization_id', ctx.organizationId).maybeSingle(),
    ctx.supabase.from('financial_report_account_metadata')
      .select('account_code, clase_efectivo, categoria_flujo, plazo_meses, es_ori')
      .eq('organization_id', ctx.organizationId).order('account_code'),
    ctx.supabase.from('organizations').select('name, legal_name, nit, dv').eq('id', ctx.organizationId).maybeSingle(),
  ]);
  if (ajustes.error) throw fallo(ajustes.error);
  if (marcas.error) throw fallo(marcas.error);
  if (empresa.error) throw fallo(empresa.error);
  const fila = ajustes.data as {
    version: number;
    notas: Partial<Record<ClaveNota, NotaGuardada>>;
    certificacion: Certificacion;
    politicas_flujo: Partial<PoliticasFlujo>;
    politicas_confirmadas_en: string | null;
  } | null;
  const org = empresa.data as { name: string | null; legal_name: string | null; nit: string | null; dv: string | number | null } | null;
  return {
    version: fila?.version ?? 0,
    notas: fila?.notas ?? {},
    certificacion: fila?.certificacion ?? {},
    politicas: { ...POLITICAS_POR_DEFECTO, ...(fila?.politicas_flujo ?? {}) },
    politicasConfirmadas: !!fila?.politicas_confirmadas_en,
    marcas: (marcas.data ?? []) as MarcaCuenta[],
    empresa: {
      nombre: org?.legal_name || org?.name || '',
      nit: [org?.nit, org?.dv].filter((v) => v !== null && v !== undefined && v !== '').join('-'),
    },
  };
}

export async function guardarConfiguracion(ctx: Contexto, cambios: Record<string, unknown>): Promise<{ version: number }> {
  return rpc(ctx, 'fn_estados_configuracion_guardar', { p_cambios: cambios });
}

export async function guardarCuentasFlujo(ctx: Contexto, cuentas: unknown[]): Promise<{ cuentas: number }> {
  return rpc(ctx, 'fn_estados_cuentas_flujo_guardar', { p_cuentas: cuentas });
}
