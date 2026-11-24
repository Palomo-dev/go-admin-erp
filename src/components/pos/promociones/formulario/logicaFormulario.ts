/**
 * Lógica pura de la pantalla única «Nueva / Editar promoción» (Figma 05 POS y ventas,
 * A2 2999:193484 y A2b 3002:193908). Sin React ni Supabase: se prueba sola.
 *
 * - Alcance: Todos · Categorías · Productos · Marcas, con exclusiones opcionales de
 *   productos y categorías. Se traduce a `applies_to` + `promotion_rules` como siempre:
 *   «Todos» con exclusiones se guarda como reglas `exclude_*` (el motor ignora las reglas
 *   cuando `applies_to = 'all'`, por eso no puede quedar en `all`).
 * - Precio por volumen: escalones «desde N unidades» con precio fijo por unidad o %.
 *   La fila «1 a 5 unidades · precio normal» es solo visual: no se guarda.
 * - Cambiar de tipo conserva el valor solo si significa lo mismo (15 % de un combo sigue
 *   siendo 15 al volver a porcentaje; un porcentaje no se vuelve pesos).
 */
import type {
  AppliesTo,
  CreatePromotionData,
  CreatePromotionRuleData,
  PromotionRule,
  PromotionTier,
  PromotionType,
  TiersCountMode,
} from '../types';

export type Alcance = 'todos' | 'categorias' | 'productos' | 'marcas';
export type ModoEscalon = 'precio' | 'porcentaje';

export interface EscalonFormulario {
  /** Unidades desde las que aplica (texto del campo). */
  desde: string;
  /** Precio por unidad o porcentaje, según el modo (texto del campo). */
  valor: string;
}

export interface SeleccionAlcance {
  alcance: Alcance;
  productos: number[];
  categorias: number[];
  marcas: string[];
  excluirProductos: number[];
  excluirCategorias: number[];
  /** Unidades de cada producto en un combo con precio. */
  cantidadesPaquete: Record<number, number>;
  /** Grupo de conteo de cada producto (precio por volumen «por grupos»). */
  gruposVolumen: Record<number, number>;
}

export const SELECCION_VACIA: SeleccionAlcance = {
  alcance: 'todos',
  productos: [],
  categorias: [],
  marcas: [],
  excluirProductos: [],
  excluirCategorias: [],
  cantidadesPaquete: {},
  gruposVolumen: {},
};

type ReglaLeida = Pick<PromotionRule, 'rule_type' | 'product_id' | 'category_id' | 'quantity' | 'brand' | 'tier_group'> |
  CreatePromotionRuleData;

const unicos = <T,>(xs: T[]): T[] => Array.from(new Set(xs));

function enteroPositivo(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Selección de la pantalla a partir de lo guardado (`applies_to` + reglas). */
export function alcanceDesdeReglas(appliesTo: AppliesTo | string | undefined, reglas: readonly ReglaLeida[]): SeleccionAlcance {
  const sel: SeleccionAlcance = {
    ...SELECCION_VACIA,
    productos: [],
    categorias: [],
    marcas: [],
    excluirProductos: [],
    excluirCategorias: [],
    cantidadesPaquete: {},
    gruposVolumen: {},
  };
  if (appliesTo === 'all') return sel;
  for (const r of reglas) {
    const tipo = String(r.rule_type);
    if (tipo === 'include_product' && r.product_id != null) {
      sel.productos.push(Number(r.product_id));
      const q = enteroPositivo(r.quantity);
      if (q != null) sel.cantidadesPaquete[Number(r.product_id)] = q;
      const g = enteroPositivo(r.tier_group);
      if (g != null) sel.gruposVolumen[Number(r.product_id)] = g;
    } else if (tipo === 'include_category' && r.category_id != null) {
      sel.categorias.push(Number(r.category_id));
    } else if (tipo === 'include_brand') {
      const marca = (r.brand ?? '').trim();
      if (marca) sel.marcas.push(marca);
    } else if (tipo === 'exclude_product' && r.product_id != null) {
      sel.excluirProductos.push(Number(r.product_id));
    } else if (tipo === 'exclude_category' && r.category_id != null) {
      sel.excluirCategorias.push(Number(r.category_id));
    }
  }
  sel.productos = unicos(sel.productos);
  sel.categorias = unicos(sel.categorias);
  sel.marcas = unicos(sel.marcas);
  sel.excluirProductos = unicos(sel.excluirProductos);
  sel.excluirCategorias = unicos(sel.excluirCategorias);
  if (sel.marcas.length > 0) sel.alcance = 'marcas';
  else if (sel.categorias.length > 0) sel.alcance = 'categorias';
  else if (sel.productos.length > 0) sel.alcance = 'productos';
  else sel.alcance = 'todos';
  return sel;
}

/** `applies_to` y reglas a guardar. */
export function reglasDesdeAlcance(
  sel: SeleccionAlcance,
  tipo: PromotionType,
  modoConteo: TiersCountMode,
): { applies_to: AppliesTo; rules: CreatePromotionRuleData[] } {
  const rules: CreatePromotionRuleData[] = [];
  const esCombo = tipo === 'bundle';
  const porGrupos = tipo === 'volume_tiers' && modoConteo === 'product_group';
  let applies_to: AppliesTo = 'all';
  if (sel.alcance === 'productos') {
    applies_to = 'products';
    for (const id of sel.productos) {
      rules.push({
        rule_type: 'include_product',
        product_id: id,
        quantity: esCombo ? (enteroPositivo(sel.cantidadesPaquete[id]) ?? 1) : null,
        tier_group: porGrupos ? (enteroPositivo(sel.gruposVolumen[id]) ?? 1) : null,
      });
    }
  } else if (sel.alcance === 'categorias') {
    applies_to = 'categories';
    for (const id of sel.categorias) rules.push({ rule_type: 'include_category', category_id: id });
  } else if (sel.alcance === 'marcas') {
    applies_to = 'brands';
    for (const marca of sel.marcas) rules.push({ rule_type: 'include_brand', brand: marca });
  }
  for (const id of sel.excluirProductos) rules.push({ rule_type: 'exclude_product', product_id: id });
  for (const id of sel.excluirCategorias) rules.push({ rule_type: 'exclude_category', category_id: id });
  // «Todos» con exclusiones: con `all` el motor no mira las reglas.
  if (applies_to === 'all' && rules.length > 0) applies_to = sel.excluirProductos.length > 0 ? 'products' : 'categories';
  return { applies_to, rules };
}

// ── Escalones ────────────────────────────────────────────────────────────────

export function escalonesDesdeFilas(tiers: readonly PromotionTier[] | undefined): { modo: ModoEscalon; escalones: EscalonFormulario[] } {
  const filas = [...(tiers ?? [])].sort((a, b) => a.min_quantity - b.min_quantity);
  if (filas.length === 0) return { modo: 'precio', escalones: [{ desde: '6', valor: '' }] };
  const modo: ModoEscalon = filas.every((t) => t.unit_price == null && t.discount_percent != null) ? 'porcentaje' : 'precio';
  return {
    modo,
    escalones: filas.map((t) => ({
      desde: String(t.min_quantity),
      valor: String(modo === 'precio' ? (t.unit_price ?? '') : (t.discount_percent ?? '')),
    })),
  };
}

export function filasDesdeEscalones(modo: ModoEscalon, escalones: readonly EscalonFormulario[]): PromotionTier[] {
  return escalones
    .map((e, i) => {
      const desde = Math.trunc(Number(e.desde));
      const valor = Number(e.valor);
      return {
        min_quantity: desde,
        unit_price: modo === 'precio' ? valor : null,
        discount_percent: modo === 'porcentaje' ? valor : null,
        sort_order: i,
      };
    })
    .filter((t) => Number.isFinite(t.min_quantity) && t.min_quantity > 0);
}

/** «Hasta» de cada escalón: el siguiente «desde» menos 1; el último, null («o más»). */
export function hastaDeEscalones(escalones: readonly EscalonFormulario[]): Array<number | null> {
  return escalones.map((_, i) => {
    const siguiente = Math.trunc(Number(escalones[i + 1]?.desde));
    return Number.isFinite(siguiente) && siguiente > 0 ? siguiente - 1 : null;
  });
}

/** Porcentaje que ahorra un precio fijo frente al precio normal (entero), o null. */
export function ahorroPorcentaje(precioNormal: number | null, modo: ModoEscalon, valor: string): number | null {
  const v = Number(valor);
  if (!(v > 0)) return null;
  if (modo === 'porcentaje') return v <= 100 ? Math.round(v) : null;
  if (!(precioNormal && precioNormal > 0) || v >= precioNormal) return null;
  return Math.round(((precioNormal - v) / precioNormal) * 100);
}

/** Clave i18n del primer problema de los escalones, o null. */
export function errorEscalones(modo: ModoEscalon, escalones: readonly EscalonFormulario[]): string | null {
  if (escalones.length === 0) return 'v2.errores.escalonesVacios';
  let anterior = 1;
  for (const e of escalones) {
    const desde = Number(e.desde);
    if (!Number.isInteger(desde) || desde < 2) return 'v2.errores.escalonDesde';
    if (desde <= anterior) return 'v2.errores.escalonesOrden';
    anterior = desde;
    const v = Number(e.valor);
    if (e.valor.trim() === '' || !Number.isFinite(v) || v <= 0) return 'v2.errores.escalonValor';
    if (modo === 'porcentaje' && v > 100) return 'v2.errores.escalonPorcentaje';
  }
  return null;
}

// ── Tipo ─────────────────────────────────────────────────────────────────────

function usaPorcentaje(tipo: PromotionType): boolean {
  return tipo === 'percentage' || tipo === 'bundle';
}

/** Valor que se conserva al cambiar de tipo (mismo criterio del asistente anterior). */
export function valorDescuentoCompatible(desde: PromotionType, hacia: PromotionType, valor: number): number {
  if (desde === hacia && valor > 0) return valor;
  if (usaPorcentaje(desde) && usaPorcentaje(hacia) && valor > 0 && valor <= 100) return valor;
  if (desde === 'fixed_amount' && hacia === 'fixed_amount' && valor > 0) return valor;
  return 0;
}

export function cambiarTipo(prev: CreatePromotionData, tipo: PromotionType): CreatePromotionData {
  if (prev.promotion_type === tipo) return prev;
  const siguePorcentaje = usaPorcentaje(prev.promotion_type) && usaPorcentaje(tipo);
  return {
    ...prev,
    promotion_type: tipo,
    discount_value: valorDescuentoCompatible(prev.promotion_type, tipo, prev.discount_value ?? 0),
    bundle_price: tipo === 'bundle' ? prev.bundle_price : null,
    max_discount_amount: siguePorcentaje ? prev.max_discount_amount : undefined,
  };
}

// ── Validación ───────────────────────────────────────────────────────────────

export type CampoError =
  | 'nombre'
  | 'porcentaje'
  | 'monto'
  | 'compra'
  | 'lleva'
  | 'precioPaquete'
  | 'porcentajePaquete'
  | 'escalones'
  | 'alcance'
  | 'fechaInicio'
  | 'fechaFin'
  | 'grupoClientes'
  | 'canales';

/** Orden en que se enfoca el primer error (de arriba abajo en la pantalla). */
export const ORDEN_ERRORES: readonly CampoError[] = [
  'nombre',
  'porcentaje',
  'monto',
  'compra',
  'lleva',
  'precioPaquete',
  'porcentajePaquete',
  'escalones',
  'alcance',
  'canales',
  'fechaInicio',
  'fechaFin',
  'grupoClientes',
];

export interface EntradaValidacion {
  datos: CreatePromotionData;
  seleccion: SeleccionAlcance;
  modoEscalon: ModoEscalon;
  escalones: readonly EscalonFormulario[];
  /** «Un grupo de clientes» elegido en Opciones avanzadas. */
  soloGrupo: boolean;
}

/** Errores por campo: claves i18n del namespace `posPromociones`. */
export function validarPromocion({ datos, seleccion, modoEscalon, escalones, soloGrupo }: EntradaValidacion): Partial<Record<CampoError, string>> {
  const e: Partial<Record<CampoError, string>> = {};
  if (!datos.name.trim()) e.nombre = 'formulario.nombreRequerido';
  const valor = Number(datos.discount_value) || 0;
  switch (datos.promotion_type) {
    case 'percentage':
      if (valor <= 0 || valor > 100) e.porcentaje = 'formulario.porcentajeInvalido';
      break;
    case 'fixed_amount':
      if (valor <= 0) e.monto = 'formulario.montoInvalido';
      break;
    case 'buy_x_get_y':
      if (!enteroPositivo(datos.buy_quantity)) e.compra = 'formulario.errorCompra';
      if (!enteroPositivo(datos.get_quantity)) e.lleva = 'formulario.errorLleva';
      break;
    case 'bundle': {
      const precio = Number(datos.bundle_price) || 0;
      if (precio <= 0 && (valor <= 0 || valor > 100)) {
        e.precioPaquete = 'formulario.paqueteValor';
        e.porcentajePaquete = valor > 100 ? 'formulario.porcentajeInvalido' : 'formulario.paqueteValor';
      } else if (precio > 0 && (seleccion.alcance !== 'productos' || seleccion.productos.length === 0)) {
        e.alcance = 'formulario.paqueteAlMenosUno';
      }
      break;
    }
    case 'volume_tiers': {
      const err = errorEscalones(modoEscalon, escalones);
      if (err) e.escalones = err;
      if (datos.tiers_count_mode === 'product_group' && (seleccion.alcance !== 'productos' || seleccion.productos.length === 0)) {
        e.alcance = 'v2.errores.gruposProductos';
      }
      break;
    }
  }
  if (!e.alcance) {
    if (seleccion.alcance === 'productos' && seleccion.productos.length === 0) e.alcance = 'v2.errores.alcanceProductos';
    if (seleccion.alcance === 'categorias' && seleccion.categorias.length === 0) e.alcance = 'v2.errores.alcanceCategorias';
    if (seleccion.alcance === 'marcas' && seleccion.marcas.length === 0) e.alcance = 'v2.errores.alcanceMarcas';
  }
  if (datos.applies_to_pos === false && datos.applies_to_web === false && datos.applies_to_finances !== true) {
    e.canales = 'v2.errores.canales';
  }
  if (!datos.start_date) e.fechaInicio = 'formulario.fechaInicioRequerida';
  if (datos.start_date && datos.end_date && datos.end_date < datos.start_date) e.fechaFin = 'formulario.fechaFinError';
  if (soloGrupo && !datos.customer_segment_id) e.grupoClientes = 'v2.errores.grupoClientes';
  return e;
}

/**
 * Cuántos ajustes de «Opciones avanzadas» difieren del valor por defecto
 * (insignia «3 cambiados»).
 */
export function cambiosAvanzados(d: CreatePromotionData): number {
  let n = 0;
  if (d.customer_segment_id) n++;
  if (d.usage_limit != null && d.usage_limit > 0) n++;
  if (d.usage_limit_per_customer != null && d.usage_limit_per_customer > 0) n++;
  if (d.max_discount_amount != null && d.max_discount_amount > 0) n++;
  if (d.min_purchase_amount != null && d.min_purchase_amount > 0) n++;
  if (d.is_combinable) n++;
  // Listas de precios: «No aplica a clientes con lista de precios» (apagada por defecto).
  if (d.applies_with_price_lists === false) n++;
  if ((d.payment_method_codes ?? []).length > 0) n++;
  if ((d.description ?? '').replace(/<[^>]*>/g, '').trim()) n++;
  return n;
}
