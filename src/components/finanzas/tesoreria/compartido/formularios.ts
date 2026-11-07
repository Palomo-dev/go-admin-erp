/**
 * El alta y el detalle de un ingreso o egreso: UNA sola pieza cada uno, con el
 * tipo como variante. Las usan Movimientos, Ingresos y Egresos (y cualquier
 * pantalla nueva de Tesorería) desde aquí, para que un cambio en el formulario
 * o en el detalle llegue igual a las tres. `src/__tests__/finanzas/tesoreriaCompartido.test.ts`
 * comprueba que nadie importa otra copia.
 */
export { FormularioMovimientoTesoreria } from '@/components/finanzas/movimientos/FormularioMovimientoTesoreria';
export { DetalleMovimientoTesoreria } from '@/components/finanzas/movimientos/DetalleMovimientoTesoreria';
