/**
 * Anticipo pagado con el pedido vencido (Figma «05 POS y ventas» 3181-202769, aprobado por el dueño
 * el 2026-11-25; base 20261125121000). Puro (sin React ni Supabase): lo prueba
 * __tests__/anticipoVencido.test.ts.
 *
 * «Anticipo pagado · vencido» es un estado DEDUCIDO, sin columna nueva: el pedido venció
 * (`status='expired'`), el anticipo está pagado (`advance_status='paid'`) y nadie lo devolvió
 * (`payment_status` distinto de `refunded`). La base lo reactiva sola si el pago llegó hasta 24 h
 * después de vencer y hay stock de todo; si no, decide una persona: «Reactivar pedido» (la
 * confirmación de siempre, que vuelve a apartar el stock todo o nada) o «Devolver anticipo»
 * (`fn_web_order_anticipo_devolver`, completo, Dr 2805 / Cr pasarela o banco).
 */

export interface PedidoAnticipoVencido {
  status?: string | null;
  payment_status?: string | null;
  advance_status?: string | null;
  advance_amount?: number | string | null;
  sale_id?: string | null;
}

/** ¿El pedido está «Anticipo pagado · vencido»? */
export function anticipoPagadoVencido(o: PedidoAnticipoVencido): boolean {
  return (
    o.status === 'expired' &&
    o.advance_status === 'paid' &&
    o.payment_status !== 'refunded' &&
    (Number(o.advance_amount) || 0) > 0 &&
    !o.sale_id
  );
}

/** Pedidos «Anticipo pagado · vencido» de una lista (StatCard y aviso del listado). */
export function anticiposPagadosVencidos<T extends PedidoAnticipoVencido>(pedidos: readonly T[]): T[] {
  return pedidos.filter(anticipoPagadoVencido);
}

/** Línea del pedido con el stock de la sede (`fn_web_order_anticipo_vencido_stock`). */
export interface LineaStockAnticipo {
  product_id: number | null;
  product_name: string | null;
  quantity: number | string | null;
  disponible: number | string | null;
}

export type EstadoLineaStock = 'disponible' | 'parcial' | 'sin_stock';

export function estadoLineaStock(l: LineaStockAnticipo): EstadoLineaStock {
  const pide = Number(l.quantity) || 0;
  const hay = Math.max(0, Number(l.disponible) || 0);
  if (hay >= pide) return 'disponible';
  return hay > 0 ? 'parcial' : 'sin_stock';
}

/** Cuántas líneas no alcanzan y si se puede reactivar ya (stock de TODAS las líneas). */
export function resumenStockAnticipo(lineas: readonly LineaStockAnticipo[]): { faltan: number; todoDisponible: boolean } {
  const faltan = lineas.filter((l) => estadoLineaStock(l) !== 'disponible').length;
  return { faltan, todoDisponible: lineas.length > 0 && faltan === 0 };
}

/** Minutos entre el vencimiento y el pago (redondeo hacia arriba; nunca negativo). `null` sin horas. */
export function minutosTarde(vencio: string | null | undefined, pagado: string | null | undefined): number | null {
  const v = Date.parse(vencio ?? '');
  const p = Date.parse(pagado ?? '');
  if (!Number.isFinite(v) || !Number.isFinite(p)) return null;
  return Math.max(0, Math.ceil((p - v) / 60_000));
}

/** Medios de la devolución que acepta la base (decisión del dueño: mismo medio o transferencia). */
export const MEDIOS_DEVOLUCION = ['pasarela', 'transferencia'] as const;
export type MedioDevolucion = (typeof MEDIOS_DEVOLUCION)[number];

/** Códigos de error de `fn_web_order_anticipo_devolver` que la pantalla traduce. */
export const ERRORES_DEVOLUCION = [
  'SIN_PERMISO',
  'NO_ES_ANTICIPO_VENCIDO',
  'YA_DEVUELTO',
  'MEDIO_INVALIDO',
  'COMPROBANTE_REQUERIDO',
  'ANTICIPO_SIN_PAGO',
  'ANTICIPO_SIN_2805',
  'DEVOLUCION_COMPLETA',
  'CUENTA_NO_RESUELTA',
  'ASIENTO_NO_REGISTRADO',
] as const;
export type ErrorDevolucion = (typeof ERRORES_DEVOLUCION)[number];

export function codigoErrorDevolucion(mensaje: string | null | undefined): ErrorDevolucion | 'desconocido' {
  const m = mensaje ?? '';
  return ERRORES_DEVOLUCION.find((c) => m.includes(c)) ?? 'desconocido';
}

/** Momentos de aviso al cliente de este flujo (`web_order_notices.moment`, 20261125121000). */
export const MOMENTOS_AVISO_ANTICIPO = ['anticipo_reactivado', 'anticipo_revisando', 'anticipo_devuelto'] as const;
export type MomentoAvisoAnticipo = (typeof MOMENTOS_AVISO_ANTICIPO)[number];

export interface DatosAvisoAnticipo {
  cliente: string;
  numero: string;
  negocio: string;
  /** Montos ya formateados en la moneda de la organización. */
  anticipo: string;
  alRecibir?: string | null;
  /** «reverso en Bold» / «transferencia»; solo «devuelto». */
  medio?: string | null;
  url?: string | null;
}

/** Texto del WhatsApp (y del correo en texto plano). Figma 11b / 12b / 12e. */
export function textoAvisoAnticipo(momento: MomentoAvisoAnticipo, d: DatosAvisoAnticipo): string {
  const nombre = d.cliente.trim().split(/\s+/)[0] || 'cliente';
  const partes: string[] = [`Hola ${nombre},`];
  switch (momento) {
    case 'anticipo_reactivado':
      partes.push(`Recibimos tu pago de ${d.anticipo}. Llegó después del plazo, pero todavía teníamos todo: tu pedido ${d.numero} sigue en pie.`);
      if (d.alRecibir) partes.push(`Pagas al recibir: ${d.alRecibir}.`);
      break;
    case 'anticipo_revisando':
      partes.push(`Recibimos tu pago de ${d.anticipo} del pedido ${d.numero}. Llegó después del plazo y se agotaron algunos productos.`);
      partes.push('Estamos revisando qué hacer y te escribimos pronto. Tu dinero está seguro: si no podemos atender el pedido, te lo devolvemos completo.');
      break;
    case 'anticipo_devuelto':
      partes.push(`No pudimos atender tu pedido ${d.numero}. Te devolvimos ${d.anticipo}${d.medio ? ` por ${d.medio}` : ''}.`);
      partes.push('Según tu banco o la pasarela, puede tardar unos días hábiles en verse. Disculpa las molestias.');
      break;
  }
  if (d.url && momento === 'anticipo_reactivado') partes.push(`Sigue tu pedido aquí: ${d.url}`);
  if (d.negocio) partes.push(d.negocio);
  return partes.join('\n\n');
}

export function asuntoAvisoAnticipo(momento: MomentoAvisoAnticipo, numero: string): string {
  switch (momento) {
    case 'anticipo_reactivado':
      return `Tu pedido ${numero} sigue en pie`;
    case 'anticipo_revisando':
      return `Recibimos tu pago del pedido ${numero}`;
    case 'anticipo_devuelto':
      return `Te devolvimos el anticipo del pedido ${numero}`;
  }
}

/** ¿La base reactivó el pedido por un anticipo tardío? (nota que deja fn_web_order_anticipo_tardio). */
export function reactivadoPorAnticipoTardio(notas: string | null | undefined): boolean {
  return (notas ?? '').includes('[REACTIVADO POR ANTICIPO TARDÍO');
}
