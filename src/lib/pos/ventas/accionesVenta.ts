/**
 * Qué acciones admite una venta y, si no, POR QUÉ (paso 15 de
 * docs/implementacion/CAJAS-VENTAS-PLAN.md: «acciones deshabilitadas con
 * motivo», nunca un botón gris sin explicación). Lo usan el menú ⋯ del
 * listado y la barra del detalle. Módulo hoja, sin React.
 *
 * Las reglas copian lo que rechazan las RPC, para avisar antes de intentarlo:
 * - `pos_anular_venta_v1`: `venta_con_devoluciones`, `sin_permiso` (pos.void).
 *   Los pedidos web se anulan desde Pedidos online (el pedido y su venta van
 *   juntos), así que aquí la acción queda deshabilitada con ese motivo.
 * - `procesar_devolucion`: solo ventas `paid` y `pos.refund`.
 * - `fn_registrar_pago` (origen `venta_pos`): saldo > 0, factura o cuenta por
 *   cobrar a la que aplicar el pago, `pos.create`.
 * La barrera real sigue siendo la RPC.
 */
import type { EstadoVenta, OrigenVenta } from './estadoVenta';

/** Permisos de las acciones de venta, resueltos en el servidor (`permisosVentas.ts`). */
export interface PermisosVentas {
  /** `pos.void`: anular una venta. */
  anular: boolean;
  /** `pos.refund`: crear una devolución. */
  devolver: boolean;
  /** `pos.create`: cobrar el saldo de una venta y duplicarla en el POS. */
  vender: boolean;
  /** `reports.sales`: exportar el listado. */
  exportar: boolean;
}

export const SIN_PERMISOS_VENTAS: PermisosVentas = { anular: false, devolver: false, vender: false, exportar: false };

export type AccionVenta = 'cobrar' | 'devolver' | 'imprimir' | 'duplicar' | 'anular';

export type MotivoAccionVenta =
  | 'sin_permiso'
  | 'pendiente_sincronizar'
  | 'pedido_web'
  | 'con_devoluciones'
  | 'saldo_pendiente'
  | 'ya_devuelta'
  | 'sin_factura'
  | 'sin_documento_cobro';

/** `visible: false` = la acción no aplica a esta venta (se oculta, no se deshabilita). */
export interface DisponibilidadAccion {
  visible: boolean;
  habilitada: boolean;
  motivo: MotivoAccionVenta | null;
}

export interface VentaParaAcciones {
  estado: EstadoVenta;
  origen: OrigenVenta;
  saldo: number;
  devuelto: number;
  factura_id: string | null;
  cxc_id: string | null;
}

const OCULTA: DisponibilidadAccion = { visible: false, habilitada: false, motivo: null };
const LISTA: DisponibilidadAccion = { visible: true, habilitada: true, motivo: null };
const no = (motivo: MotivoAccionVenta): DisponibilidadAccion => ({ visible: true, habilitada: false, motivo });

export function disponibilidadAccion(accion: AccionVenta, v: VentaParaAcciones, p: PermisosVentas): DisponibilidadAccion {
  const anulada = v.estado === 'anulada';
  const sinSync = v.estado === 'pendiente_sincronizar';
  switch (accion) {
    case 'cobrar':
      if (anulada || v.estado === 'borrador' || v.saldo <= 0.005) return OCULTA;
      if (sinSync) return no('pendiente_sincronizar');
      if (!p.vender) return no('sin_permiso');
      if (!v.factura_id && !v.cxc_id) return no('sin_documento_cobro');
      return LISTA;
    case 'devolver':
      if (anulada || v.estado === 'borrador') return OCULTA;
      if (sinSync) return no('pendiente_sincronizar');
      if (v.estado === 'devuelta') return no('ya_devuelta');
      if (v.estado === 'pendiente_pago' || v.estado === 'pago_parcial') return no('saldo_pendiente');
      if (!p.devolver) return no('sin_permiso');
      return LISTA;
    case 'imprimir':
      if (sinSync) return no('pendiente_sincronizar');
      if (!v.factura_id) return no('sin_factura');
      return LISTA;
    case 'duplicar':
      if (!p.vender) return no('sin_permiso');
      return LISTA;
    case 'anular':
      if (anulada) return OCULTA;
      if (sinSync) return no('pendiente_sincronizar');
      if (v.origen === 'web') return no('pedido_web');
      if (v.devuelto > 0) return no('con_devoluciones');
      if (!p.anular) return no('sin_permiso');
      return LISTA;
  }
}

/** Todas las acciones de una venta. */
export function accionesDeVenta(v: VentaParaAcciones, p: PermisosVentas): Record<AccionVenta, DisponibilidadAccion> {
  return {
    cobrar: disponibilidadAccion('cobrar', v, p),
    devolver: disponibilidadAccion('devolver', v, p),
    imprimir: disponibilidadAccion('imprimir', v, p),
    duplicar: disponibilidadAccion('duplicar', v, p),
    anular: disponibilidadAccion('anular', v, p),
  };
}

/**
 * Destino del pago único (`RegistrarPagoConectado`): la factura si la hay (su
 * pago recalcula la cartera por disparador); si no, la cuenta por cobrar.
 */
export function destinoCobro(v: Pick<VentaParaAcciones, 'factura_id' | 'cxc_id'>): { tipo: 'factura'; id: string } | { tipo: 'cuenta'; id: string } | null {
  if (v.factura_id) return { tipo: 'factura', id: v.factura_id };
  if (v.cxc_id) return { tipo: 'cuenta', id: v.cxc_id };
  return null;
}
