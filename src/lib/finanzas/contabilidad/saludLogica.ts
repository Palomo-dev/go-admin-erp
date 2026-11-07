/**
 * Salud contable (decisión 3 del dueño, Contabilidad v2 §2 y §4.13), sin React.
 *
 * Cuatro pestañas: Pendientes (`journal_entry_failures`), Descuadres y Huérfanos
 * (`fn_salud_contable`, aplicada el 2026-11-08) y Estructura (cuentas agrupadoras con
 * movimiento y reglas que apuntan a cuentas de título o inexistentes).
 * Regla de la pantalla: un dato que no se pudo leer nunca se muestra como cero.
 */

export const PESTANAS_SALUD = ['pendientes', 'descuadres', 'huerfanos', 'estructura'] as const;
export type PestanaSalud = (typeof PESTANAS_SALUD)[number];

export type SubtipoDescuadre = 'asiento_distinto' | 'devengo_duplicado' | 'borrador_con_asiento';

export interface DescuadreSalud {
  tipo: 'factura' | 'facturaCompra';
  documentoId: string;
  numero: string | null;
  subtipo: SubtipoDescuadre;
  totalDocumento: number;
  totalAsiento: number;
  diferencia: number;
  asientos: number[];
}

export interface HuerfanoSalud {
  asientoId: number;
  origen: string | null;
  origenId: string | null;
  fecha: string | null;
  importe: number;
  motivo: 'documento_eliminado' | 'sin_lineas';
}

export interface CruceSalud {
  descuadres: DescuadreSalud[];
  totalDescuadres: number;
  huerfanos: HuerfanoSalud[];
  totalHuerfanos: number;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const texto = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

const SUBTIPOS: readonly SubtipoDescuadre[] = ['asiento_distinto', 'devengo_duplicado', 'borrador_con_asiento'];

/** Lee la respuesta de `fn_salud_contable` sin confiar en su forma. */
export function leerCruceSalud(datos: unknown): CruceSalud {
  const d = (datos && typeof datos === 'object' ? datos : {}) as Record<string, unknown>;
  const descuadres = (Array.isArray(d.descuadres) ? d.descuadres : []).map((f): DescuadreSalud => {
    const x = (f ?? {}) as Record<string, unknown>;
    const subtipo = SUBTIPOS.includes(x.subtipo as SubtipoDescuadre) ? (x.subtipo as SubtipoDescuadre) : 'asiento_distinto';
    return {
      tipo: x.tipo === 'facturaCompra' ? 'facturaCompra' : 'factura',
      documentoId: String(x.documento_id ?? ''),
      numero: texto(x.numero),
      subtipo,
      totalDocumento: num(x.total_documento),
      totalAsiento: num(x.total_asiento),
      diferencia: num(x.diferencia),
      asientos: (Array.isArray(x.asientos) ? x.asientos : []).map(num).filter((n) => n > 0),
    };
  });
  const huerfanos = (Array.isArray(d.huerfanos) ? d.huerfanos : []).map((f): HuerfanoSalud => {
    const x = (f ?? {}) as Record<string, unknown>;
    return {
      asientoId: num(x.asiento_id),
      origen: texto(x.origen),
      origenId: texto(x.origen_id),
      fecha: texto(x.fecha),
      importe: num(x.importe),
      motivo: x.motivo === 'sin_lineas' ? 'sin_lineas' : 'documento_eliminado',
    };
  });
  return {
    descuadres,
    totalDescuadres: d.total_descuadres == null ? descuadres.length : num(d.total_descuadres),
    huerfanos,
    totalHuerfanos: d.total_huerfanos == null ? huerfanos.length : num(d.total_huerfanos),
  };
}

/** La función todavía no existe en la base (PostgREST PGRST202, Postgres 42883). */
export function esFuncionInexistente(error: unknown): boolean {
  const e = (error ?? {}) as { code?: unknown; message?: unknown };
  if (e.code === 'PGRST202' || e.code === '42883') return true;
  // Solo la función ausente: «relation … does not exist» u otro error real no se disfraza de «sin activar».
  return typeof e.message === 'string' && /could not find the function public\.fn_salud_contable/i.test(e.message);
}

export interface CuentaPlanSalud {
  account_code: string;
  name: string;
}

export interface CuentaAgrupadoraConMovimiento {
  codigo: string;
  nombre: string;
  movimientos: number;
  saldo: number;
  subcuentas: number;
}

/**
 * Cuentas que tienen subcuentas en el plan y aun así reciben líneas propias
 * (D-7 de Contabilidad v2). `saldos` es `fn_plan_saldos`: saldo y movimientos
 * por código exacto, sin sumar las hijas.
 */
export function cuentasAgrupadorasConMovimiento(
  plan: readonly CuentaPlanSalud[],
  saldos: ReadonlyMap<string, { saldo: number; movimientos: number }>,
): CuentaAgrupadoraConMovimiento[] {
  const codigos = plan.map((c) => c.account_code.trim());
  const salida: CuentaAgrupadoraConMovimiento[] = [];
  for (const c of plan) {
    const codigo = c.account_code.trim();
    const s = saldos.get(codigo);
    if (!s || s.movimientos <= 0) continue;
    const subcuentas = codigos.filter((x) => x !== codigo && x.startsWith(codigo)).length;
    if (subcuentas === 0) continue;
    salida.push({ codigo, nombre: c.name, movimientos: s.movimientos, saldo: s.saldo, subcuentas });
  }
  return salida.sort((a, b) => b.movimientos - a.movimientos || a.codigo.localeCompare(b.codigo));
}

/** Resumen del balance: Σ débitos = Σ créditos de todo lo publicado. */
export function balanceCuadra(saldos: readonly { debito: number | string; credito: number | string }[]): { cuadra: boolean; diferencia: number } {
  let d = 0;
  let c = 0;
  for (const s of saldos) {
    d += num(s.debito);
    c += num(s.credito);
  }
  const diferencia = Math.round((d - c) * 100) / 100;
  return { cuadra: Math.abs(diferencia) < 0.005, diferencia };
}

/** Todo en orden: sin pendientes, descuadres, huérfanos ni problemas de estructura (y todo se pudo leer). */
export function saludSinProblemas(conteos: readonly (number | null)[]): boolean {
  return conteos.every((n) => n === 0);
}
