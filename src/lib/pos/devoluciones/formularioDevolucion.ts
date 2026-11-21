/**
 * Estado del formulario «Crear devolución» (Figma `874:578120`, `874:578327` y
 * móvil `874:580876`). Son las mismas reglas que tenía `ReturnForm` (líneas,
 * cantidades con decimales de peso, seriales con su disposición, «Reingresa»),
 * sacadas a funciones puras para que el diálogo nuevo y sus pruebas las
 * compartan. Cambio del rediseño: el motivo es UNO para toda la devolución (se
 * manda como `reason_code` de cada línea y su nombre como `p_reason`), y las
 * líneas ya devueltas por completo se ven como «Agotada» en lugar de ocultarse.
 *
 * Nada de esto decide el monto ni el stock: `procesar_devolucion` vuelve a
 * calcular con lo cobrado y valida cantidades y seriales. Módulo hoja.
 */
import { montoReembolsoLinea, type MetodoReintegroPantalla } from './procesarDevolucion';
import { camposEnvioLinea, disposicionPorDefecto, erroresDevolucionPantalla, type DisposicionSerial } from './serialesLinea';
import { decimalesCantidad, esMedido, esPorPeso, redondearCantidadProducto, unidadVisible } from '@/lib/pos/peso/modoVenta';
import type { RefundData, SaleItemForReturn, SoldSerialInfo } from '@/components/pos/devoluciones/types';

export interface LineaFormulario {
  sale_item_id: string;
  product_id: number;
  nombre: string;
  sku: string;
  vendida: number;
  devuelta: number;
  /** Lo que queda por devolver (vendida − ya devuelta). 0 = agotada. */
  disponible: number;
  cantidad: number;
  seleccionada: boolean;
  /** Total cobrado de la línea (con descuento e impuesto), no el precio de lista. */
  total_cobrado: number;
  impuesto_linea: number;
  descuento_linea: number;
  serializada: boolean;
  seriales: SoldSerialInfo[];
  seriales_elegidos: number[];
  disposiciones: Record<string, DisposicionSerial>;
  /** Ids cuya disposición se eligió a mano (el motivo ya no la cambia). */
  disposicion_manual: number[];
  decimales: number;
  medida: boolean;
  unidad: string | null;
  por_peso: boolean;
  reingresa: boolean;
  reingresa_manual: boolean;
}

export function lineasIniciales(items: readonly SaleItemForReturn[]): LineaFormulario[] {
  return items.map((item) => {
    const medida = esMedido(item.product);
    const disponible = Math.max(0, Number(item.quantity) - Number(item.returned_quantity ?? 0));
    return {
      sale_item_id: item.id,
      product_id: item.product_id,
      nombre: item.product.name,
      sku: item.product.sku,
      vendida: Number(item.quantity),
      devuelta: Number(item.returned_quantity ?? 0),
      disponible,
      cantidad: 0,
      seleccionada: false,
      total_cobrado: Number(item.total),
      impuesto_linea: Number(item.tax_amount ?? 0),
      descuento_linea: Number(item.discount_amount ?? 0),
      serializada: item.product.track_serial === true,
      seriales: item.serials ?? [],
      seriales_elegidos: [],
      disposiciones: {},
      disposicion_manual: [],
      decimales: medida ? decimalesCantidad(item.product) : 0,
      medida,
      unidad: unidadVisible(item.product),
      por_peso: esPorPeso(item.product),
      reingresa: false,
      reingresa_manual: false,
    };
  });
}

export const agotada = (l: Pick<LineaFormulario, 'disponible'>) => !(l.disponible > 0);

/** Proporción de un importe de la línea por la cantidad devuelta (misma cuenta que la RPC). */
function prorrateo(importe: number, l: LineaFormulario, cantidad: number): number {
  return montoReembolsoLinea(importe, l.vendida, cantidad);
}

export const reintegroLinea = (l: LineaFormulario) => (l.seleccionada ? prorrateo(l.total_cobrado, l, l.cantidad) : 0);
export const impuestoLinea = (l: LineaFormulario) => (l.seleccionada ? prorrateo(l.impuesto_linea, l, l.cantidad) : 0);

export function alternarLinea(l: LineaFormulario, seleccionar: boolean, motivoRepone: boolean): LineaFormulario {
  if (agotada(l)) return l;
  if (!seleccionar) return { ...l, seleccionada: false, cantidad: 0, seriales_elegidos: [], disposiciones: {} };
  if (l.serializada) {
    // Al marcar la línea se preseleccionan los seriales vendidos, hasta lo que queda por devolver.
    const elegidos = l.seriales.slice(0, Math.max(0, Math.floor(l.disponible)));
    const defecto = disposicionPorDefecto(motivoRepone);
    return {
      ...l,
      seleccionada: true,
      seriales_elegidos: elegidos.map((s) => s.id),
      disposiciones: Object.fromEntries(elegidos.map((s) => [String(s.id), defecto])),
      cantidad: elegidos.length,
    };
  }
  // Por peso o medida se devuelve todo lo que queda de una vez; por unidad, 1.
  const cantidad = l.medida ? l.disponible : Math.min(1, l.disponible);
  const reingresa = l.por_peso || l.reingresa_manual ? l.reingresa : motivoRepone;
  return { ...l, seleccionada: true, cantidad, reingresa };
}

export function cambiarCantidad(l: LineaFormulario, cantidad: number): LineaFormulario {
  if (agotada(l) || l.serializada) return l;
  const valida = Math.max(0, Math.min(redondearCantidadProducto(cantidad, l.decimales), l.disponible));
  return { ...l, cantidad: valida, seleccionada: valida > 0 };
}

/** «Reingresa»: por peso el defecto es no; en el resto sigue al motivo hasta que el cajero lo mueva. */
export function cambiarReingresa(l: LineaFormulario, reingresa: boolean): LineaFormulario {
  return { ...l, reingresa, reingresa_manual: true };
}

export function alternarSerial(l: LineaFormulario, serialId: number, motivoRepone: boolean): LineaFormulario {
  const elegido = l.seriales_elegidos.includes(serialId);
  const ids = elegido ? l.seriales_elegidos.filter((id) => id !== serialId) : [...l.seriales_elegidos, serialId];
  const disposiciones = { ...l.disposiciones };
  if (!elegido && disposiciones[String(serialId)] === undefined) disposiciones[String(serialId)] = disposicionPorDefecto(motivoRepone);
  return { ...l, seriales_elegidos: ids, disposiciones, cantidad: ids.length, seleccionada: ids.length > 0 };
}

export function cambiarDisposicion(l: LineaFormulario, serialId: number, disposicion: DisposicionSerial): LineaFormulario {
  return {
    ...l,
    disposicion_manual: l.disposicion_manual.includes(serialId) ? l.disposicion_manual : [...l.disposicion_manual, serialId],
    disposiciones: { ...l.disposiciones, [String(serialId)]: disposicion },
  };
}

/** Al cambiar el motivo: disposición por defecto de los seriales no tocados y «Reingresa» si no se movió a mano. */
export function aplicarMotivo(l: LineaFormulario, motivoRepone: boolean): LineaFormulario {
  const defecto = disposicionPorDefecto(motivoRepone);
  const disposiciones = { ...l.disposiciones };
  for (const id of l.seriales_elegidos) if (!l.disposicion_manual.includes(id)) disposiciones[String(id)] = defecto;
  return { ...l, disposiciones, reingresa: l.por_peso || l.reingresa_manual ? l.reingresa : motivoRepone };
}

export interface ResumenDevolucion {
  lineas: number;
  unidades: number;
  /** Unidades que vuelven al inventario (seriales «vuelve a stock» o «Reingresa»). */
  reingresan: number;
  base: number;
  impuesto: number;
  descuento: number;
  total: number;
  /** La devolución deja la venta sin nada más por devolver. */
  completa: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function resumenDevolucion(lineas: readonly LineaFormulario[]): ResumenDevolucion {
  const elegidas = lineas.filter((l) => l.seleccionada && l.cantidad > 0);
  const total = r2(elegidas.reduce((a, l) => a + reintegroLinea(l), 0));
  const impuesto = r2(elegidas.reduce((a, l) => a + impuestoLinea(l), 0));
  const descuento = r2(elegidas.reduce((a, l) => a + prorrateo(l.descuento_linea, l, l.cantidad), 0));
  const reingresan = elegidas.reduce((a, l) => {
    if (l.serializada) return a + l.seriales_elegidos.filter((id) => l.disposiciones[String(id)] === 'in_stock').length;
    return a + (l.reingresa ? l.cantidad : 0);
  }, 0);
  const pendientes = lineas.filter((l) => !agotada(l));
  return {
    lineas: elegidas.length,
    unidades: elegidas.reduce((a, l) => a + l.cantidad, 0),
    reingresan,
    base: r2(total - impuesto),
    impuesto,
    descuento,
    total,
    completa: pendientes.length > 0 && pendientes.every((l) => l.seleccionada && l.cantidad >= l.disponible - 1e-9),
  };
}

export interface MotivoElegido {
  code: string;
  name: string;
  affects_inventory: boolean;
}

/** Errores de la pantalla (claves de `posDevoluciones.formulario.validacion`). */
export function validarFormulario(lineas: readonly LineaFormulario[], motivo: MotivoElegido | null) {
  return erroresDevolucionPantalla({
    motivoGeneral: motivo?.name ?? '',
    lineas: lineas.map((l) => ({
      id: l.sale_item_id,
      selected: l.seleccionada,
      return_quantity: l.cantidad,
      reason: motivo?.code ?? '',
      track_serial: l.serializada,
      serialesDisponibles: l.seriales.length,
      serialesElegidos: l.seriales_elegidos.length,
    })),
  });
}

/** Lo que se manda a `DevolucionesService.procesarDevolucion` (→ `procesar_devolucion`). */
export function datosDevolucion(
  lineas: readonly LineaFormulario[],
  motivo: MotivoElegido,
  metodo: MetodoReintegroPantalla,
  notas: string,
): RefundData {
  const elegidas = lineas.filter((l) => l.seleccionada && l.cantidad > 0);
  const resumen = resumenDevolucion(lineas);
  return {
    type: resumen.completa ? 'full' : 'partial',
    items: elegidas.map((l) => ({
      sale_item_id: l.sale_item_id,
      product_id: l.product_id,
      return_quantity: l.cantidad,
      refund_amount: reintegroLinea(l),
      reason: motivo.code,
      ...camposEnvioLinea({
        track_serial: l.serializada,
        selected_serial_ids: l.seriales_elegidos,
        serial_dispositions: l.disposiciones,
        afectaInventario: motivo.affects_inventory,
        restock: l.reingresa,
      }),
    })),
    refund_method: metodo,
    total_refund: resumen.total,
    reason: motivo.name,
    notes: notas.trim() || undefined,
  };
}
