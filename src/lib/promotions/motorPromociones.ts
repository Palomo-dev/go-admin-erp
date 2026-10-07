/**
 * Motor PURO de promociones: qué promociones aplican a una cuenta y cuánto
 * descuenta cada línea. Sin Supabase, sin React y sin `Date.now()` implícito:
 * la hora, la zona horaria, la sucursal y el canal entran por parámetro. Así
 * se prueba con el proceso en UTC y en la zona de Colombia y da lo mismo.
 *
 * Lo usan, a través de `promotionEngine.evaluate` (que solo carga las filas):
 *   - el POS de mostrador (`posService.calculateCartTotals` y `checkout`);
 *   - las mesas (`PedidosService.recalcularPromocionesMesa`), sobre la cuenta
 *     COMPLETA, no plato por plato;
 *   - la factura de venta manual y las cotizaciones (canal `finances`);
 *   - el checkout del PMS.
 *
 * ─── Reglas idénticas a las del sitio web ───────────────────────────────────
 * El sitio público (repo `goadmin-websites`, `lib/promotions.ts`,
 * `calculatePromotions`) tiene su propio motor para el canal `web`. Las
 * reglas de este módulo DEBEN ser idénticas a las de ese archivo: el cliente
 * ve un descuento en la tienda y el cajero tiene que ver el mismo en el POS.
 * Si cambias una regla aquí, cámbiala allá (PR aparte en ese repo) y al revés.
 * En particular:
 *   - vigencia: activa, canal, `start_date ≤ ahora ≤ end_date`, usos
 *     disponibles, día de la semana EN LA ZONA DE LA ORGANIZACIÓN y sucursal
 *     (`branches` jsonb: nulo o vacío = todas; número o texto);
 *   - compra mínima contra el subtotal de TODA la cuenta;
 *   - no combinables: gana la que MÁS descuenta en esta cuenta (empate:
 *     mayor prioridad y luego la más antigua por `created_at`), y compite
 *     contra la suma de las combinables. Una no combinable que no toca la
 *     cuenta no bloquea a las demás;
 *   - monto fijo repartido en proporción y topado al subtotal aplicable;
 *   - tope (`max_discount_amount`) por promoción y por cuenta, repartido en
 *     proporción; la última línea absorbe el redondeo;
 *   - «Lleve X pague Y» por producto, regalando las unidades más baratas.
 *
 * Diferencias que QUEDAN con el sitio (2026-10-07), a cerrar en ese repo:
 *   1. Redondeo: aquí a centavos; el sitio, a pesos enteros (`Math.round`).
 *   2. `usage_limit = 0`: aquí «agotada»; el sitio lo trata como sin límite
 *      (`p.usage_limit &&`). Hoy ninguna fila tiene 0.
 *   3. Empate entre no combinables: aquí prioridad y luego `created_at`; el
 *      sitio, prioridad y luego el orden en que lleguen de la base.
 *   4. «Lleve X pague Y» con productos por peso o medida: aquí no aplica; el
 *      sitio no lo distingue.
 *   5. Tope de línea: aquí ninguna línea descuenta más que su total; el sitio
 *      topa solo el total de la cuenta.
 *   6. Branches como texto: aquí `appliesToBranch` (número o texto, como
 *      `vigencia.ts`); el sitio convierte con `Number`, mismo resultado.
 */

import { JS_DAY_TO_WEEKDAY, type WeekDay } from '@/components/pos/promociones/types';
import { toPlainDate, DEFAULT_TIMEZONE } from '@/lib/utils/dateCore';
import { appliesOnWeekDay, appliesToBranch, isWithinEndDate, weekDayOfPlainDate } from '@/lib/promotions/vigencia';
import { esMedido } from '@/lib/pos/peso/modoVenta';

// ── Tipos ────────────────────────────────────────────────────────────────────

export type CanalPromocion = 'pos' | 'web' | 'finances';

/** Regla tal como la embebe PostgREST (`promotion_rules`). */
export interface ReglaPromocion {
  rule_type: string;
  product_id?: number | null;
  category_id?: number | null;
}

/**
 * Fila de `promotions` como llega de PostgREST: los `numeric` pueden venir
 * como texto y `branches` / `applicable_days` son `jsonb` sin forma garantizada.
 */
export interface FilaPromocion {
  id: string;
  name: string;
  promotion_type: string;
  discount_value?: number | string | null;
  buy_quantity?: number | string | null;
  get_quantity?: number | string | null;
  min_purchase_amount?: number | string | null;
  max_discount_amount?: number | string | null;
  applies_to: string;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean | null;
  usage_limit?: number | string | null;
  usage_count?: number | string | null;
  is_combinable?: boolean | null;
  priority?: number | string | null;
  created_at?: string | null;
  branches?: unknown;
  applicable_days?: unknown;
  applies_to_pos?: boolean | null;
  applies_to_web?: boolean | null;
  applies_to_finances?: boolean | null;
  rules?: ReglaPromocion[] | null;
  promotion_rules?: ReglaPromocion[] | null;
}

/** Una línea de la cuenta. El orden de entrada es el orden de `lineDiscounts`. */
export interface LineaPromocion {
  product_id: number;
  /** Producto padre si es una variante: una regla sobre el padre la alcanza. */
  parent_product_id?: number | null;
  category_id?: number | null;
  quantity: number;
  unit_price: number;
  /** `products.sale_mode`. «Lleve X pague Y» no aplica a peso ni medida. */
  sale_mode?: string | null;
}

export interface ContextoPromocion {
  canal: CanalPromocion;
  /** Instante de la evaluación. Obligatorio: nada de `new Date()` escondido. */
  ahora: Date;
  /** Zona IANA de la organización (`getOrganizationTimezone`). */
  zonaHoraria: string;
  /** Sucursal de la venta; `null` solo alcanza promociones sin sucursales. */
  sucursalId: number | null;
}

export interface PromocionAplicada {
  promotion_id: string;
  promotion_name: string;
  promotion_type: string;
  discount_value: number;
  discount_amount: number;
  /** Posiciones (en la lista de entrada) de las líneas que descuenta. */
  lineas: number[];
  /** product_id de esas líneas (compatibilidad con la UI de siempre). */
  items_affected: number[];
}

export interface ResultadoPromociones {
  discountTotal: number;
  /** Descuento de cada LÍNEA, en el orden de entrada. Es el que se escribe en la línea. */
  lineDiscounts: number[];
  /**
   * Suma por producto. Solo para mostrar: con el mismo producto en dos líneas
   * es la suma de ambas, y escribirla en cada línea descuenta doble.
   */
  itemDiscounts: Record<number, number>;
  applied: PromocionAplicada[];
}

// ── Utilidades ───────────────────────────────────────────────────────────────

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const centavos = (n: number): number => Math.round(n * 100) / 100;
const totalLinea = (l: LineaPromocion): number => num(l.unit_price) * num(l.quantity);

export function reglasDe(p: FilaPromocion): ReglaPromocion[] {
  return (p.promotion_rules ?? p.rules ?? []) as ReglaPromocion[];
}

/**
 * Día de la semana del instante en la zona de la organización. Zona ilegible
 * → `DEFAULT_TIMEZONE` (CLAUDE.md: solo como respaldo). Nunca `getDay()`.
 */
export function diaSemanaEnZona(ahora: Date, zonaHoraria: string): WeekDay {
  try {
    const plano = toPlainDate(ahora, zonaHoraria || DEFAULT_TIMEZONE);
    if (plano) return weekDayOfPlainDate(plano);
  } catch {
    /* zona inválida: respaldo */
  }
  const respaldo = toPlainDate(ahora, DEFAULT_TIMEZONE);
  return respaldo ? weekDayOfPlainDate(respaldo) : JS_DAY_TO_WEEKDAY[ahora.getUTCDay()];
}

/** ¿Quedan usos? `usage_limit` nulo = sin límite. */
export function tieneUsosDisponibles(p: { usage_limit?: unknown; usage_count?: unknown }): boolean {
  if (p.usage_limit === null || p.usage_limit === undefined || p.usage_limit === '') return true;
  return num(p.usage_count) < num(p.usage_limit);
}

function aplicaAlCanal(p: FilaPromocion, canal: CanalPromocion): boolean {
  const flag = canal === 'pos' ? p.applies_to_pos : canal === 'web' ? p.applies_to_web : p.applies_to_finances;
  // Columna ausente en la fila (selects antiguos): la consulta ya filtró el canal.
  return flag !== false;
}

/** ¿La promoción está vigente en este canal, instante, día y sucursal? */
export function promocionVigente(p: FilaPromocion, ctx: ContextoPromocion, dia?: WeekDay): boolean {
  if (p.is_active === false) return false;
  if (!aplicaAlCanal(p, ctx.canal)) return false;
  if (p.start_date) {
    const inicio = new Date(p.start_date).getTime();
    if (!Number.isFinite(inicio) || inicio > ctx.ahora.getTime()) return false;
  }
  if (!isWithinEndDate(p, ctx.ahora)) return false;
  if (!tieneUsosDisponibles(p)) return false;
  if (!appliesOnWeekDay(p, dia ?? diaSemanaEnZona(ctx.ahora, ctx.zonaHoraria))) return false;
  if (!appliesToBranch(p, ctx.sucursalId)) return false;
  return true;
}

// ── Reglas de producto / categoría ───────────────────────────────────────────

export function lineaCumpleReglas(linea: LineaPromocion, p: FilaPromocion): boolean {
  if (p.applies_to === 'all') return true;
  const reglas = reglasDe(p);
  if (reglas.length === 0) return false;

  let incluida = false;
  let excluida = false;
  const coincideProducto = (id: number | null | undefined) =>
    id != null && (id === linea.product_id || (linea.parent_product_id != null && id === linea.parent_product_id));
  const coincideCategoria = (id: number | null | undefined) =>
    id != null && linea.category_id != null && id === linea.category_id;

  for (const r of reglas) {
    switch (r.rule_type) {
      case 'include_product':
      case 'include_brand': // la marca se resuelve vía producto (igual que el sitio)
        if (coincideProducto(r.product_id)) incluida = true;
        break;
      case 'exclude_product':
      case 'exclude_brand':
        if (coincideProducto(r.product_id)) excluida = true;
        break;
      case 'include_category':
        if (coincideCategoria(r.category_id)) incluida = true;
        break;
      case 'exclude_category':
        if (coincideCategoria(r.category_id)) excluida = true;
        break;
    }
  }
  const hayInclusion = reglas.some((r) => String(r.rule_type).startsWith('include_'));
  return hayInclusion ? incluida && !excluida : !excluida;
}

// ── Cálculo de UNA promoción sobre la cuenta ─────────────────────────────────

interface CalculoPromocion {
  total: number;
  porLinea: Map<number, number>; // índice de línea → monto
}

/** Reparte `monto` en proporción a `pesos`; la última entrada absorbe el redondeo. */
function repartir(monto: number, pesos: Array<[number, number]>): Map<number, number> {
  const out = new Map<number, number>();
  const suma = pesos.reduce((s, [, w]) => s + w, 0);
  if (!(monto > 0) || !(suma > 0)) return out;
  let acumulado = 0;
  pesos.forEach(([idx, w], i) => {
    const parte = i === pesos.length - 1 ? centavos(monto - acumulado) : centavos((monto * w) / suma);
    if (parte > 0) out.set(idx, parte);
    acumulado = centavos(acumulado + parte);
  });
  return out;
}

export function calcularPromocion(p: FilaPromocion, lineas: LineaPromocion[], indices: number[]): CalculoPromocion {
  let porLinea = new Map<number, number>();
  const valor = num(p.discount_value);
  const pesos: Array<[number, number]> = indices.map((i) => [i, totalLinea(lineas[i])]);
  const subtotal = pesos.reduce((s, [, w]) => s + w, 0);
  const sumar = (idx: number, monto: number) => {
    const d = centavos(monto);
    if (d > 0) porLinea.set(idx, centavos((porLinea.get(idx) ?? 0) + d));
  };

  switch (p.promotion_type) {
    case 'percentage':
    case 'bundle': // simplificación compartida con el sitio: porcentaje sobre lo aplicable
      for (const [idx, w] of pesos) sumar(idx, (w * valor) / 100);
      break;
    case 'fixed_amount':
      // UN monto por cuenta, repartido; nunca más que lo aplicable.
      if (valor > 0 && subtotal > 0) porLinea = repartir(Math.min(valor, subtotal), pesos);
      break;
    case 'buy_x_get_y': {
      const x = Math.trunc(num(p.buy_quantity));
      const y = Math.trunc(num(p.get_quantity));
      if (x > 0 && y > 0) {
        const porProducto = new Map<number, number[]>();
        for (const idx of indices) {
          const l = lineas[idx];
          if (esMedido({ sale_mode: l.sale_mode ?? null })) continue; // no regala kilos
          const arr = porProducto.get(l.product_id) ?? [];
          arr.push(idx);
          porProducto.set(l.product_id, arr);
        }
        for (const grupo of Array.from(porProducto.values())) {
          const unidades = grupo.reduce((s, i) => s + num(lineas[i].quantity), 0);
          let gratis = Math.floor(unidades / (x + y)) * y;
          const baratas = [...grupo].sort((a, b) => num(lineas[a].unit_price) - num(lineas[b].unit_price) || a - b);
          for (const idx of baratas) {
            if (gratis <= 0) break;
            const n = Math.min(gratis, num(lineas[idx].quantity));
            sumar(idx, n * num(lineas[idx].unit_price));
            gratis -= n;
          }
        }
      }
      break;
    }
    // 'free_shipping' no descuenta productos.
  }

  let total = centavos(Array.from(porLinea.values()).reduce((s, d) => s + d, 0));
  const tope = num(p.max_discount_amount);
  if (tope > 0 && total > tope) {
    porLinea = repartir(tope, Array.from(porLinea.entries()));
    total = tope;
  }
  return { total, porLinea };
}

// ── Evaluación de la cuenta completa ─────────────────────────────────────────

/** Orden estable: prioridad desc, `created_at` asc (la más antigua), id. */
function compararPrioridad(a: FilaPromocion, b: FilaPromocion): number {
  const pa = num(a.priority);
  const pb = num(b.priority);
  if (pa !== pb) return pb - pa;
  const fecha = (v: string | null | undefined) => {
    const t = v ? new Date(v).getTime() : NaN;
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY; // sin fecha: al final
  };
  const ca = fecha(a.created_at);
  const cb = fecha(b.created_at);
  if (ca !== cb) return ca < cb ? -1 : 1;
  return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
}

const VACIO = (n: number): ResultadoPromociones => ({
  discountTotal: 0,
  lineDiscounts: Array.from({ length: n }, () => 0),
  itemDiscounts: {},
  applied: [],
});

/**
 * Evalúa las promociones sobre TODA la cuenta. `promociones` puede traer
 * filas no vigentes: se filtran aquí con `ctx`.
 */
export function evaluarPromociones(
  promociones: FilaPromocion[],
  lineas: LineaPromocion[],
  ctx: ContextoPromocion,
): ResultadoPromociones {
  const validas = lineas.map((l) => num(l.quantity) > 0 && num(l.unit_price) >= 0);
  if (lineas.length === 0 || promociones.length === 0) return VACIO(lineas.length);

  const dia = diaSemanaEnZona(ctx.ahora, ctx.zonaHoraria);
  const subtotalCuenta = lineas.reduce((s, l, i) => s + (validas[i] ? totalLinea(l) : 0), 0);

  const elegibles = promociones
    .filter((p) => promocionVigente(p, ctx, dia))
    .filter((p) => !(num(p.min_purchase_amount) > 0 && subtotalCuenta < num(p.min_purchase_amount)))
    .sort(compararPrioridad);

  const calculos = new Map<string, { promo: FilaPromocion; indices: number[]; calc: CalculoPromocion }>();
  for (const p of elegibles) {
    const indices = lineas.map((_, i) => i).filter((i) => validas[i] && lineaCumpleReglas(lineas[i], p));
    if (indices.length === 0) continue;
    const calc = calcularPromocion(p, lineas, indices);
    if (calc.total > 0) calculos.set(p.id, { promo: p, indices, calc });
  }

  const combinables = elegibles.filter((p) => !!p.is_combinable && calculos.has(p.id));
  const sumaCombinables = combinables.reduce((s, p) => s + (calculos.get(p.id)?.calc.total ?? 0), 0);
  // Gana la no combinable que más descuenta EN ESTA CUENTA. `elegibles` ya
  // viene por prioridad y antigüedad: con `>` estricto el empate lo gana la
  // primera, que es la de mayor prioridad y, a igual prioridad, la más antigua.
  let mejor: FilaPromocion | null = null;
  let mejorMonto = 0;
  for (const p of elegibles) {
    if (p.is_combinable) continue;
    const d = calculos.get(p.id)?.calc.total ?? 0;
    if (d > mejorMonto) {
      mejor = p;
      mejorMonto = d;
    }
  }
  const aAplicar = mejor && mejorMonto >= sumaCombinables ? [mejor] : combinables;

  const lineDiscounts = lineas.map(() => 0);
  const applied: PromocionAplicada[] = [];
  for (const p of aAplicar) {
    const c = calculos.get(p.id);
    if (!c) continue;
    let aportado = 0;
    const tocadas: number[] = [];
    for (const [idx, monto] of Array.from(c.calc.porLinea.entries())) {
      // Una línea nunca descuenta más que su propio total.
      const cabe = Math.max(0, centavos(totalLinea(lineas[idx]) - lineDiscounts[idx]));
      const d = Math.min(monto, cabe);
      if (d <= 0) continue;
      lineDiscounts[idx] = centavos(lineDiscounts[idx] + d);
      aportado = centavos(aportado + d);
      tocadas.push(idx);
    }
    if (aportado <= 0) continue;
    applied.push({
      promotion_id: p.id,
      promotion_name: p.name,
      promotion_type: p.promotion_type,
      discount_value: num(p.discount_value),
      discount_amount: aportado,
      lineas: tocadas.sort((a, b) => a - b),
      items_affected: c.indices.map((i) => lineas[i].product_id),
    });
  }

  const itemDiscounts: Record<number, number> = {};
  lineDiscounts.forEach((d, i) => {
    if (d > 0) itemDiscounts[lineas[i].product_id] = centavos((itemDiscounts[lineas[i].product_id] ?? 0) + d);
  });
  return {
    discountTotal: centavos(lineDiscounts.reduce((s, d) => s + d, 0)),
    lineDiscounts,
    itemDiscounts,
    applied,
  };
}

// ── Descuento manual vs. descuento de promoción en una línea ─────────────────

/** Lo que una línea del carrito sabe de sus descuentos. */
export interface DescuentosLinea {
  discount_amount?: number | null;
  /** Descuento puesto a mano por el cajero. `undefined` = no hay. */
  manual_discount_amount?: number | null;
  /** Descuento que puso el motor de promociones en la última evaluación. */
  promo_discount_amount?: number | null;
}

/**
 * Descuento manual vigente de la línea. Un carrito guardado antes de separar
 * los dos descuentos trae solo `discount_amount`: se trata como manual, que
 * es lo que hacía el POS (no lo pisaba).
 */
export function descuentoManualDe(l: DescuentosLinea): number | null {
  if (l.manual_discount_amount !== undefined && l.manual_discount_amount !== null) {
    return num(l.manual_discount_amount) > 0 ? num(l.manual_discount_amount) : null;
  }
  if (l.promo_discount_amount === undefined && num(l.discount_amount) > 0) return num(l.discount_amount);
  return null;
}

/**
 * Descuento final de cada línea: el manual del cajero si lo hay (no se pisa);
 * si no, el de la promoción recién calculada. Ambos topados al total de la línea.
 */
export function combinarDescuentos(
  lineas: Array<DescuentosLinea & { quantity: number; unit_price: number }>,
  promoPorLinea: number[],
): Array<{ discount_amount: number; manual_discount_amount: number | null; promo_discount_amount: number }> {
  return lineas.map((l, i) => {
    const maximo = Math.max(0, centavos(num(l.quantity) * num(l.unit_price)));
    const manual = descuentoManualDe(l);
    const promo = Math.min(maximo, Math.max(0, centavos(num(promoPorLinea[i]))));
    if (manual !== null) {
      return { discount_amount: Math.min(maximo, manual), manual_discount_amount: manual, promo_discount_amount: 0 };
    }
    return { discount_amount: promo, manual_discount_amount: null, promo_discount_amount: promo };
  });
}

/** Ids de las promociones que de verdad quedaron en alguna línea con descuento de promoción. */
export function promocionesUsadas(resultado: ResultadoPromociones, promoFinalPorLinea: number[]): string[] {
  return resultado.applied
    .filter((a) => a.lineas.some((i) => (promoFinalPorLinea[i] ?? 0) > 0))
    .map((a) => a.promotion_id);
}

// ── Mesas: qué líneas de la cuenta gestiona el motor ─────────────────────────

/** Línea de `sale_items` de una mesa, con lo que hace falta para decidir. */
export interface LineaCuentaMesa {
  id: string;
  quantity: number;
  unit_price: number;
  discount_amount?: number | null;
  paid_amount?: number | null;
  paid_at?: string | null;
  notes?: Record<string, unknown> | null;
}

/**
 * ¿El descuento de esta línea lo administra el motor? Sí si no tiene
 * descuento o si el que tiene lo puso el motor (`notes.descuento_promocion`).
 * No: líneas pagadas o con abono (cuenta dividida) y líneas con un descuento
 * ajeno (pedido web, carta QR, datos anteriores a este cambio).
 */
export function lineaMesaGestionada(l: LineaCuentaMesa): boolean {
  if (l.paid_at) return false;
  if (num(l.paid_amount) > 0) return false;
  if (!(num(l.quantity) > 0)) return false;
  const notas = l.notes ?? {};
  if (Object.prototype.hasOwnProperty.call(notas, 'descuento_promocion')) return true;
  return !(num(l.discount_amount) > 0);
}

/** Cambio a escribir en una línea de mesa (lo aplica `pos_mesa_aplicar_promociones`). */
export interface CambioDescuentoMesa {
  sale_item_id: string;
  discount_amount: number;
  promotion_ids: string[];
}

/**
 * Cambios de descuento de una cuenta de mesa a partir de la evaluación de la
 * cuenta completa. `lineas[i]` corresponde a `resultado.lineDiscounts[i]`.
 * Solo devuelve líneas gestionadas cuyo descuento o promociones cambian.
 */
export function cambiosDescuentoMesa(lineas: LineaCuentaMesa[], resultado: ResultadoPromociones): CambioDescuentoMesa[] {
  const cambios: CambioDescuentoMesa[] = [];
  lineas.forEach((l, i) => {
    if (!lineaMesaGestionada(l)) return;
    const d = Math.min(centavos(num(l.quantity) * num(l.unit_price)), centavos(num(resultado.lineDiscounts[i])));
    const ids = d > 0
      ? resultado.applied.filter((a) => a.lineas.includes(i)).map((a) => a.promotion_id).sort()
      : [];
    const antes = Array.isArray(l.notes?.promociones) ? (l.notes!.promociones as unknown[]).map(String).sort() : [];
    if (centavos(num(l.discount_amount)) === d && antes.join(',') === ids.join(',')) return;
    cambios.push({ sale_item_id: l.id, discount_amount: d, promotion_ids: ids });
  });
  return cambios;
}
