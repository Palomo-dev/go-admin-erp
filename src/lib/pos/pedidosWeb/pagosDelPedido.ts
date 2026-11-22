/**
 * Pagos del pedido online tal como los muestra la tarjeta «Pagos» (Figma `2725:192149`):
 * pasarela (Bold, Wompi, Mercado Pago, PayU…), submétodo (tarjeta con marca y últimos 4,
 * Nequi, PSE…), referencia, fecha, importe y estado. Puro, sin React ni Supabase: lo prueba
 * `__tests__/pagosDelPedido.test.ts`.
 *
 * De dónde sale (columnas verificadas por MCP, 2026-11-21): `payments` con
 * `source = 'web_order'` (la pasarela confirma el pedido) y, tras la confirmación,
 * `source = 'invoice_sales'` de la factura de la venta. `payments.method` guarda el código
 * con que se cobró (`mp`, `bold_link`, `wompi`… o el medio: `nequi`, `pse`, `card`) y
 * `payments.processor` la pasarela cuando la conoce. El submétodo sale de
 * `processor_response`, que trae la respuesta cruda de cada pasarela:
 *  - Mercado Pago: `payment_method_id` (visa, master, pse, boton_bancolombia…),
 *    `payment_type_id` y `card.last_four_digits`.
 *  - Bold: `payment_method` (texto: CARD, NEQUI, PSE…).
 *  - Wompi: `payment_method_type` (CARD, NEQUI, PSE, BANCOLOMBIA_TRANSFER…) y
 *    `payment_method.extra.brand` / `.last_four`.
 *  - Marcado a mano («Marcar como pagado»): `pasarela`.
 * La consulta solo trae esas rutas (nunca la respuesta entera: lleva datos del pagador).
 */

export type Pasarela = 'mercadopago' | 'bold' | 'wompi' | 'payu' | 'stripe' | 'paypal';

/** Nombres propios: iguales en todos los idiomas. */
export const NOMBRE_PASARELA: Record<Pasarela, string> = {
  mercadopago: 'Mercado Pago',
  bold: 'Bold',
  wompi: 'Wompi',
  payu: 'PayU',
  stripe: 'Stripe',
  paypal: 'PayPal',
};

/** Iniciales del chip de la pasarela (no hay logos en el repositorio). */
export const INICIALES_PASARELA: Record<Pasarela, string> = {
  mercadopago: 'MP',
  bold: 'B',
  wompi: 'W',
  payu: 'PU',
  stripe: 'S',
  paypal: 'PP',
};

const PASARELA_POR_CODIGO: Record<string, Pasarela> = {
  mp: 'mercadopago',
  mercadopago: 'mercadopago',
  mercado_pago: 'mercadopago',
  mp_checkout: 'mercadopago',
  bold: 'bold',
  bold_link: 'bold',
  bold_qr: 'bold',
  bold_card: 'bold',
  bold_pos: 'bold',
  wompi: 'wompi',
  wompi_co: 'wompi',
  payu: 'payu',
  payu_co: 'payu',
  stripe: 'stripe',
  stripe_payments: 'stripe',
  paypal: 'paypal',
  paypal_checkout: 'paypal',
};

/** Pasarela de un código de método, de conector o de `payments.processor`; null si no es una. */
export function pasarelaDeCodigo(codigo: string | null | undefined): Pasarela | null {
  if (!codigo) return null;
  return PASARELA_POR_CODIGO[codigo.trim().toLowerCase()] ?? null;
}

/**
 * Submétodo normalizado. Los que no son nombres propios se traducen en la pantalla
 * (`detallesMarca.pagos.submetodos.*`).
 */
export type Submetodo =
  | 'card'
  | 'nequi'
  | 'pse'
  | 'daviplata'
  | 'transfer'
  | 'cash'
  | 'botonBancolombia'
  | 'corresponsalBancolombia'
  | 'cuotasBancolombia'
  | 'dineroEnCuenta'
  | 'suPlus';

/** Fila de `payments` con las rutas de `processor_response` que lee la tarjeta. */
export interface FilaPagoPedido {
  id: string;
  method: string | null;
  amount: number | string | null;
  status: string | null;
  payment_date: string | null;
  created_at: string | null;
  reference?: string | null;
  processor?: string | null;
  /** Mercado Pago `payment_method_id`. */
  mp_metodo?: string | null;
  /** Mercado Pago `payment_type_id`. */
  mp_tipo?: string | null;
  /** Mercado Pago `card.last_four_digits`. */
  mp_ultimos4?: string | null;
  /** Bold `payment_method` (texto). */
  bold_metodo?: unknown;
  /** Wompi `payment_method_type`. */
  wompi_tipo?: string | null;
  /** Wompi `payment_method.extra.brand`. */
  wompi_marca?: string | null;
  /** Wompi `payment_method.extra.last_four`. */
  wompi_ultimos4?: string | null;
  /** Marcado a mano: `processor_response.pasarela`. */
  manual_pasarela?: string | null;
}

export interface PagoPresentable {
  id: string;
  pasarela: Pasarela | null;
  /** Código guardado en `payments.method` (para la etiqueta cuando no hay pasarela). */
  metodo: string;
  submetodo: Submetodo | null;
  /** «Visa», «Mastercard»… (nombre propio). */
  marcaTarjeta: string | null;
  ultimos4: string | null;
  referencia: string | null;
  fecha: string | null;
  monto: number;
  /** `payments.status`: completed · pending · failed · void… */
  estado: string;
}

const SUBMETODO_POR_CODIGO: Record<string, Submetodo> = {
  card: 'card',
  credit_card: 'card',
  debit_card: 'card',
  tarjeta: 'card',
  nequi: 'nequi',
  pse: 'pse',
  daviplata: 'daviplata',
  transfer: 'transfer',
  bank_transfer: 'transfer',
  transferencia: 'transfer',
  cash: 'cash',
  efectivo: 'cash',
  cash_on_delivery: 'cash',
  boton_bancolombia: 'botonBancolombia',
  bancolombia_transfer: 'botonBancolombia',
  bancolombia_collect: 'corresponsalBancolombia',
  bancolombia_bnpl: 'cuotasBancolombia',
  account_money: 'dineroEnCuenta',
  su_plus: 'suPlus',
};

const MARCAS: Record<string, string> = {
  visa: 'Visa',
  debvisa: 'Visa',
  master: 'Mastercard',
  mastercard: 'Mastercard',
  debmaster: 'Mastercard',
  amex: 'American Express',
  american_express: 'American Express',
  diners: 'Diners Club',
  codensa: 'Codensa',
};

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function clave(v: unknown): string | null {
  const s = texto(v);
  return s ? s.toLowerCase() : null;
}

function cuatroDigitos(v: unknown): string | null {
  const s = texto(v);
  return s && /^\d{4}$/.test(s) ? s : null;
}

/** Pasarela del pago: la que guardó el procesador; si no, la del método o la forma de la respuesta. */
export function pasarelaDelPago(f: FilaPagoPedido): Pasarela | null {
  return (
    pasarelaDeCodigo(f.processor) ??
    pasarelaDeCodigo(f.method) ??
    pasarelaDeCodigo(f.manual_pasarela) ??
    (texto(f.wompi_tipo) ? 'wompi' : null) ??
    (texto(f.mp_metodo) ? 'mercadopago' : null) ??
    (codigoBold(f.bold_metodo) ? 'bold' : null)
  );
}

/**
 * `payment_method` de Bold es un texto (`NEQUI`); en Wompi y Mercado Pago la misma clave es
 * un objeto, que `->>` devuelve como JSON. Solo vale un código.
 */
function codigoBold(v: unknown): string | null {
  const s = texto(v);
  return s && /^[a-z_]+$/i.test(s) ? s.toLowerCase() : null;
}

function submetodoDeRespuesta(f: FilaPagoPedido, pasarela: Pasarela | null): { submetodo: Submetodo | null; marca: string | null; ultimos4: string | null } {
  if (pasarela === 'mercadopago') {
    const pm = clave(f.mp_metodo);
    if (pm && MARCAS[pm]) return { submetodo: 'card', marca: MARCAS[pm], ultimos4: cuatroDigitos(f.mp_ultimos4) };
    if (pm && SUBMETODO_POR_CODIGO[pm]) return { submetodo: SUBMETODO_POR_CODIGO[pm], marca: null, ultimos4: null };
    const tipo = clave(f.mp_tipo);
    if (tipo === 'credit_card' || tipo === 'debit_card' || tipo === 'prepaid_card') {
      return { submetodo: 'card', marca: null, ultimos4: cuatroDigitos(f.mp_ultimos4) };
    }
    if (tipo === 'account_money') return { submetodo: 'dineroEnCuenta', marca: null, ultimos4: null };
  }
  if (pasarela === 'bold') {
    const pm = codigoBold(f.bold_metodo);
    if (pm) return { submetodo: SUBMETODO_POR_CODIGO[pm] ?? null, marca: null, ultimos4: null };
  }
  if (pasarela === 'wompi') {
    const tipo = clave(f.wompi_tipo);
    if (tipo) {
      const marca = clave(f.wompi_marca);
      return {
        submetodo: SUBMETODO_POR_CODIGO[tipo] ?? null,
        marca: tipo === 'card' && marca ? MARCAS[marca] ?? texto(f.wompi_marca) : null,
        ultimos4: tipo === 'card' ? cuatroDigitos(f.wompi_ultimos4) : null,
      };
    }
  }
  return { submetodo: null, marca: null, ultimos4: null };
}

export function pagoPresentable(f: FilaPagoPedido): PagoPresentable {
  const pasarela = pasarelaDelPago(f);
  const metodo = texto(f.method) ?? 'other';
  const deRespuesta = submetodoDeRespuesta(f, pasarela);
  // Sin submétodo en la respuesta: si `method` no es la pasarela misma, es el medio (nequi, pse…).
  const delMetodo = pasarela && !pasarelaDeCodigo(metodo) ? SUBMETODO_POR_CODIGO[metodo.toLowerCase()] ?? null : null;
  const monto = Number(f.amount);
  return {
    id: f.id,
    pasarela,
    metodo,
    submetodo: deRespuesta.submetodo ?? delMetodo,
    marcaTarjeta: deRespuesta.marca,
    ultimos4: deRespuesta.ultimos4,
    referencia: texto(f.reference),
    fecha: f.payment_date ?? f.created_at ?? null,
    monto: Number.isFinite(monto) ? monto : 0,
    estado: texto(f.status) ?? 'completed',
  };
}

/** Nombres propios de submétodos (el resto se traduce). */
const SUBMETODO_PROPIO: Partial<Record<Submetodo, string>> = {
  nequi: 'Nequi',
  pse: 'PSE',
  daviplata: 'Daviplata',
  suPlus: 'SU+ Pay',
};

/**
 * Texto del método: «Mercado Pago · Visa ••4417», «Wompi · Nequi», «Bold · Tarjeta».
 * Sin pasarela, la etiqueta del método («Efectivo»). `traducir` da el nombre de un
 * submétodo que no es nombre propio; `etiquetaMetodo`, el de un código sin pasarela.
 */
export function textoMetodoPago(
  p: PagoPresentable,
  traducir: (s: Submetodo) => string,
  etiquetaMetodo: (codigo: string) => string,
): string {
  if (!p.pasarela) return etiquetaMetodo(p.metodo);
  const partes: string[] = [NOMBRE_PASARELA[p.pasarela]];
  if (p.submetodo) {
    const nombre = p.submetodo === 'card' && p.marcaTarjeta ? p.marcaTarjeta : SUBMETODO_PROPIO[p.submetodo] ?? traducir(p.submetodo);
    partes.push(p.ultimos4 ? `${nombre} ••${p.ultimos4}` : nombre);
  }
  return partes.join(' · ');
}

/** Tono del estado de un pago para el sello de la tarjeta. */
export function tonoEstadoPago(estado: string): 'exito' | 'advertencia' | 'peligro' | 'neutro' {
  if (estado === 'completed' || estado === 'paid' || estado === 'approved') return 'exito';
  if (estado === 'pending' || estado === 'processing') return 'advertencia';
  if (estado === 'failed' || estado === 'void' || estado === 'voided' || estado === 'cancelled' || estado === 'rejected') return 'peligro';
  return 'neutro';
}

/** Los aprobados primero (lo que entró), luego pendientes y al final los intentos fallidos; cada grupo por fecha. */
export function ordenarPagos(pagos: readonly PagoPresentable[]): PagoPresentable[] {
  const peso = (p: PagoPresentable) => ({ exito: 0, advertencia: 1, neutro: 1, peligro: 2 })[tonoEstadoPago(p.estado)];
  return [...pagos].sort((a, b) => peso(a) - peso(b) || (a.fecha ?? '').localeCompare(b.fecha ?? ''));
}
