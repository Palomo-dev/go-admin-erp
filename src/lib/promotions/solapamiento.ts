/**
 * Aviso del asistente: dos promociones activas se pisan si comparten
 * productos o categorías, sucursal, canal y vigencia, y ninguna de las dos
 * es combinable. No bloquea el guardado: solo avisa que, en cada producto,
 * se aplicará una sola.
 *
 * «Todos los productos» se pisa con cualquiera. El padre de una variante
 * cuenta como el mismo producto (igual que el motor). Sucursal vacía = todas.
 * La vigencia reutiliza `vigencia.ts` (día de la semana y franja, incluida
 * la que cruza la medianoche).
 */
import type { WeekDay } from '@/components/pos/promociones/types';
import { appliesInTimeWindow, appliesOnWeekDay } from '@/lib/promotions/vigencia';

const DIAS: WeekDay[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export interface ReglaSolape {
  rule_type?: string | null;
  product_id?: number | null;
  category_id?: number | null;
}

export interface PromoSolape {
  id: string;
  name: string;
  is_combinable?: boolean | null;
  is_active?: boolean | null;
  applies_to?: string | null;
  branches?: unknown;
  applies_to_web?: boolean | null;
  applies_to_pos?: boolean | null;
  applies_to_finances?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
  applicable_days?: unknown;
  start_time?: string | null;
  end_time?: string | null;
  rules?: ReglaSolape[] | null;
  promotion_rules?: ReglaSolape[] | null;
}

export interface ProductoCatalogo {
  id: number;
  parent_product_id?: number | null;
  category_id?: number | null;
}

function reglasDe(p: PromoSolape): ReglaSolape[] {
  return (p.rules ?? p.promotion_rules ?? []) as ReglaSolape[];
}

function instante(valor: string | null | undefined, fin: boolean): number {
  if (valor == null || valor === '') return fin ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const t = new Date(fin ? `${valor}T23:59:59.999Z` : `${valor}T00:00:00.000Z`).getTime();
    return Number.isFinite(t) ? t : fin ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  }
  const t = new Date(valor).getTime();
  return Number.isFinite(t) ? t : fin ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
}

function vigenciasSeCruzan(a: PromoSolape, b: PromoSolape): boolean {
  const a0 = instante(a.start_date, false);
  const a1 = instante(a.end_date, true);
  const b0 = instante(b.start_date, false);
  const b1 = instante(b.end_date, true);
  return a0 <= b1 && b0 <= a1;
}

/** Solo días, sin franja (se conserva por compatibilidad; `seSolapan` usa `semanasSeCruzan`). */
export function diasSeCruzan(a: PromoSolape, b: PromoSolape): boolean {
  return DIAS.some((dia) => appliesOnWeekDay(a, dia) && appliesOnWeekDay(b, dia));
}

/** Minutos desde la medianoche. Ilegible = sin hora. */
function minutos(valor: string | null | undefined): number | null {
  if (valor == null || valor === '') return null;
  const m = String(valor).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

function horaDeMinutos(total: number): string {
  const m = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
}

/**
 * ¿Las franjas comparten algún minuto? Sin inicio ni fin, es todo el día.
 * Los extremos y el punto medio de cada franja se prueban con
 * `appliesInTimeWindow`, que ya cruza la medianoche cuando el fin es
 * anterior al inicio.
 */
export function franjasSeCruzan(a: PromoSolape, b: PromoSolape): boolean {
  const todo = (p: PromoSolape) => minutos(p.start_time) == null && minutos(p.end_time) == null;
  if (todo(a) || todo(b)) return true;
  const marcas = (p: PromoSolape): string[] => {
    const ini = minutos(p.start_time);
    const fin = minutos(p.end_time);
    const puntos: number[] = [];
    if (ini != null) puntos.push(ini);
    if (fin != null) puntos.push(fin);
    if (ini != null && fin != null) {
      puntos.push(ini <= fin ? Math.floor((ini + fin) / 2) : (ini + 60) % (24 * 60));
    }
    return puntos.map(horaDeMinutos);
  };
  return [...marcas(a), ...marcas(b)].some((hora) => appliesInTimeWindow(a, hora) && appliesInTimeWindow(b, hora));
}

const MIN_DIA = 24 * 60;
const MIN_SEMANA = 7 * MIN_DIA;

/**
 * Tramos de la semana (minutos desde el lunes 00:00, extremos incluidos) en
 * que la promoción está vigente. Una franja que cruza la medianoche se
 * asigna al día en que EMPIEZA: «lunes 18:00–02:00» ocupa del lunes 18:00 al
 * martes 02:00, igual que lo evalúa el motor (`diaEfectivoDeFranja`).
 */
function tramosSemanales(p: PromoSolape): Array<[number, number]> {
  const ini = minutos(p.start_time);
  const fin = minutos(p.end_time);
  let desde: number;
  let hasta: number;
  if (ini == null && fin == null) { desde = 0; hasta = MIN_DIA - 1; }
  else if (ini != null && fin == null) { desde = ini; hasta = MIN_DIA - 1; }
  else if (ini == null && fin != null) { desde = 0; hasta = fin; }
  else if (ini! <= fin!) { desde = ini!; hasta = fin!; }
  else { desde = ini!; hasta = MIN_DIA + fin!; }
  return DIAS.filter((dia) => appliesOnWeekDay(p, dia)).map((dia) => {
    const base = DIAS.indexOf(dia) * MIN_DIA;
    return [base + desde, base + hasta] as [number, number];
  });
}

/** ¿Comparten algún minuto de la semana, contando días y franja juntos? */
export function semanasSeCruzan(a: PromoSolape, b: PromoSolape): boolean {
  const ta = tramosSemanales(a);
  const tb = tramosSemanales(b);
  return ta.some(([a0, a1]) =>
    tb.some(([b0, b1]) =>
      // El domingo que cruza la medianoche cae en el lunes siguiente: se prueba desplazado una semana.
      [-MIN_SEMANA, 0, MIN_SEMANA].some((d) => a0 <= b1 + d && b0 + d <= a1),
    ),
  );
}

function canalesSeCruzan(a: PromoSolape, b: PromoSolape): boolean {
  const aplica = (p: PromoSolape, canal: 'web' | 'pos' | 'finances') => {
    const flag = canal === 'web' ? p.applies_to_web : canal === 'pos' ? p.applies_to_pos : p.applies_to_finances;
    return flag !== false;
  };
  return (['web', 'pos', 'finances'] as const).some((canal) => aplica(a, canal) && aplica(b, canal));
}

function listaSucursales(valor: unknown): number[] | null {
  if (!Array.isArray(valor) || valor.length === 0) return null;
  const ids = valor.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  return ids.length ? ids : null;
}

function sucursalesSeCruzan(a: PromoSolape, b: PromoSolape): boolean {
  const la = listaSucursales(a.branches);
  const lb = listaSucursales(b.branches);
  if (!la || !lb) return true;
  const set = new Set(la.map((n) => String(n)));
  return lb.some((n) => set.has(String(n)));
}

interface Alcance {
  /** Sin reglas de producto, o solo exclusiones: toca el catálogo entero. */
  todo: boolean;
  /** `applies_to` de productos o categorías sin ninguna regla: no toca nada. */
  vacio: boolean;
  productos: Set<number>;
  categorias: Set<number>;
}

function alcanceDe(p: PromoSolape): Alcance {
  const vacio = { todo: false, vacio: true, productos: new Set<number>(), categorias: new Set<number>() };
  if (p.applies_to === 'all' || p.applies_to == null || p.applies_to === '') {
    return { todo: true, vacio: false, productos: new Set(), categorias: new Set() };
  }
  const reglas = reglasDe(p);
  if (reglas.length === 0) return vacio;
  const hayInclusion = reglas.some((r) => String(r.rule_type ?? '').startsWith('include'));
  if (!hayInclusion) return { todo: true, vacio: false, productos: new Set(), categorias: new Set() };
  const productos = new Set<number>();
  const categorias = new Set<number>();
  for (const r of reglas) {
    if (!String(r.rule_type ?? '').startsWith('include')) continue;
    if (r.product_id != null) productos.add(Number(r.product_id));
    if (r.category_id != null) categorias.add(Number(r.category_id));
  }
  if (productos.size === 0 && categorias.size === 0) return vacio;
  return { todo: false, vacio: false, productos, categorias };
}

function mapaCatalogo(catalogo: ProductoCatalogo[]): Map<number, ProductoCatalogo> {
  return new Map(catalogo.map((p) => [Number(p.id), p]));
}

function padreDe(id: number, catalogo: Map<number, ProductoCatalogo>): number | null {
  const padre = catalogo.get(id)?.parent_product_id;
  return padre == null ? null : Number(padre);
}

function categoriaDe(id: number, catalogo: Map<number, ProductoCatalogo>): number | null {
  const fila = catalogo.get(id);
  if (!fila) return null;
  if (fila.category_id != null) return Number(fila.category_id);
  const padre = padreDe(id, catalogo);
  if (padre == null) return null;
  const cat = catalogo.get(padre)?.category_id;
  return cat == null ? null : Number(cat);
}

function productosSeCruzan(a: Set<number>, b: Set<number>, catalogo: Map<number, ProductoCatalogo>): boolean {
  for (const id of a) {
    if (b.has(id)) return true;
    const padre = padreDe(id, catalogo);
    if (padre != null && b.has(padre)) return true;
  }
  for (const id of b) {
    const padre = padreDe(id, catalogo);
    if (padre != null && a.has(padre)) return true;
  }
  return false;
}

function alcancesSeCruzan(a: Alcance, b: Alcance, catalogo: Map<number, ProductoCatalogo>): boolean {
  if (a.vacio || b.vacio) return false;
  if (a.todo || b.todo) return true;
  if (productosSeCruzan(a.productos, b.productos, catalogo)) return true;
  for (const cat of a.categorias) if (b.categorias.has(cat)) return true;
  for (const id of a.productos) {
    const cat = categoriaDe(id, catalogo);
    if (cat != null && b.categorias.has(cat)) return true;
  }
  for (const id of b.productos) {
    const cat = categoriaDe(id, catalogo);
    if (cat != null && a.categorias.has(cat)) return true;
  }
  return false;
}

/** ¿Estas dos promociones se pisarían en el motor si ninguna es combinable? */
export function seSolapan(a: PromoSolape, b: PromoSolape, catalogo: ProductoCatalogo[] = []): boolean {
  if (a.is_combinable === true || b.is_combinable === true) return false;
  if (a.is_active === false || b.is_active === false) return false;
  if (!vigenciasSeCruzan(a, b) || !semanasSeCruzan(a, b)) return false;
  if (!canalesSeCruzan(a, b) || !sucursalesSeCruzan(a, b)) return false;
  return alcancesSeCruzan(alcanceDe(a), alcanceDe(b), mapaCatalogo(catalogo));
}

/**
 * Promociones activas que se pisan con `candidata`. No incluye la propia
 * (mismo id) ni las combinables. Si la candidata es combinable o está
 * inactiva, no hay aviso.
 */
export function conflictosSolapados(
  candidata: PromoSolape,
  otras: PromoSolape[],
  catalogo: ProductoCatalogo[] = [],
): PromoSolape[] {
  if (candidata.is_combinable === true || candidata.is_active === false) return [];
  return otras.filter((otra) => otra.id !== candidata.id && otra.is_active !== false && seSolapan(candidata, otra, catalogo));
}
