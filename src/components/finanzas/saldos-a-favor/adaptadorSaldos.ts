/**
 * Un saldo a favor tiene dos espejos: el del cliente (anticipo recibido, cuenta
 * 2805) y el del proveedor (anticipo entregado, cuenta 1330). Los diálogos de
 * registrar, aplicar y devolver son UNA sola pieza para los dos (regla del
 * dueño: una pieza para varias páginas); cambian el tercero, los textos y el
 * servicio que habla con el servidor. Sin React.
 *
 * - Cliente: `/api/saldos-a-favor/**` (credit_notes, fn_saldo_favor_*).
 * - Proveedor: `/api/anticipos-proveedor/**` (supplier_advances, fn_anticipo_proveedor_*).
 */
import type { ContextoSaldoFavor, FacturaAbiertaSaldo } from '@/lib/finanzas/saldosAFavor/contrato';
import { saldosAFavorService } from './saldosAFavorService';

export type TerceroSaldo = 'cliente' | 'proveedor';

export interface RegistrarSaldoEntrada {
  terceroId: string;
  monto: number;
  metodo: string;
  cuentaBancaria: number | null;
  referencia: string;
  notas: string;
  /** Solo cliente: el anticipo del proveedor no vence. */
  vence: string | null;
  sucursalId: number;
  claveIdempotencia: string;
  /**
   * Datos propios del tercero que pone el `complemento` del diálogo (proveedor:
   * naturaleza del anticipo, tarifa de IVA y conceptos de retención). El
   * adaptador los valida y los manda; el diálogo no los interpreta.
   */
  extra?: Record<string, unknown> | null;
}

export interface AplicarSaldoEntrada {
  saldoId: string;
  documentoId: string;
  monto: number;
  claveIdempotencia: string;
  /** Proveedor: `{ correccion: { motivo, soporte } }` tras un rechazo por retención repetida. */
  extra?: Record<string, unknown> | null;
}

export interface DevolverSaldoEntrada {
  monto: number;
  metodo: string;
  motivo: string;
  cuentaBancaria: number | null;
  referencia: string;
  claveIdempotencia: string;
  /** Datos del `complemento` del diálogo (proveedor: retenciones de la parte devuelta). */
  extra?: Record<string, unknown> | null;
}

export interface AdaptadorSaldos {
  tercero: TerceroSaldo;
  /**
   * Namespace de textos con las claves de `finanzasDocumentosR3.saldos`
   * (`anticipo.*`, `aplicar.*`, `devolver.*`, `validacion.*`, `errores.*`,
   * `cargando`, `sinCliente`).
   */
  namespace: string;
  /** El anticipo puede llevar fecha de vencimiento (solo el del cliente). */
  conVencimiento: boolean;
  /**
   * La devolución exige soporte (consignación, recibo) aunque el método no pida
   * referencia. Proveedor: sí (P7 del Contador, la devolución real lleva soporte).
   */
  soporteObligatorio?: boolean;
  contexto(sucursalId: number | null): Promise<ContextoSaldoFavor>;
  /** Documentos abiertos del tercero a los que se aplica: facturas de venta o cuentas por pagar. */
  documentosAbiertos(terceroId: string): Promise<FacturaAbiertaSaldo[]>;
  registrar(e: RegistrarSaldoEntrada): Promise<{ id: string; recibo: string }>;
  aplicar(e: AplicarSaldoEntrada): Promise<unknown>;
  devolver(saldoId: string, e: DevolverSaldoEntrada): Promise<unknown>;
}

/** El de siempre: saldo a favor del cliente. */
export const ADAPTADOR_CLIENTE: AdaptadorSaldos = {
  tercero: 'cliente',
  namespace: 'finanzasDocumentosR3.saldos',
  conVencimiento: true,
  contexto: (sucursalId) => saldosAFavorService.contexto(sucursalId),
  documentosAbiertos: (clienteId) => saldosAFavorService.listarFacturasPendientes(clienteId),
  registrar: async (e) => {
    const r = await saldosAFavorService.crear({
      customerId: e.terceroId,
      amount: e.monto,
      metodo: e.metodo,
      cuentaBancaria: e.cuentaBancaria,
      referencia: e.referencia,
      notes: e.notas,
      expiry: e.vence,
      branchId: e.sucursalId,
      claveIdempotencia: e.claveIdempotencia,
    });
    return { id: r.credito_id, recibo: r.recibo };
  },
  aplicar: (e) =>
    saldosAFavorService.aplicar({ creditId: e.saldoId, invoiceId: e.documentoId, amount: e.monto, claveIdempotencia: e.claveIdempotencia }),
  devolver: (saldoId, e) =>
    saldosAFavorService.devolver(saldoId, {
      monto: e.monto,
      metodo: e.metodo,
      motivo: e.motivo,
      cuentaBancaria: e.cuentaBancaria,
      referencia: e.referencia,
      claveIdempotencia: e.claveIdempotencia,
    }),
};
