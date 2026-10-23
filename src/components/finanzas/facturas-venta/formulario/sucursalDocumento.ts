/**
 * El selector global de sucursal solo propone la del documento la primera vez,
 * y solo si el documento es nuevo. Un borrador ya guardado conserva la suya
 * (`cargarFactura` escribe `branch_id`). Cambiar el selector después no pisa
 * la sucursal elegida en el formulario.
 */
export function aplicarSucursalGlobal(estado: {
  documentoNuevo: boolean;
  yaAplicada: boolean;
  sucursal: number | null;
  selectorGlobal: number | null;
}): { sucursal: number | null; yaAplicada: boolean } {
  if (!estado.documentoNuevo || estado.yaAplicada) {
    return { sucursal: estado.sucursal, yaAplicada: true };
  }
  if (!estado.selectorGlobal) {
    return { sucursal: estado.sucursal, yaAplicada: false };
  }
  return { sucursal: estado.selectorGlobal, yaAplicada: true };
}
