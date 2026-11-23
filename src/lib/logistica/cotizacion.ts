/**
 * Contrato de la cotización de envío (logística Fase 1). Puro.
 *
 * El cálculo vive en la base (`logistica_cotizar_envio`, migración 20261123145549); aquí solo:
 * - se normaliza la dirección que se envía (DANE de 5 dígitos, coordenadas válidas);
 * - se tipa y se lee la respuesta;
 * - `normalizarBarrio` replica `fn_logistica_normalizar` para que la pantalla de zonas muestre
 *   cómo se va a comparar un barrio (la base guarda `neighborhood_key` generado).
 */

export const CANALES_COTIZACION = ['web', 'pos', 'manual'] as const;
export type CanalCotizacion = (typeof CANALES_COTIZACION)[number];

export interface DireccionCotizacion {
  /** Código DANE del municipio (5 dígitos; 4 se completa con cero a la izquierda). */
  municipio_dane?: string | null;
  barrio?: string | null;
  codigo_postal?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface OpcionesCotizacion {
  metodo_pago?: string | null;
  /** Peso explícito (simulador, prueba de reglas). Manda sobre `items`. */
  peso_kg?: number | null;
  /** Productos del pedido: la base suma el peso (`fn_logistica_peso_items`) para las reglas por peso. */
  items?: ItemCotizacion[];
}

export interface ItemCotizacion {
  product_id: number;
  cantidad: number;
}

/** Ítems listos para la RPC: ids enteros positivos, cantidades > 0, sumados por producto y como mucho 200. */
export function itemsParaCotizar(items: ReadonlyArray<{ product_id?: unknown; cantidad?: unknown }> | null | undefined): ItemCotizacion[] {
  const porProducto = new Map<number, number>();
  for (const it of items ?? []) {
    const id = Number(it?.product_id);
    const cant = Number(it?.cantidad);
    if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(cant) || cant <= 0) continue;
    porProducto.set(id, (porProducto.get(id) ?? 0) + cant);
  }
  return [...porProducto.entries()].slice(0, 200).map(([product_id, cantidad]) => ({ product_id, cantidad: Math.min(cantidad, 999999) }));
}

export interface CotizacionEnvio {
  en_zona: boolean;
  zona: { id: string; nombre: string; es_tarifa_general: boolean; coincidencia: string | null } | null;
  /** Precio a cobrar (0 si aplica envío gratis); null = sin tarifa (fuera de cobertura). */
  precio: number | null;
  tarifa: number | null;
  moneda: string | null;
  envio_gratis: boolean;
  envio_gratis_desde: number | null;
  falta_para_envio_gratis: number | null;
  pedido_minimo: number;
  cumple_minimo: boolean;
  falta_para_minimo: number;
  tiempo: { min_minutos: number | null; max_minutos: number | null; texto: string | null } | null;
  despacho: {
    /** Día calendario del despacho en la zona de la sede (date, no timestamptz). */
    fecha: string;
    hoy: boolean;
    corte: string | null;
    dias_reparto: number[];
    zona_horaria: string;
  } | null;
  modo: 'own' | 'last_mile' | 'national_carrier' | 'marketplace';
  regla_id: string | null;
  /** null = en zona; 'fuera_de_zona' | 'sin_zonas_configuradas'. */
  motivo: 'fuera_de_zona' | 'sin_zonas_configuradas' | null;
  /** Qué se ofrece fuera de zona: tarifa general, transportadora o nada (null). */
  alternativa: 'tarifa_general' | 'transportadora' | null;
  canal: CanalCotizacion;
  subtotal: number;
}

/** Igual que fn_logistica_normalizar: minúsculas, sin tildes, espacios simples; '' → null. */
export function normalizarBarrio(texto: string | null | undefined): string | null {
  const limpio = (texto ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return limpio === '' ? null : limpio;
}

/** DANE de 5 dígitos. Quita lo que no es dígito y completa un código de 4 (05001 llega como 5001). */
export function normalizarCodigoDane(codigo: string | number | null | undefined): string | null {
  const digitos = String(codigo ?? '').replace(/\D/g, '');
  if (digitos.length === 4) return `0${digitos}`;
  return digitos.length === 5 ? digitos : null;
}

function coordenada(valor: unknown, limite: number): number | null {
  const n = typeof valor === 'string' ? Number(valor) : valor;
  return typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= limite ? n : null;
}

/** Dirección lista para la RPC: solo los campos que la base usa, ya validados. */
export function direccionParaCotizar(d: DireccionCotizacion): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const dane = normalizarCodigoDane(d.municipio_dane);
  if (dane) out.municipio_dane = dane;
  const barrio = (d.barrio ?? '').trim();
  if (barrio) out.barrio = barrio;
  const cp = (d.codigo_postal ?? '').replace(/\s/g, '').toUpperCase();
  if (cp) out.codigo_postal = cp;
  const lat = coordenada(d.lat, 90);
  const lng = coordenada(d.lng, 180);
  if (lat !== null && lng !== null) {
    out.lat = lat;
    out.lng = lng;
  }
  return out;
}

/** ¿La dirección trae algo con qué ubicarla en una zona? */
export function direccionUbicable(d: DireccionCotizacion): boolean {
  return Object.keys(direccionParaCotizar(d)).length > 0;
}

/** Lee la respuesta jsonb de la RPC con números de verdad (Postgres devuelve numeric como number o string). */
export function leerCotizacion(crudo: unknown): CotizacionEnvio {
  const r = (crudo ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
  return {
    ...(r as unknown as CotizacionEnvio),
    precio: num(r.precio),
    tarifa: num(r.tarifa),
    envio_gratis: r.envio_gratis === true,
    envio_gratis_desde: num(r.envio_gratis_desde),
    falta_para_envio_gratis: num(r.falta_para_envio_gratis),
    pedido_minimo: num(r.pedido_minimo) ?? 0,
    cumple_minimo: r.cumple_minimo !== false,
    falta_para_minimo: num(r.falta_para_minimo) ?? 0,
    subtotal: num(r.subtotal) ?? 0,
    en_zona: r.en_zona === true,
  };
}

/** ¿Se puede vender con domicilio propio con esta cotización? (hay precio y cumple el mínimo). */
export function cotizacionPermiteDomicilio(c: CotizacionEnvio): boolean {
  return c.precio !== null && c.cumple_minimo && c.modo === 'own';
}

// ── Promesa de entrega: minutos, horas o días ───────────────────────────────────────────────────
//
// La zona guarda la promesa en minutos (`promise_min_minutes` / `promise_max_minutes`). Un domicilio
// de restaurante promete «45–60 min»; un envío nacional, «3–15 días». La unidad se deduce del valor
// más largo: desde 1 día se muestra en días y desde 2 horas en horas. Solo se dice «Llega hoy»
// cuando la promesa es de menos de un día; con días u horas largas se dice «Sale hoy».

export const MINUTOS_POR_HORA = 60;
export const MINUTOS_POR_DIA = 1440;

export type UnidadPromesa = 'minutos' | 'horas' | 'dias';

export const MINUTOS_POR_UNIDAD: Record<UnidadPromesa, number> = {
  minutos: 1,
  horas: MINUTOS_POR_HORA,
  dias: MINUTOS_POR_DIA,
};

export interface PromesaEntrega {
  unidad: UnidadPromesa;
  /** null = «hasta {hasta}». */
  desde: number | null;
  hasta: number | null;
  /** Texto libre de la zona («Mismo día», «2 a 5 días hábiles»); manda sobre los números. */
  texto: string | null;
  /** ¿La entrega cabe en el mismo día del despacho? (promesa en minutos u horas, menos de 24 h). */
  mismoDia: boolean;
}

const minutosValidos = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

/** Unidad para mostrar o editar una promesa guardada en minutos. */
export function unidadDePromesa(minMinutos: number | null | undefined, maxMinutos: number | null | undefined): UnidadPromesa {
  const ref = minutosValidos(maxMinutos) ?? minutosValidos(minMinutos);
  if (ref === null) return 'minutos';
  if (ref >= MINUTOS_POR_DIA) return 'dias';
  if (ref >= 2 * MINUTOS_POR_HORA) return 'horas';
  return 'minutos';
}

/** Minutos guardados → valor en la unidad (redondeado; 0 cuenta como «sin desde»). */
export function valorEnUnidad(minutos: number | null | undefined, unidad: UnidadPromesa): number | null {
  const m = minutosValidos(minutos);
  if (m === null) return null;
  return Math.round(m / MINUTOS_POR_UNIDAD[unidad]);
}

/** Valor escrito en una unidad → minutos para guardar. */
export function minutosDeValor(valor: number | null | undefined, unidad: UnidadPromesa): number | null {
  const v = minutosValidos(valor);
  return v === null ? null : Math.round(v * MINUTOS_POR_UNIDAD[unidad]);
}

/** Promesa lista para mostrar, o null si la zona no promete nada. */
export function promesaEntrega(
  t: { min_minutos: number | null; max_minutos: number | null; texto: string | null } | null | undefined,
): PromesaEntrega | null {
  if (!t) return null;
  const texto = (t.texto ?? '').trim() || null;
  const min = minutosValidos(t.min_minutos);
  const max = minutosValidos(t.max_minutos);
  if (min === null && max === null && !texto) return null;
  const unidad = unidadDePromesa(min, max);
  let desde = valorEnUnidad(min, unidad);
  let hasta = valorEnUnidad(max, unidad);
  if (hasta === null) {
    hasta = desde;
    desde = null;
  }
  if (desde !== null && desde <= 0) desde = null;
  const ref = max ?? min;
  return { unidad, desde, hasta, texto, mismoDia: ref !== null && ref < MINUTOS_POR_DIA };
}

/** ¿Se puede decir «Llega hoy»? Despacha hoy y la promesa es de menos de un día. */
export function llegaHoy(c: Pick<CotizacionEnvio, 'tiempo' | 'despacho'> | null | undefined): boolean {
  if (!c?.despacho?.hoy) return false;
  return promesaEntrega(c.tiempo)?.mismoDia === true;
}
