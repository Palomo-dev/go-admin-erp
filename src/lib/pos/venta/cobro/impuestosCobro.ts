/**
 * «Impuestos incluidos» del cobro del POS.
 *
 * El carrito puede quedar con `tax_included` en true (la preferencia del
 * puesto o un interruptor anterior) aunque ninguna línea lo tenga: al agregar
 * productos el flag no se copia y el total que ve el cajero SUMA el impuesto.
 * Si el cobro hereda ese flag, saca el impuesto del precio y cobra de menos
 * (17.496 con 8 % encima pasa a 16.200) y apagar la casilla no lo revierte,
 * porque el cálculo seguía leyendo el flag del carrito.
 *
 * La casilla del cobro arranca como las líneas (lo que ya muestra el carrito).
 * Si el cajero la mueve, esa decisión vale para toda la venta.
 */

export interface LineaImpuestoCobro {
  tax_included?: boolean | null;
  tax_excluded?: boolean | null;
}

/**
 * Valor inicial de la casilla: encendida solo cuando todas las líneas que
 * llevan impuesto ya lo traen en el precio. Sin líneas marcadas, apagada,
 * aunque el carrito diga lo contrario.
 */
export function casillaInicialImpuestosIncluidos(items: readonly LineaImpuestoCobro[]): boolean {
  const conImpuesto = items.filter((item) => !item.tax_excluded);
  if (conImpuesto.length === 0) return false;
  return conImpuesto.every((item) => item.tax_included === true);
}

/**
 * Si el impuesto de esta línea ya va dentro del precio en el cobro.
 * Una línea excluida nunca lo trae incluido (el cobro se lo suma, como antes).
 * Si el cajero movió la casilla, manda la casilla. Si no, manda la línea y,
 * cuando la línea no dice nada, la casilla — nunca el flag suelto del carrito.
 */
export function impuestoIncluidoDeLinea(
  item: LineaImpuestoCobro,
  casilla: boolean,
  casillaMovida: boolean,
): boolean {
  if (item.tax_excluded) return false;
  if (casillaMovida) return casilla;
  if (item.tax_included != null) return item.tax_included === true;
  return casilla;
}
