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
 *   - compra mínima: toda la cuenta si `applies_to` es `all` o
 *     `min_purchase_scope` es `cart`; si la promo es por productos,
 *     categorías o marcas, solo el subtotal de las líneas que entran;
 *   - cantidad mínima: suma de unidades de esas líneas. Solo porcentaje,
 *     monto fijo y paquete, y solo si `min_quantity` trae un entero.
 *     `buy_quantity` no es un mínimo. Compra X Lleva Y no la mira;
 *   - repetir cada N (`repeat_every_quantity`) en porcentaje y monto fijo:
 *     floor(unidades / N) veces el valor. En porcentaje, el sobrante queda
 *     a precio normal. En monto fijo, el total se reparte entre las líneas
 *     que entran y se topa a su subtotal;
 *   - no combinables: gana la que MÁS descuenta en esta cuenta (empate:
 *     mayor prioridad y luego la más antigua por `created_at`), y compite
 *     contra la suma de las combinables. Una no combinable que no toca la
 *     cuenta no bloquea a las demás;
 *   - monto fijo repartido en proporción y topado al subtotal aplicable;
 *   - tope (`max_discount_amount`) por promoción y por cuenta, repartido en
 *     proporción; la última línea absorbe el redondeo;
 *   - «Lleve X pague Y» por producto, regalando las unidades más baratas.
 *     Si Y < X, de cada X se regalan X−Y (3 y 2 = 3x2: lleva 3, paga 2).
 *     Si Y ≥ X, Y son gratis además de las X que se pagan;
 *   - franja `start_time` / `end_time` en la zona de la organización (si el
 *     fin es menor que el inicio, cruza la medianoche);
 *   - bundle: con `bundle_price` > 0, cada producto incluido aporta
 *     `quantity` unidades por paquete (nulo = 1) y el precio se cobra por
 *     cada paquete completo. El sobrante va a precio normal. Sin productos
 *     incluidos, el precio de paquete no se aplica. Sin precio, el porcentaje.
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
import { appliesInTimeWindow, appliesOnWeekDay, appliesToBranch, horaEnZona, isWithinEndDate, weekDayOfPlainDate } from '@/lib/promotions/vigencia';
import { esMedido } from '@/lib/pos/peso/modoVenta';
import { cantidadMinimaEfectiva } from '@/lib/promotions/cantidadMinima';

// ── Tipos ────────────────────────────────────────────────────────────────────

export type CanalPromocion = 'pos' | 'web' | 'finances';

/** Regla tal como la embebe PostgREST (`promotion_rules`). */
export interface ReglaPromocion {
  rule_type: string;
  product_id?: number | null;
  category_id?: number | null;
  /** Unidades de este producto en un paquete. Nulo = 1. */
  quantity?: number | string | null;
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
  /** `eligible` = líneas de la promo. `cart` = toda la cuenta. Nulo = se deriva. */
  min_purchase_scope?: string | null;
  /** Unidades mínimas de las líneas que entran. Solo porcentaje, monto fijo y paquete. */
  min_quantity?: number | string | null;
  /** Repite el descuento cada N unidades. Nulo = una sola vez. */
  repeat_every_quantity?: number | string | null;
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
  /** `time` de Postgres (`HH:mm:ss`). Nulo = sin franja. */
  start_time?: string | null;
  end_time?: string | null;
  /** Precio del paquete. Si es > 0, el bundle descuenta hasta ese precio. */
  bundle_price?: number | string | null;
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
  /**
   * El cajero quitó la promoción de esta línea. No recibe descuento de
   * promoción y no cuenta para mínimos, paquetes, «lleve X» ni «cada N».
   * El descuento manual sigue aparte (`combinarDescuentos`).
   */
  promo_excluded?: boolean | null;
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

/** Entero mayor que cero. Vacío, cero o negativo = no configurado. */
export function enteroPositivo(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type AlcanceCompraMinima = 'eligible' | 'cart';

/**
 * Dónde se mide `min_purchase_amount`. `cart` explícito, o `applies_to = all`
 * cuando el alcance viene nulo: toda la cuenta. En productos, categorías o
 * marcas, el subtotal de las líneas que entran en la promo.
 */
export function alcanceCompraMinima(p: FilaPromocion): AlcanceCompraMinima {
  if (p.min_purchase_scope === 'cart' || p.min_purchase_scope === 'eligible') return p.min_purchase_scope;
  return p.applies_to === 'all' ? 'cart' : 'eligible';
}
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
  if (!appliesInTimeWindow(p, horaEnZona(ctx.ahora, ctx.zonaHoraria))) return false;
  return true;
}

/**
 * Unidades que salen gratis.
 * Si Y < X, la etiqueta es «XxY» (llevas X, pagas Y): de cada X, X−Y de regalo.
 * Si Y ≥ X, Y son unidades gratis además de las X que se pagan.
 */
export function unidadesGratisCompraLleva(unidades: number, compra: number, lleva: number): number {
  const n = Math.floor(unidades);
  const x = Math.trunc(compra);
  const y = Math.trunc(lleva);
  if (n <= 0 || x <= 0 || y <= 0) return 0;
  if (y < x) return Math.floor(n / x) * (x - y);
  return Math.floor(n / (x + y)) * y;
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

function unidadesDe(lineas: LineaPromocion[], indices: number[]): number {
  return indices.reduce((s, i) => s + num(lineas[i].quantity), 0);
}

/** Porcentaje, monto fijo y paquete. Compra X Lleva Y no mira esta cantidad. */
function cumpleCantidadMinima(p: FilaPromocion, lineas: LineaPromocion[], indices: number[]): boolean {
  const minimo = cantidadMinimaEfectiva(p);
  if (minimo == null) return true;
  return unidadesDe(lineas, indices) >= minimo;
}

function requisitosPaquete(p: FilaPromocion): Array<{ productId: number; porPaquete: number }> {
  const map = new Map<number, number>();
  for (const r of reglasDe(p)) {
    if (r.rule_type !== 'include_product' || r.product_id == null) continue;
    const q = enteroPositivo(r.quantity) ?? 1;
    map.set(r.product_id, Math.max(map.get(r.product_id) ?? 0, q));
  }
  return Array.from(map.entries()).map(([productId, porPaquete]) => ({ productId, porPaquete }));
}

/** La línea cuenta para un solo producto del paquete. El id exacto gana sobre el padre. */
function destinoPaquete(linea: LineaPromocion, requisitos: Array<{ productId: number }>): number | null {
  if (requisitos.some((r) => r.productId === linea.product_id)) return linea.product_id;
  if (linea.parent_product_id != null && requisitos.some((r) => r.productId === linea.parent_product_id)) {
    return linea.parent_product_id;
  }
  return null;
}

/**
 * Precio del paquete por cada grupo completo. El sobrante se queda a precio
 * normal. Sin productos incluidos no se aplica un solo precio a toda la cuenta.
 */
function descuentoPorPaquetes(
  p: FilaPromocion,
  lineas: LineaPromocion[],
  indices: number[],
  precioPaquete: number,
): Map<number, number> {
  const requisitos = requisitosPaquete(p);
  if (requisitos.length === 0 || !(precioPaquete > 0)) return new Map();

  const asignadas = new Map<number, number[]>();
  for (const idx of indices) {
    const dest = destinoPaquete(lineas[idx], requisitos);
    if (dest == null) continue;
    const arr = asignadas.get(dest) ?? [];
    arr.push(idx);
    asignadas.set(dest, arr);
  }

  let paquetes = Number.POSITIVE_INFINITY;
  for (const req of requisitos) {
    const qty = (asignadas.get(req.productId) ?? []).reduce((s, i) => s + num(lineas[i].quantity), 0);
    paquetes = Math.min(paquetes, Math.floor(qty / req.porPaquete));
  }
  if (!Number.isFinite(paquetes) || paquetes <= 0) return new Map();

  const consumido = new Map<number, number>();
  for (const req of requisitos) {
    let faltan = paquetes * req.porPaquete;
    for (const idx of asignadas.get(req.productId) ?? []) {
      if (faltan <= 0) break;
      const toman = Math.min(num(lineas[idx].quantity), faltan);
      const valor = centavos(toman * num(lineas[idx].unit_price));
      if (valor > 0) consumido.set(idx, centavos((consumido.get(idx) ?? 0) + valor));
      faltan -= toman;
    }
  }
  const valorConsumido = centavos(Array.from(consumido.values()).reduce((s, v) => s + v, 0));
  const descuento = centavos(valorConsumido - centavos(paquetes * precioPaquete));
  if (!(descuento > 0)) return new Map();
  return repartir(descuento, Array.from(consumido.entries()));
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
    case 'percentage': {
      const cada = enteroPositivo(p.repeat_every_quantity);
      if (cada == null) {
        for (const [idx, w] of pesos) sumar(idx, (w * valor) / 100);
      } else {
        let quedan = Math.floor(unidadesDe(lineas, indices) / cada) * cada;
        for (const idx of indices) {
          if (quedan <= 0) break;
          const toman = Math.min(num(lineas[idx].quantity), quedan);
          sumar(idx, (toman * num(lineas[idx].unit_price) * valor) / 100);
          quedan -= toman;
        }
      }
      break;
    }
    case 'bundle': {
      const precioPaquete = num(p.bundle_price);
      if (precioPaquete > 0) {
        porLinea = descuentoPorPaquetes(p, lineas, indices, precioPaquete);
      } else if (valor > 0) {
        for (const [idx, w] of pesos) sumar(idx, (w * valor) / 100);
      }
      break;
    }
    case 'fixed_amount': {
      // Un monto por cuenta, o floor(unidades/N) veces ese monto. Repartido
      // entre las líneas que entran y nunca más que su subtotal.
      const cada = enteroPositivo(p.repeat_every_quantity);
      let monto = valor;
      if (cada != null) {
        const grupos = Math.floor(unidadesDe(lineas, indices) / cada);
        monto = grupos > 0 ? centavos(grupos * valor) : 0;
      }
      if (monto > 0 && subtotal > 0) porLinea = repartir(Math.min(monto, subtotal), pesos);
      break;
    }
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
          let gratis = unidadesGratisCompraLleva(unidades, x, y);
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

/**
 * Líneas que una promoción toca al armar la exclusividad.
 *
 * Una promoción de cuenta —sin reglas de producto (`applies_to = all`) o con
 * la compra mínima sobre toda la cuenta— toca todas las líneas válidas. Por
 * eso sigue compitiendo contra el resto como antes: dentro de ese grupo hay
 * un solo ganador no combinable. Una promoción de productos, categorías o
 * marcas toca solo sus líneas: dos no combinables sobre productos distintos
 * no se pisan y se aplican las dos.
 */
function indicesDeGrupo(p: FilaPromocion, indices: number[], validos: number[]): number[] {
  if (p.applies_to === 'all' || alcanceCompraMinima(p) === 'cart') return validos;
  return indices;
}

interface CalculoListo {
  promo: FilaPromocion;
  indices: number[];
  grupo: number[];
  calc: CalculoPromocion;
}

function seCruzan(a: number[], b: number[]): boolean {
  const menor = a.length <= b.length ? a : b;
  const mayor = a.length <= b.length ? b : a;
  const set = new Set(mayor);
  return menor.some((i) => set.has(i));
}

/** Componentes conexos: promociones unidas si comparten alguna línea. */
function componentesDe(calculos: CalculoListo[]): CalculoListo[][] {
  const n = calculos.length;
  const padre = Array.from({ length: n }, (_, i) => i);
  const encontrar = (i: number): number => {
    let x = i;
    while (padre[x] !== x) {
      padre[x] = padre[padre[x]];
      x = padre[x];
    }
    return x;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!seCruzan(calculos[i].grupo, calculos[j].grupo)) continue;
      const ra = encontrar(i);
      const rb = encontrar(j);
      if (ra !== rb) padre[rb] = ra;
    }
  }
  const grupos = new Map<number, CalculoListo[]>();
  calculos.forEach((c, i) => {
    const r = encontrar(i);
    const arr = grupos.get(r) ?? [];
    arr.push(c);
    grupos.set(r, arr);
  });
  return Array.from(grupos.values());
}

/**
 * Entre no combinables que compiten (mismo grupo de líneas): gana la de
 * mayor `priority`. Empate: la que más descuenta. Sigue el empate: la más
 * antigua (`created_at`) y luego el id. Con todas en 0 —el valor por
 * defecto— el primer criterio no mueve nada y queda la regla de siempre.
 */
function compararCompetidoras(a: CalculoListo, b: CalculoListo): number {
  const pa = num(a.promo.priority);
  const pb = num(b.promo.priority);
  if (pa !== pb) return pb - pa;
  if (a.calc.total !== b.calc.total) return b.calc.total - a.calc.total;
  return compararPrioridad(a.promo, b.promo);
}

/** Dentro de un grupo: la no combinable ganadora contra la suma de las combinables. */
function elegirEnComponente(grupo: CalculoListo[]): FilaPromocion[] {
  const combinables = grupo.filter((c) => !!c.promo.is_combinable);
  const exclusivas = grupo.filter((c) => !c.promo.is_combinable).sort(compararCompetidoras);
  const suma = combinables.reduce((s, c) => s + c.calc.total, 0);
  const mejor = exclusivas[0] ?? null;
  if (mejor && mejor.calc.total >= suma) return [mejor.promo];
  return combinables.map((c) => c.promo);
}

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
  // Una línea excluida no entra: ni descuento, ni mínimos, ni paquetes, ni «lleve X», ni «cada N».
  const validas = lineas.map((l) => l.promo_excluded !== true && num(l.quantity) > 0 && num(l.unit_price) >= 0);
  if (lineas.length === 0 || promociones.length === 0) return VACIO(lineas.length);

  const dia = diaSemanaEnZona(ctx.ahora, ctx.zonaHoraria);
  const subtotalCuenta = lineas.reduce((s, l, i) => s + (validas[i] ? totalLinea(l) : 0), 0);
  const validos = lineas.map((_, i) => i).filter((i) => validas[i]);

  const elegibles = promociones.filter((p) => promocionVigente(p, ctx, dia)).sort(compararPrioridad);

  const calculos = new Map<string, CalculoListo>();
  const listos: CalculoListo[] = [];
  for (const p of elegibles) {
    const indices = lineas.map((_, i) => i).filter((i) => validas[i] && lineaCumpleReglas(lineas[i], p));
    if (indices.length === 0) continue;
    const minimo = num(p.min_purchase_amount);
    if (minimo > 0) {
      const base =
        alcanceCompraMinima(p) === 'cart' ? subtotalCuenta : indices.reduce((s, i) => s + totalLinea(lineas[i]), 0);
      if (base < minimo) continue;
    }
    if (!cumpleCantidadMinima(p, lineas, indices)) continue;
    const calc = calcularPromocion(p, lineas, indices);
    if (calc.total <= 0) continue;
    const fila: CalculoListo = { promo: p, indices, grupo: indicesDeGrupo(p, indices, validos), calc };
    calculos.set(p.id, fila);
    listos.push(fila);
  }

  // Cada componente aplica la regla de siempre (una no combinable contra la
  // suma de las combinables). Componentes distintos se suman: dos
  // no combinables sobre productos que no comparten línea se aplican las dos.
  const aAplicar = componentesDe(listos).flatMap(elegirEnComponente);

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
  /** Quitaron la promoción de la línea. En 0 el manual no la vuelve a traer. */
  promo_excluded?: boolean | null;
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
    if (l.promo_excluded === true) {
      if (manual !== null) {
        return { discount_amount: Math.min(maximo, manual), manual_discount_amount: manual, promo_discount_amount: 0 };
      }
      return { discount_amount: 0, manual_discount_amount: null, promo_discount_amount: 0 };
    }
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
  /** El mesero quitó la promoción. El recálculo de la cuenta no se la devuelve. */
  promo_excluded?: boolean | null;
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
    const excluida = l.promo_excluded === true;
    const d = excluida
      ? 0
      : Math.min(centavos(num(l.quantity) * num(l.unit_price)), centavos(num(resultado.lineDiscounts[i])));
    const ids = !excluida && d > 0
      ? resultado.applied.filter((a) => a.lineas.includes(i)).map((a) => a.promotion_id).sort()
      : [];
    const antes = Array.isArray(l.notes?.promociones) ? (l.notes!.promociones as unknown[]).map(String).sort() : [];
    if (centavos(num(l.discount_amount)) === d && antes.join(',') === ids.join(',')) return;
    cambios.push({ sale_item_id: l.id, discount_amount: d, promotion_ids: ids });
  });
  return cambios;
}
