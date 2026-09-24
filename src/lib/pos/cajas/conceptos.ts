/**
 * Catálogo ÚNICO de conceptos de movimiento de caja (K10 de
 * docs/implementacion/CAJAS-VENTAS-PLAN.md). Módulo hoja, sin dependencias.
 *
 * Antes había dos catálogos distintos: el del diálogo del POS
 * (`MovimientosDialog`, guardaba el texto en el idioma de quien registraba) y
 * el de la página «Nuevo movimiento» (guardaba el español). El mismo concepto
 * quedaba escrito de maneras distintas y no se podía traducir ni agrupar.
 *
 * Ahora se guardan dos cosas:
 * - `cash_movements.concept_code`: la clave estable (`gastosMenores`), que la
 *   pantalla traduce con `cajas.conceptos.<clave>`.
 * - `cash_movements.concept`: el texto canónico en español, que siguen leyendo
 *   el asiento automático (`fn_auto_journal_cash_movement`), Finanzas y los
 *   reportes. En «Otro…» es el texto libre de quien registra.
 *
 * Los movimientos viejos (sin `concept_code`) se reconocen por su texto si
 * coincide con uno de los catálogos anteriores (`claveDeConcepto`); si no, se
 * muestran tal cual.
 *
 * D9: «Depósito bancario» / «Retiro para depósito» ya no se ofrecen: llevar
 * efectivo al banco es un traslado de Tesorería. Mientras ese traslado no
 * exista, el egreso es «Retiro para consignación».
 */

export type TipoMovimiento = 'in' | 'out';

export const CONCEPTOS_INGRESO = [
  'fondoAdicional',
  'cambioEfectivo',
  'prestamoInterno',
  'ventaContadoEspecial',
  'devolucionRecibida',
  'otroIngreso',
] as const;

export const CONCEPTOS_EGRESO = [
  'gastosMenores',
  'compraInsumos',
  'pagoProveedor',
  'gastoOperativo',
  'retiroEfectivo',
  'retiroConsignacion',
  'prestamoEmpleado',
  'cambioEfectivo',
  'otroEgreso',
] as const;

export type ClaveConcepto = (typeof CONCEPTOS_INGRESO)[number] | (typeof CONCEPTOS_EGRESO)[number];

/** Conceptos que se ofrecen para cada tipo, en orden. */
export function conceptosDe(tipo: TipoMovimiento): readonly ClaveConcepto[] {
  return tipo === 'in' ? CONCEPTOS_INGRESO : CONCEPTOS_EGRESO;
}

/** «Otro…»: el concepto lo escribe quien registra. */
export function esConceptoLibre(clave: string | null | undefined): boolean {
  return clave === 'otroIngreso' || clave === 'otroEgreso';
}

/** Texto canónico (español) que se guarda en `cash_movements.concept`. */
export const TEXTO_CANONICO: Record<ClaveConcepto, string> = {
  fondoAdicional: 'Fondo adicional',
  cambioEfectivo: 'Cambio de efectivo',
  prestamoInterno: 'Préstamo interno',
  ventaContadoEspecial: 'Venta contado especial',
  devolucionRecibida: 'Devolución recibida',
  otroIngreso: 'Otro ingreso',
  gastosMenores: 'Gastos menores',
  compraInsumos: 'Compra de insumos',
  pagoProveedor: 'Pago a proveedor',
  gastoOperativo: 'Gasto operativo',
  retiroEfectivo: 'Retiro de efectivo',
  retiroConsignacion: 'Retiro para consignación',
  prestamoEmpleado: 'Préstamo a empleado',
  otroEgreso: 'Otro egreso',
};

const TODAS = new Set<string>([...CONCEPTOS_INGRESO, ...CONCEPTOS_EGRESO]);

export function esClaveConcepto(valor: unknown): valor is ClaveConcepto {
  return typeof valor === 'string' && TODAS.has(valor);
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Textos de los dos catálogos anteriores (en español, que es lo que quedó
 * guardado) → clave del catálogo único. Solo para mostrar movimientos viejos.
 */
const TEXTOS_HEREDADOS: Record<string, ClaveConcepto> = {
  // Página «Nuevo movimiento» (guardaba el español).
  'cambio de efectivo': 'cambioEfectivo',
  'deposito bancario': 'otroIngreso',
  'prestamo interno': 'prestamoInterno',
  'fondo adicional': 'fondoAdicional',
  'otro ingreso': 'otroIngreso',
  'compra de insumos': 'compraInsumos',
  'pago a proveedor': 'pagoProveedor',
  'retiro para deposito': 'retiroConsignacion',
  'gasto operativo': 'gastoOperativo',
  'devolucion cliente': 'otroEgreso',
  'otro egreso': 'otroEgreso',
  // Diálogo del POS (guardaba la etiqueta en el idioma de quien registraba; aquí la española).
  prestamo: 'prestamoInterno',
  devolucion: 'devolucionRecibida',
  'cambio de billetes': 'cambioEfectivo',
  'venta contado especial': 'ventaContadoEspecial',
  'gastos menores': 'gastosMenores',
  'retiro de efectivo': 'retiroEfectivo',
  'prestamo a empleado': 'prestamoEmpleado',
};

/**
 * Clave con que se muestra un movimiento: `concept_code` si lo tiene; si no,
 * la del texto heredado cuando coincide exactamente con un concepto con nombre
 * propio. «Otro …» y textos libres devuelven `null`: se muestra el texto.
 */
export function claveDeConcepto(movimiento: { concept?: string | null; concept_code?: string | null }): ClaveConcepto | null {
  if (esClaveConcepto(movimiento.concept_code) && !esConceptoLibre(movimiento.concept_code)) {
    return movimiento.concept_code;
  }
  if (movimiento.concept_code) return null;
  const clave = movimiento.concept ? TEXTOS_HEREDADOS[normalizar(movimiento.concept)] : undefined;
  return clave && !esConceptoLibre(clave) ? clave : null;
}

/** Lo que se guarda en `cash_movements` para un concepto elegido. */
export function conceptoParaGuardar(clave: ClaveConcepto, textoLibre?: string | null): { concept: string; concept_code: ClaveConcepto } {
  if (esConceptoLibre(clave)) {
    return { concept: (textoLibre ?? '').trim().slice(0, 200), concept_code: clave };
  }
  return { concept: TEXTO_CANONICO[clave], concept_code: clave };
}

export type ErrorMovimiento = 'tipo_invalido' | 'concepto_requerido' | 'concepto_no_corresponde' | 'monto_invalido';

export interface DatosMovimiento {
  tipo: TipoMovimiento | string;
  clave: string | null;
  textoLibre?: string | null;
  monto: number | null;
}

/** Validación de un movimiento antes de guardarlo; `null` si está bien. */
export function validarMovimiento(datos: DatosMovimiento): ErrorMovimiento | null {
  if (datos.tipo !== 'in' && datos.tipo !== 'out') return 'tipo_invalido';
  if (!datos.clave || !esClaveConcepto(datos.clave)) return 'concepto_requerido';
  if (!conceptosDe(datos.tipo).includes(datos.clave)) return 'concepto_no_corresponde';
  if (esConceptoLibre(datos.clave) && !(datos.textoLibre ?? '').trim()) return 'concepto_requerido';
  const monto = datos.monto;
  if (monto === null || !Number.isFinite(monto) || monto <= 0 || monto > 1e12) return 'monto_invalido';
  return null;
}

/** Efecto del movimiento en el efectivo esperado: antes → después. */
export function efectoEnCaja(esperadoActual: number, tipo: TipoMovimiento, monto: number): number {
  const m = Number.isFinite(monto) && monto > 0 ? monto : 0;
  return Math.round((esperadoActual + (tipo === 'in' ? m : -m)) * 100) / 100;
}
