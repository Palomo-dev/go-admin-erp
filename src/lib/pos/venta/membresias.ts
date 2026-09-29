/**
 * Membresías en el POS (docs/design/MEMBRESIAS-FASE-1-2.md §1.6 y §4, frames
 * D1 `986:616652` y D2 `986:615576`). Lógica pura, sin React ni red:
 *
 * - Qué línea es una membresía (`products.service_type = 'membership'`).
 * - P1 (decisión del dueño): una línea membresía exige el cliente titular. El
 *   botón «Cobrar» pasa a `sin-cliente` (`requisitosCarrito.ts`) y, al agregar
 *   el producto sin cliente, la página abre el selector (D1).
 * - Lectura defensiva de `membresias` en el resultado de `pos_checkout_v1` y de
 *   `fn_membresias_activar_venta` (post-venta, D2; confirmación web).
 * - El error `membresia_sin_cliente` con que la base rechaza el cobro entero.
 *
 * La membresía NO se crea aquí ni en el navegador: la crea/activa la base en la
 * misma transacción del cobro (§4, «Regla única»).
 */
import type { Cart, Product } from '@/components/pos/types';

/** Valor de `products.service_type` de un producto membresía. */
export const SERVICE_TYPE_MEMBRESIA = 'membership';

/** Código estable con que la base rechaza una línea membresía sin cliente. */
export const ERROR_MEMBRESIA_SIN_CLIENTE = 'membresia_sin_cliente';

export function esProductoMembresia(producto: Pick<Product, 'service_type'> | null | undefined): boolean {
  return producto?.service_type === SERVICE_TYPE_MEMBRESIA;
}

type CarritoMembresia = Pick<Cart, 'items' | 'customer_id'>;

/** El carrito lleva al menos una línea membresía (con cantidad). */
export function carritoTieneMembresia(carrito: Pick<Cart, 'items'>): boolean {
  return carrito.items.some((i) => i.quantity > 0 && esProductoMembresia(i.product));
}

/** P1: hay una línea membresía y el carrito no tiene cliente: no se puede cobrar. */
export function membresiaSinCliente(carrito: CarritoMembresia): boolean {
  return !carrito.customer_id && carritoTieneMembresia(carrito);
}

/**
 * D1: tras agregar `producto` al carrito, ¿se abre el selector de cliente?
 * Solo si el producto es membresía y el carrito (ya actualizado) no tiene cliente.
 */
export function debePedirCliente(producto: Pick<Product, 'service_type'>, carrito: Pick<Cart, 'customer_id'>): boolean {
  return esProductoMembresia(producto) && !carrito.customer_id;
}

/**
 * D1 «Quitar la membresía»: deshace SOLO lo que se acaba de agregar. Si las
 * unidades se sumaron a una línea que ya estaba (mismo producto), se le restan;
 * si la línea solo tenía esas unidades, se quita. Busca desde la última línea
 * del producto (la que recibió la suma). null si ya no está en el carrito.
 */
export function lineaParaQuitar(
  items: ReadonlyArray<Pick<Cart['items'][number], 'id' | 'product_id' | 'quantity'>>,
  productId: number,
  cantidad: number,
): { itemId: string; nuevaCantidad: number } | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const linea = items[i];
    if (linea.product_id !== productId) continue;
    const resta = Math.max(1, cantidad);
    return { itemId: linea.id, nuevaCantidad: linea.quantity > resta ? linea.quantity - resta : 0 };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Resultado de la base
// ---------------------------------------------------------------------------

export type EstadoMembresiaVendida = 'pending' | 'active' | 'frozen' | 'past_due' | 'expired' | 'cancelled';

const ESTADOS: readonly EstadoMembresiaVendida[] = ['pending', 'active', 'frozen', 'past_due', 'expired', 'cancelled'];

/**
 * Una membresía creada, activada o renovada por la venta. `desde`/`hasta` son
 * `timestamptz` (ISO) y cubren la vigencia TOTAL: con cantidad N son N
 * períodos seguidos (P4); en una renovación, `hasta` es el nuevo vencimiento.
 */
export interface MembresiaVendida {
  id: number;
  plan: string;
  planId: number | null;
  productId: number | null;
  estado: EstadoMembresiaVendida;
  desde: string | null;
  hasta: string | null;
  codigo: string | null;
  customerId: string | null;
}

function numero(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

/**
 * `membresias` tal como la devuelve la base (`[{id, plan, plan_id, product_id,
 * estado, desde, hasta, codigo, customer_id}]`). Descarta lo que no tenga id o
 * estado conocido; nunca lanza (un resultado viejo sin la clave da `[]`).
 */
export function leerMembresiasVendidas(raw: unknown): MembresiaVendida[] {
  if (!Array.isArray(raw)) return [];
  const salida: MembresiaVendida[] = [];
  for (const fila of raw) {
    if (!fila || typeof fila !== 'object') continue;
    const f = fila as Record<string, unknown>;
    const id = numero(f.id);
    const estado = f.estado;
    if (id === null || typeof estado !== 'string' || !(ESTADOS as readonly string[]).includes(estado)) continue;
    salida.push({
      id,
      plan: texto(f.plan) ?? '',
      planId: numero(f.plan_id),
      productId: numero(f.product_id),
      estado: estado as EstadoMembresiaVendida,
      desde: texto(f.desde),
      hasta: texto(f.hasta),
      codigo: texto(f.codigo),
      customerId: texto(f.customer_id),
    });
  }
  return salida;
}

/**
 * Estado que se pinta en el post-venta (claves de `membresias.estados`).
 * «pending» se parte (SISTEMA-BADGES): con la venta pagada es «Por activar»
 * (el plan pide activación en la primera entrada); sin pagar, «Pendiente de pago».
 */
export function estadoVisualVendida(
  estado: EstadoMembresiaVendida,
  ventaPagada: boolean,
): 'pendiente_pago' | 'por_activar' | 'activa' | 'congelada' | 'en_gracia' | 'vencida' | 'cancelada' {
  switch (estado) {
    case 'pending':
      return ventaPagada ? 'por_activar' : 'pendiente_pago';
    case 'active':
      return 'activa';
    case 'frozen':
      return 'congelada';
    case 'past_due':
      return 'en_gracia';
    case 'expired':
      return 'vencida';
    case 'cancelled':
      return 'cancelada';
  }
}

/** Ruta del detalle de la membresía (frame D2, «Ver membresía»). */
export function rutaMembresia(id: number): string {
  return `/app/membresias/membresias/${encodeURIComponent(String(id))}`;
}

/**
 * El error es el rechazo `membresia_sin_cliente` de la base (mensaje de la
 * excepción de Postgres, tal como lo propaga PostgREST / `CheckoutRpcError`).
 */
export function esErrorMembresiaSinCliente(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const mensaje = String((error as { message?: unknown }).message ?? '').trim();
  return mensaje.split(/[\s:]/)[0] === ERROR_MEMBRESIA_SIN_CLIENTE;
}

// ---------------------------------------------------------------------------
// Deep link de renovación: /app/pos?cliente=<uuid>&producto=<id>
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EnlacePos {
  clienteId: string | null;
  productoId: number | null;
}

/**
 * Lee `cliente` (uuid) y `producto` (entero positivo) de la URL del POS. Lo
 * que no tenga la forma esperada se ignora (lista blanca: termina en consultas).
 * Devuelve null si no hay nada que hacer.
 */
export function leerEnlacePos(params: Pick<URLSearchParams, 'get'> | null | undefined): EnlacePos | null {
  if (!params) return null;
  const cliente = params.get('cliente')?.trim() ?? '';
  const producto = params.get('producto')?.trim() ?? '';
  const clienteId = UUID.test(cliente) ? cliente.toLowerCase() : null;
  const productoId = /^[1-9]\d{0,14}$/.test(producto) ? Number(producto) : null;
  if (!clienteId && productoId === null) return null;
  return { clienteId, productoId };
}

/** Clave para aplicar un mismo enlace una sola vez (aunque la página se vuelva a pintar). */
export function claveEnlacePos(enlace: EnlacePos): string {
  return `${enlace.clienteId ?? '-'}|${enlace.productoId ?? '-'}`;
}
