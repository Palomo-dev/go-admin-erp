/**
 * Reglas puras de facturas de compra y cuentas por pagar (plan
 * docs/implementacion/FACTURAS-COMPRA-CXP-PLAN.md, F0).
 *
 * Sin Supabase ni React: las usan las pantallas para mostrar y validar ANTES de
 * llamar al servidor, y las pruebas de caracterización para fijar el
 * comportamiento. La verdad la tiene la base: `fn_factura_compra_guardar`
 * escribe `total_line` con esta misma regla (F-51, `splitGrossLine`) y los
 * disparadores recalculan la cabecera. Si una de las dos cambia, cambian las dos
 * (ver `src/__tests__/finanzas/compras/totalesCompra.test.ts`).
 */
import { splitGrossLine } from '@/lib/services/taxResolver';
import { sumarMesesAlDia } from '@/lib/services/fiscalCalendar';

// ─── Dinero ──────────────────────────────────────────────────────────────────

/** Centavos enteros, con la mitad lejos del cero (como `round()` de Postgres). */
export function aCentavos(valor: number | string | null | undefined): number {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-7);
}

export const deCentavos = (c: number): number => c / 100;

// ─── Pagos ───────────────────────────────────────────────────────────────────

export type MotivoMontoPago = 'monto_invalido' | 'excede_saldo';

export type ResultadoMontoPago = { valido: true } | { valido: false; motivo: MotivoMontoPago };

/**
 * L2: un pago no puede ser 0 ni negativo y no puede superar el saldo. Se compara
 * en centavos (0.1 + 0.2 no «supera» 0.3).
 */
export function validarMontoPago(saldo: number | string | null | undefined, monto: number | string | null | undefined): ResultadoMontoPago {
  const m = aCentavos(monto);
  if (m <= 0) return { valido: false, motivo: 'monto_invalido' };
  if (m > aCentavos(saldo)) return { valido: false, motivo: 'excede_saldo' };
  return { valido: true };
}

// ─── Líneas y totales ────────────────────────────────────────────────────────

export interface LineaCompraEntrada {
  qty: number;
  unit_price: number;
  discount_amount?: number | null;
  /** Porcentaje (19, 5, 0). */
  tax_rate?: number | null;
}

export interface LineaCompraCalculada {
  /** qty × precio − descuento, sin impuesto (base gravable). */
  base: number;
  impuesto: number;
  /** Bruto de la línea: lo que se escribe en `invoice_items.total_line`. */
  total_line: number;
}

/**
 * Una línea de compra. `taxIncluded`: el precio ya trae el impuesto (la base
 * sale por `splitGrossLine`); si no, el impuesto se suma a la base.
 *
 * HOY (bug §0.2) el formulario escribía `total_line = base` y el IVA se perdía:
 * esta función es la regla nueva, la misma de `fn_normalizar_impuesto_linea`.
 */
export function calcularLineaCompra(linea: LineaCompraEntrada, taxIncluded: boolean): LineaCompraCalculada {
  const neto = aCentavos(Number(linea.qty || 0) * Number(linea.unit_price || 0)) - aCentavos(linea.discount_amount);
  const tarifa = Number(linea.tax_rate || 0);
  if (taxIncluded) {
    const { base, tax } = splitGrossLine(neto / 100, tarifa);
    return { base, impuesto: tax, total_line: neto / 100 };
  }
  const impuesto = tarifa > 0 ? aCentavos((neto / 100) * (tarifa / 100)) : 0;
  return { base: neto / 100, impuesto: impuesto / 100, total_line: (neto + impuesto) / 100 };
}

export interface RetencionCompra {
  concepto: string;
  base: number;
  /** Porcentaje (2.5, 4, 11). */
  tarifa: number;
  /** Si llega, manda; si no, base × tarifa. */
  valor?: number | null;
}

export interface TotalesCompra {
  subtotal: number;
  impuestos: number;
  total: number;
  /** Base e impuesto por tarifa, en orden ascendente de tarifa. */
  porTarifa: Array<{ tarifa: number; base: number; impuesto: number }>;
  retenciones: number;
  /** D4: lo que se le debe al proveedor = total − retenciones (monto de la CxP). */
  netoAPagar: number;
}

export function valorRetencion(r: RetencionCompra): number {
  if (r.valor !== null && r.valor !== undefined && Number.isFinite(Number(r.valor))) return aCentavos(r.valor) / 100;
  return aCentavos(Number(r.base || 0) * (Number(r.tarifa || 0) / 100)) / 100;
}

/** Totales de la factura de compra, sumando en centavos. */
export function calcularTotalesCompra(
  lineas: readonly LineaCompraEntrada[],
  taxIncluded: boolean,
  retenciones: readonly RetencionCompra[] = [],
): TotalesCompra {
  let subtotal = 0;
  let impuestos = 0;
  let total = 0;
  const porTarifa = new Map<number, { base: number; impuesto: number }>();
  for (const l of lineas) {
    const c = calcularLineaCompra(l, taxIncluded);
    subtotal += aCentavos(c.base);
    impuestos += aCentavos(c.impuesto);
    total += aCentavos(c.total_line);
    const tarifa = Number(l.tax_rate || 0);
    const acc = porTarifa.get(tarifa) ?? { base: 0, impuesto: 0 };
    acc.base += aCentavos(c.base);
    acc.impuesto += aCentavos(c.impuesto);
    porTarifa.set(tarifa, acc);
  }
  const ret = retenciones.reduce((s, r) => s + aCentavos(valorRetencion(r)), 0);
  return {
    subtotal: subtotal / 100,
    impuestos: impuestos / 100,
    total: total / 100,
    porTarifa: [...porTarifa.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([tarifa, v]) => ({ tarifa, base: v.base / 100, impuesto: v.impuesto / 100 })),
    retenciones: ret / 100,
    netoAPagar: Math.max(0, total - ret) / 100,
  };
}

// ─── Base mínima de las retenciones ─────────────────────────────────────────

/**
 * Base mínima en moneda: UVT del año de la factura × UVT de la retención
 * (`organization_taxes.min_base_uvt`, `fiscal_uvt`). Redondeada al peso, como
 * se publican las tablas de la DIAN. `null` si falta cualquiera de los dos.
 */
export function baseMinimaEnMoneda(minimoUvt: number | null | undefined, valorUvt: number | null | undefined): number | null {
  const m = Number(minimoUvt);
  const u = Number(valorUvt);
  if (minimoUvt === null || minimoUvt === undefined || valorUvt === null || valorUvt === undefined) return null;
  if (!Number.isFinite(m) || !Number.isFinite(u) || m <= 0 || u <= 0) return null;
  return Math.round(m * u);
}

/**
 * ¿La base de la retención no llega a la base mínima? Solo avisa: la
 * retención se puede practicar igual (hay proveedores que piden retención
 * aunque no se llegue, y el concepto lo decide quien registra).
 */
export function retencionBajoBaseMinima(base: number | null | undefined, minimoUvt: number | null | undefined, valorUvt: number | null | undefined): boolean {
  const minimo = baseMinimaEnMoneda(minimoUvt, valorUvt);
  if (minimo === null) return false;
  return aCentavos(base) < aCentavos(minimo);
}

/**
 * Costo unitario que entra al kardex y a `product_costs` (D6): neto de descuento
 * y, para responsables de IVA, sin el IVA descontable. Es la regla de
 * `fn_factura_compra_recepcionar`; aquí solo para mostrar el resumen de la
 * recepción antes de confirmarla.
 */
export function costoUnitarioCompra(linea: LineaCompraEntrada, taxIncluded: boolean, ivaAlCosto = false): number {
  const qty = Number(linea.qty || 0);
  if (qty <= 0) return 0;
  const c = calcularLineaCompra(linea, taxIncluded);
  const valor = ivaAlCosto ? c.total_line : c.base;
  return Math.round((valor / qty) * 1e6) / 1e6;
}

/**
 * Costo promedio ponderado tras una entrada (L6). Mismo resultado que
 * `stockMovementService.incrementOnPurchase`: con existencia previa ≤ 0 el
 * promedio es el costo de la entrada.
 */
export function promedioPonderado(existencia: number, promedio: number, cantidad: number, costo: number): number {
  const q = Number(existencia) || 0;
  if (q <= 0) return Number(costo) || 0;
  return (q * (Number(promedio) || 0) + cantidad * costo) / (q + cantidad);
}

// ─── Estados y acciones ──────────────────────────────────────────────────────

export type EstadoFacturaCompra = 'draft' | 'received' | 'partial' | 'paid' | 'void';

export type EstadoRecepcion = 'por_recibir' | 'recibido' | 'no_aplica';

export type EstadoPagoCompra = 'pendiente' | 'parcial' | 'pagada' | 'anulada' | 'borrador';

/** §3.4: el pago se deriva del saldo, no del `status` (que solo es ciclo del documento). */
export function estadoPagoCompra(estado: string, total: number, saldo: number): EstadoPagoCompra {
  if (estado === 'void') return 'anulada';
  if (estado === 'draft') return 'borrador';
  const t = aCentavos(total);
  const s = aCentavos(saldo);
  if (s <= 0) return 'pagada';
  if (s < t) return 'parcial';
  return 'pendiente';
}

export interface AccionesFacturaCompra {
  editar: boolean;
  eliminar: boolean;
  confirmar: boolean;
  recepcionar: boolean;
  registrarPago: boolean;
  anular: boolean;
}

/**
 * L3 (regla nueva, §3.4): solo se edita y elimina en borrador; se confirma un
 * borrador; se recepciona una confirmada que no ha entrado a inventario; se paga
 * una confirmada con saldo; se anula lo que no está anulado y no tiene pagos
 * completados.
 *
 * HOY `recepcionarInventario` dejaba recepcionar una `partial` (podía meter el
 * stock dos veces) y `actualizarFactura` editaba `pending`, que no existe en el
 * CHECK de la tabla.
 */
export function accionesPermitidas(f: {
  estado: string;
  recepcion: EstadoRecepcion;
  saldo: number;
  tienePagos: boolean;
}): AccionesFacturaCompra {
  const confirmada = f.estado === 'received' || f.estado === 'partial' || f.estado === 'paid';
  return {
    editar: f.estado === 'draft',
    eliminar: f.estado === 'draft' && !f.tienePagos,
    confirmar: f.estado === 'draft',
    recepcionar: confirmada && f.recepcion === 'por_recibir',
    registrarPago: confirmada && aCentavos(f.saldo) > 0,
    anular: f.estado !== 'void' && !f.tienePagos,
  };
}

/**
 * Recepción derivada (§3.4): con `stock_received_at`, recibida; si no hay líneas
 * con producto, no aplica; si no, por recibir.
 */
export function estadoRecepcion(f: { stock_received_at?: string | null; lineasConProducto: number }): EstadoRecepcion {
  if (f.stock_received_at) return 'recibido';
  if (f.lineasConProducto <= 0) return 'no_aplica';
  return 'por_recibir';
}

// ─── Número ──────────────────────────────────────────────────────────────────

/**
 * L13: consecutivo interno sugerido `COMP-AAAA-NNNN`, a partir de los números del
 * año. HOY se tomaba el último por `created_at` (un número editado a mano rompía
 * la serie); aquí el mayor, que es lo que hace `fn_siguiente_numero_compra`.
 */
export function sugerirNumeroCompra(numerosDelAnio: readonly (string | null | undefined)[], anio: number): string {
  const prefijo = `COMP-${anio}-`;
  let mayor = 0;
  for (const n of numerosDelAnio) {
    if (!n || !n.toUpperCase().startsWith(prefijo)) continue;
    const resto = Number.parseInt(n.slice(prefijo.length), 10);
    if (Number.isFinite(resto) && resto > mayor) mayor = resto;
  }
  return `${prefijo}${String(mayor + 1).padStart(4, '0')}`;
}

/** Número normalizado para detectar duplicados por proveedor (igual que la RPC). */
export const normalizarNumeroCompra = (n: string | null | undefined): string => (n ?? '').trim().toUpperCase();

// ─── Cuotas ──────────────────────────────────────────────────────────────────

export interface CuotaPlan {
  numero: number;
  /** Día calendario `YYYY-MM-DD` (`ap_installments.due_date` es `date`). */
  vence: string;
  capital: number;
  interes: number;
  valor: number;
}

/**
 * L8: reparte `total` en `n` cuotas redondeadas a centavos; la última absorbe la
 * diferencia. Vencimientos por mes calendario desde `primerDia`, recortados al
 * último día del mes (31-ene + 1 mes = 28/29-feb). Interés simple por cuota
 * sobre el capital de la cuota.
 *
 * HOY `CuentaPorPagarDetailService.crearCuotas` dejaba la última cuota sin
 * redondear (100 / 3 → 33,33 · 33,33 · 33,333…).
 */
export function planCuotas(total: number, n: number, primerDia: string, interesPct = 0): CuotaPlan[] {
  const cuotas = Math.max(1, Math.floor(n));
  const totalC = aCentavos(total);
  const capitalC = Math.floor(totalC / cuotas);
  const plan: CuotaPlan[] = [];
  for (let i = 1; i <= cuotas; i++) {
    const cap = i === cuotas ? totalC - capitalC * (cuotas - 1) : capitalC;
    const int = aCentavos((cap / 100) * (interesPct / 100));
    plan.push({
      numero: i,
      vence: sumarMesesAlDia(primerDia, i - 1),
      capital: cap / 100,
      interes: int / 100,
      valor: (cap + int) / 100,
    });
  }
  return plan;
}

// ─── Pagos de una factura ────────────────────────────────────────────────────

export interface PagoHistorial {
  id: string;
  created_at: string | null;
  payment_date?: string | null;
}

/**
 * L11: pagos de una factura = los directos (`invoice_purchase`) + los de su CxP
 * (`account_payable`), sin duplicados, del más reciente al más antiguo.
 */
export function fusionarPagos<P extends PagoHistorial>(directos: readonly P[], deLaCuenta: readonly P[]): P[] {
  const vistos = new Set<string>();
  const todos: P[] = [];
  for (const p of [...directos, ...deLaCuenta]) {
    if (vistos.has(p.id)) continue;
    vistos.add(p.id);
    todos.push(p);
  }
  const clave = (p: P) => new Date(p.payment_date ?? p.created_at ?? 0).getTime() || 0;
  return todos.sort((a, b) => clave(b) - clave(a));
}
