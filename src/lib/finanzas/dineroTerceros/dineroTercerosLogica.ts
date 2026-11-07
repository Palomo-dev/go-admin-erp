/**
 * Dinero de terceros (Figma «07 Finanzas» `2335:139939`, captura
 * `docs/design/figma/88-terceros-dinero-de-terceros.png`): lo que se recibe
 * pero no es propio — propinas y recaudos para terceros — con lo recibido, lo
 * liquidado y lo que falta pagar. Módulo hoja, sin React ni Supabase.
 *
 * No hay tablas nuevas: se lee lo que ya existe.
 * - Propinas: la tabla `tips` del POS (recibido = no anuladas; liquidado =
 *   repartidas, `is_distributed`). Su asiento hoy va a GASTO (clave contable
 *   'propinas' → 5105): mientras la cuenta no sea de pasivo, la pantalla avisa
 *   «Falta definir la cuenta» y el Contador decide (no se cambia aquí).
 * - Recaudos para terceros: el mayor de la cuenta de recaudos (clave
 *   'recaudos_terceros'; 2815 «Ingresos recibidos para terceros» si no está
 *   configurada) por tercero, con `fn_auxiliar_tercero`. Se registran y se
 *   liquidan con el formulario único de Movimientos de Tesorería (ingreso y
 *   egreso con esa cuenta y el tercero obligatorio).
 */

/** Cuenta PUC de respaldo para los recaudos: «Ingresos recibidos para terceros». */
export const CUENTA_RECAUDOS_RESPALDO = '2815';

export type ClaveConcepto = 'propinas' | 'recaudos';

export interface SaldoTercero {
  nit: string;
  nombre: string;
  recibido: number;
  liquidado: number;
  porPagar: number;
}

export interface ConceptoTerceros {
  clave: ClaveConcepto;
  recibido: number;
  liquidado: number;
  porPagar: number;
  /** Cuenta con la que hoy se contabiliza (null si no se resolvió). */
  cuenta: string | null;
  /** La cuenta la confirmó el Contador (configuración contable) y es de pasivo. */
  cuentaConfirmada: boolean;
  /** Hoy se registra como gasto o ingreso (no como pasivo): pide revisión. */
  cuentaNoEsPasivo: boolean;
  terceros: SaldoTercero[];
}

export interface RespuestaDineroTerceros {
  conceptos: ConceptoTerceros[];
  /** Cuenta que usan el registro y la liquidación de recaudos. */
  cuentaRecaudos: string;
  /** Categorías de tesorería con esa cuenta (null si falta crearlas). */
  categorias: { ingreso: number | null; egreso: number | null };
  /** Propinas leídas hasta el tope (las más recientes): el total puede quedarse corto. */
  propinasTruncadas: boolean;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Una cuenta de pasivo (clase 2) es la que corresponde a dinero de terceros. */
export function esCuentaPasivo(cuenta: string | null | undefined): boolean {
  return typeof cuenta === 'string' && cuenta.startsWith('2');
}

export interface FilaPropina {
  amount: number | string | null;
  is_distributed: boolean | null;
  voided_at: string | null;
}

/** Recibido (no anuladas), liquidado (repartidas) y por pagar. */
export function resumirPropinas(filas: readonly FilaPropina[]): { recibido: number; liquidado: number; porPagar: number } {
  let recibido = 0;
  let liquidado = 0;
  for (const f of filas) {
    if (f.voided_at) continue;
    const v = Number(f.amount ?? 0) || 0;
    recibido += v;
    if (f.is_distributed) liquidado += v;
  }
  recibido = redondear(recibido);
  liquidado = redondear(liquidado);
  return { recibido, liquidado, porPagar: redondear(recibido - liquidado) };
}

export interface FilaAuxiliar {
  tercero_nit: string | null;
  tercero_nombre: string | null;
  debit: number | string | null;
  credit: number | string | null;
}

/**
 * Recaudos por tercero desde el auxiliar de la cuenta de pasivo: el crédito es
 * lo recibido para el tercero, el débito lo que se le liquidó. Ordenado por lo
 * que falta pagar (mayor primero); sin tercero se agrupa en «».
 */
export function resumirRecaudos(filas: readonly FilaAuxiliar[]): { recibido: number; liquidado: number; porPagar: number; terceros: SaldoTercero[] } {
  const porNit = new Map<string, SaldoTercero>();
  for (const f of filas) {
    const nit = (f.tercero_nit ?? '').trim();
    const actual = porNit.get(nit) ?? { nit, nombre: (f.tercero_nombre ?? '').trim(), recibido: 0, liquidado: 0, porPagar: 0 };
    actual.recibido += Number(f.credit ?? 0) || 0;
    actual.liquidado += Number(f.debit ?? 0) || 0;
    if (!actual.nombre && f.tercero_nombre) actual.nombre = f.tercero_nombre.trim();
    porNit.set(nit, actual);
  }
  const terceros = [...porNit.values()]
    .map((t) => ({ ...t, recibido: redondear(t.recibido), liquidado: redondear(t.liquidado), porPagar: redondear(t.recibido - t.liquidado) }))
    .filter((t) => t.recibido !== 0 || t.liquidado !== 0)
    .sort((a, b) => b.porPagar - a.porPagar || a.nombre.localeCompare(b.nombre, 'es'));
  const recibido = redondear(terceros.reduce((s, t) => s + t.recibido, 0));
  const liquidado = redondear(terceros.reduce((s, t) => s + t.liquidado, 0));
  return { recibido, liquidado, porPagar: redondear(recibido - liquidado), terceros };
}

/** Aviso de la cabecera: alguna cuenta en uso no es de pasivo (hoy, la de propinas). */
export function hayCuentaPorDefinir(conceptos: readonly ConceptoTerceros[]): boolean {
  return conceptos.some((c) => c.cuentaNoEsPasivo || !c.cuentaConfirmada);
}

/** Total por pagar de todos los conceptos. */
export function totalPorPagar(conceptos: readonly ConceptoTerceros[]): number {
  return redondear(conceptos.reduce((s, c) => s + c.porPagar, 0));
}
