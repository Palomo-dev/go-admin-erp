/**
 * Lógica pura del tablero de Comandas v2 y de la pantalla de cocina (KDS):
 * Figma «POS — Comandas v2 (propuesta)» 959:583911,
 * docs/design/POS-ESTACIONES-Y-COMANDAS.md §3.
 *
 * Sin React ni Supabase: se testea sola. La pantalla solo pinta lo que sale de
 * aquí (columnas, orden, semáforo, rondas, agrupado por mesa).
 */
import { ESTACIONES_COCINA } from '@/lib/pos/estacionEfectiva';

/** Columnas del tablero. El estado NO es un filtro: son las columnas. */
export type ColumnaComanda = 'new' | 'preparing' | 'ready' | 'delivered';
export const COLUMNAS: readonly ColumnaComanda[] = ['new', 'preparing', 'ready', 'delivered'];

export type NivelTiempo = 'normal' | 'atencion' | 'critico';

/** «Todas» o la clave de una estación (`hot_kitchen`, `bar`…). */
export type FiltroEstacion = 'todas' | string;

export interface ItemTablero {
  id: number;
  station?: string | null;
  status: string;
  is_allergy?: boolean;
  cancelled_at?: string | null;
}

export interface ComandaTablero {
  id: number;
  status: string;
  created_at: string;
  ready_at?: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  ticket_type?: string | null;
  table_session_id?: string | null;
  web_order_id?: string | null;
  cart_id?: string | null;
  source?: string | null;
  has_allergy?: boolean;
  allergy_ack_at?: string | null;
  table_sessions?: { restaurant_tables?: { name?: string | null; zone?: string | null } | null } | null;
  kitchen_ticket_items?: ItemTablero[];
}

// ─── Estaciones ──────────────────────────────────────────────────────────────

/**
 * Aspecto de cada estación conocida. La lista de claves es la canónica
 * (`ESTACIONES_COCINA`); aquí solo se le pone color, icono y tiempo objetivo
 * (los del doc §2.2 para cuando exista `pos_stations`). Una clave desconocida
 * se muestra neutra con su propio texto, nunca como error.
 */
export interface AspectoEstacion {
  /** Clave del icono Lucide (la pantalla la traduce a componente). */
  icono: 'flame' | 'snowflake' | 'wine' | 'receipt' | 'utensils' | 'chef-hat';
  /** Tono del manual: rojo, cian, violeta, pizarra. */
  tono: 'rojo' | 'cian' | 'violeta' | 'pizarra';
  /** Minutos objetivo de la estación (semáforo). */
  objetivo: number;
  /** Se muestra como pestaña de preparación (las de despacho no van al KDS). */
  preparacion: boolean;
}

const ASPECTOS: Record<(typeof ESTACIONES_COCINA)[number], AspectoEstacion> = {
  hot_kitchen: { icono: 'flame', tono: 'rojo', objetivo: 15, preparacion: true },
  cold_kitchen: { icono: 'snowflake', tono: 'cian', objetivo: 10, preparacion: true },
  bar: { icono: 'wine', tono: 'violeta', objetivo: 5, preparacion: true },
  cashier: { icono: 'receipt', tono: 'pizarra', objetivo: 10, preparacion: false },
  all: { icono: 'utensils', tono: 'pizarra', objetivo: 15, preparacion: true },
};

/** Objetivo por defecto si la estación no tiene uno (doc §2.2). */
export const OBJETIVO_POR_DEFECTO = 15;

export function aspectoEstacion(clave: string | null | undefined): AspectoEstacion {
  if (clave && clave in ASPECTOS) return ASPECTOS[clave as keyof typeof ASPECTOS];
  return { icono: 'chef-hat', tono: 'pizarra', objetivo: OBJETIVO_POR_DEFECTO, preparacion: true };
}

/** Clave de la estación del ítem; los ítems sin estación van a «general». */
export function estacionDelItem(item: Pick<ItemTablero, 'station'>): string {
  const s = (item.station ?? '').trim();
  return s || 'all';
}

/** Ítems vivos (no anulados) de la comanda, de una estación o de todas. */
export function itemsDeEstacion<I extends ItemTablero>(comanda: { kitchen_ticket_items?: I[] }, estacion: FiltroEstacion): I[] {
  const items = (comanda.kitchen_ticket_items ?? []).filter((i) => i.status !== 'cancelled' && !i.cancelled_at);
  if (estacion === 'todas') return items;
  return items.filter((i) => estacionDelItem(i) === estacion);
}

/** Estaciones presentes en las comandas, en el orden canónico y luego las demás. */
export function estacionesPresentes(comandas: ComandaTablero[]): string[] {
  const vistas = new Set<string>();
  for (const c of comandas) for (const i of c.kitchen_ticket_items ?? []) vistas.add(estacionDelItem(i));
  const canon = (ESTACIONES_COCINA as readonly string[]).filter((e) => vistas.has(e));
  const otras = Array.from(vistas).filter((e) => !(ESTACIONES_COCINA as readonly string[]).includes(e)).sort();
  return [...canon, ...otras];
}

// ─── Estado y columnas ───────────────────────────────────────────────────────

/**
 * Columna de la comanda. En «Todas» manda el estado de la comanda; en una
 * estación, el de SUS ítems (estado por estación: el bar no termina los platos
 * de la cocina). Devuelve null si la comanda no tiene ítems de la estación o
 * está cancelada.
 */
export function columnaDe(comanda: ComandaTablero, estacion: FiltroEstacion): ColumnaComanda | null {
  if (comanda.status === 'cancelled') return null;
  if (estacion === 'todas') {
    return (COLUMNAS as readonly string[]).includes(comanda.status) ? (comanda.status as ColumnaComanda) : null;
  }
  const items = itemsDeEstacion(comanda, estacion);
  if (items.length === 0) return null;
  if (comanda.status === 'delivered' || items.every((i) => i.status === 'delivered')) return 'delivered';
  if (items.every((i) => i.status === 'ready' || i.status === 'delivered')) return 'ready';
  if (items.every((i) => i.status === 'pending')) return 'new';
  return 'preparing';
}

/** Siguiente paso del botón principal según la columna. */
export function accionPrincipal(columna: ColumnaComanda | null): 'preparing' | 'ready' | 'delivered' | null {
  if (columna === 'new') return 'preparing';
  if (columna === 'preparing') return 'ready';
  if (columna === 'ready') return 'delivered';
  return null;
}

export function alergiaPendiente(c: Pick<ComandaTablero, 'has_allergy' | 'allergy_ack_at'>): boolean {
  return c.has_allergy === true && !c.allergy_ack_at;
}

// ─── Tiempo y semáforo ───────────────────────────────────────────────────────

/** Minutos desde que se envió; se congela al quedar lista. */
export function minutosTranscurridos(c: Pick<ComandaTablero, 'created_at' | 'ready_at'>, ahora: Date): number {
  const inicio = new Date(c.created_at).getTime();
  const fin = c.ready_at ? new Date(c.ready_at).getTime() : ahora.getTime();
  return Math.max(0, Math.floor((fin - inicio) / 60000));
}

/** Normal hasta el 80 % del objetivo, atención del 80 % al 100 %, crítico al pasarlo (doc §2.2). */
export function nivelTiempo(minutos: number, objetivo: number): NivelTiempo {
  const o = objetivo > 0 ? objetivo : OBJETIVO_POR_DEFECTO;
  if (minutos >= o) return 'critico';
  if (minutos >= Math.ceil(o * 0.8)) return 'atencion';
  return 'normal';
}

/** Objetivo de la comanda: el de su estación (o el menor de las que tenga en «Todas»). */
export function objetivoDe(c: ComandaTablero, estacion: FiltroEstacion): number {
  if (estacion !== 'todas') return aspectoEstacion(estacion).objetivo;
  // Las estaciones que aún tienen algo por hacer marcan el ritmo (el bar que ya
  // terminó no vuelve «demorada» una comanda de cocina).
  const vivos = itemsDeEstacion(c, 'todas');
  const pendientes = vivos.filter((i) => i.status === 'pending' || i.status === 'in_progress');
  const objetivos = (pendientes.length ? pendientes : vivos).map((i) => aspectoEstacion(estacionDelItem(i)).objetivo);
  return objetivos.length ? Math.min(...objetivos) : OBJETIVO_POR_DEFECTO;
}

/** Orden de una columna: demoradas primero, luego por antigüedad (las entregadas, la más reciente arriba). */
export function ordenarColumna<C extends ComandaTablero>(comandas: C[], columna: ColumnaComanda, estacion: FiltroEstacion, ahora: Date): C[] {
  if (columna === 'delivered') {
    return [...comandas].sort((a, b) => (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at));
  }
  const peso = (c: C) => (nivelTiempo(minutosTranscurridos(c, ahora), objetivoDe(c, estacion)) === 'critico' ? 0 : 1);
  return [...comandas].sort((a, b) => peso(a) - peso(b) || a.created_at.localeCompare(b.created_at));
}

export interface Tablero<C extends ComandaTablero> {
  columnas: Record<ColumnaComanda, C[]>;
  /** Activas (no entregadas) por estación, para el contador de las pestañas. */
  porEstacion: Record<string, number>;
  activas: number;
  demoradas: number;
  /** Minutos medios de preparación de las listas/entregadas del turno (o null). */
  tiempoMedio: number | null;
}

export function armarTablero<C extends ComandaTablero>(
  comandas: C[],
  opciones: { estacion: FiltroEstacion; zona?: string | null; ahora: Date },
): Tablero<C> {
  const { estacion, ahora } = opciones;
  const zona = opciones.zona && opciones.zona !== 'todas' ? opciones.zona : null;
  const enZona = zona ? comandas.filter((c) => (c.table_sessions?.restaurant_tables?.zone ?? null) === zona) : comandas;

  const columnas: Record<ColumnaComanda, C[]> = { new: [], preparing: [], ready: [], delivered: [] };
  for (const c of enZona) {
    const col = columnaDe(c, estacion);
    if (col) columnas[col].push(c);
  }
  for (const col of COLUMNAS) columnas[col] = ordenarColumna(columnas[col], col, estacion, ahora);

  const porEstacion: Record<string, number> = { todas: 0 };
  for (const c of enZona) {
    const viva = columnaDe(c, 'todas');
    if (!viva || viva === 'delivered') continue;
    porEstacion.todas += 1;
    const estaciones = new Set(itemsDeEstacion(c, 'todas').map(estacionDelItem));
    estaciones.forEach((e) => {
      const colE = columnaDe(c, e);
      if (colE && colE !== 'delivered') porEstacion[e] = (porEstacion[e] ?? 0) + 1;
    });
  }

  const vivas = [...columnas.new, ...columnas.preparing, ...columnas.ready];
  const demoradas = [...columnas.new, ...columnas.preparing].filter(
    (c) => nivelTiempo(minutosTranscurridos(c, ahora), objetivoDe(c, estacion)) === 'critico',
  ).length;
  const terminadas = [...columnas.ready, ...columnas.delivered].filter((c) => c.ready_at);
  const tiempoMedio = terminadas.length
    ? Math.round(terminadas.reduce((s, c) => s + minutosTranscurridos(c, ahora), 0) / terminadas.length)
    : null;

  return { columnas, porEstacion, activas: vivas.length, demoradas, tiempoMedio };
}

// ─── Rondas y agrupado por mesa ──────────────────────────────────────────────

/** Clave de la cuenta de la comanda: mesa, pedido web o carrito del mostrador. */
export function cuentaDe(c: ComandaTablero): string {
  if (c.table_session_id) return `mesa:${c.table_session_id}`;
  if (c.web_order_id) return `web:${c.web_order_id}`;
  if (c.cart_id) return `carrito:${c.cart_id}`;
  return `comanda:${c.id}`;
}

/** Número de ronda de cada comanda normal dentro de su cuenta (1, 2, 3…), por hora de envío. */
export function numerarRondas(comandas: ComandaTablero[]): Map<number, number> {
  const porCuenta = new Map<string, ComandaTablero[]>();
  for (const c of comandas) {
    if (c.ticket_type === 'adjustment') continue;
    const k = cuentaDe(c);
    porCuenta.set(k, [...(porCuenta.get(k) ?? []), c]);
  }
  const rondas = new Map<number, number>();
  porCuenta.forEach((lista) => {
    [...lista].sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach((c, i) => rondas.set(c.id, i + 1));
  });
  return rondas;
}

export interface GrupoMesa<C extends ComandaTablero> {
  clave: string;
  comandas: C[];
  /** La ronda más antigua aún pendiente: sobre ella actúa el botón principal. */
  pendiente: C | null;
}

/**
 * «Mesas» (agrupar): una tarjeta por cuenta con sus rondas apiladas. Solo
 * cuentas con algo vivo; dentro, por hora de envío. Las cuentas se ordenan
 * por su ronda pendiente más antigua.
 */
export function agruparPorMesa<C extends ComandaTablero>(comandas: C[], estacion: FiltroEstacion): GrupoMesa<C>[] {
  const grupos = new Map<string, C[]>();
  for (const c of comandas) {
    const col = columnaDe(c, estacion);
    if (!col) continue;
    const k = cuentaDe(c);
    grupos.set(k, [...(grupos.get(k) ?? []), c]);
  }
  const lista: GrupoMesa<C>[] = [];
  grupos.forEach((cs, clave) => {
    const ordenadas = [...cs].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const pendiente = ordenadas.find((c) => {
      const col = columnaDe(c, estacion);
      return col === 'new' || col === 'preparing' || col === 'ready';
    }) ?? null;
    if (!pendiente) return;
    lista.push({ clave, comandas: ordenadas, pendiente });
  });
  return lista.sort((a, b) => (a.pendiente?.created_at ?? '').localeCompare(b.pendiente?.created_at ?? ''));
}

// ─── Actualización optimista (la base manda; esto solo evita el parpadeo) ────

/** Estado de la comanda derivado de sus ítems vivos (mismo criterio que `fn_pos_cocina_estado_derivado`). */
export function estadoDerivado(items: ItemTablero[]): ColumnaComanda | null {
  const vivos = items.filter((i) => i.status !== 'cancelled');
  if (vivos.length === 0) return null;
  if (vivos.every((i) => i.status === 'delivered')) return 'delivered';
  if (vivos.every((i) => i.status === 'ready' || i.status === 'delivered')) return 'ready';
  if (vivos.every((i) => i.status === 'pending')) return 'new';
  return 'preparing';
}

const ESTADO_ITEM: Record<ColumnaComanda, string> = { new: 'pending', preparing: 'in_progress', ready: 'ready', delivered: 'delivered' };

export function aplicarEstadoLocal<C extends ComandaTablero>(c: C, estado: ColumnaComanda, estacion: string | null, ahoraIso: string): C {
  const items = (c.kitchen_ticket_items ?? []).map((i) => {
    if (i.status === 'cancelled') return i;
    if (estado !== 'delivered' && estacion && estacionDelItem(i) !== estacion) return i;
    if (estado === 'preparing' && i.status !== 'pending') return i;
    if (estado === 'ready' && !(i.status === 'pending' || i.status === 'in_progress')) return i;
    return { ...i, status: ESTADO_ITEM[estado] };
  });
  const derivado = estado === 'delivered' ? 'delivered' : estadoDerivado(items) ?? c.status;
  return {
    ...c,
    kitchen_ticket_items: items,
    status: derivado,
    ready_at: derivado === 'ready' ? c.ready_at ?? ahoraIso : derivado === 'delivered' ? c.ready_at ?? ahoraIso : null,
    updated_at: ahoraIso,
  };
}

export function aplicarItemLocal<C extends ComandaTablero>(c: C, itemId: number, hecho: boolean, ahoraIso: string): C {
  const items = (c.kitchen_ticket_items ?? []).map((i) =>
    i.id === itemId ? { ...i, status: hecho ? 'ready' : 'in_progress' } : i,
  );
  const derivado = estadoDerivado(items) ?? c.status;
  return { ...c, kitchen_ticket_items: items, status: derivado, ready_at: derivado === 'ready' ? c.ready_at ?? ahoraIso : null, updated_at: ahoraIso };
}

// ─── Transiciones: un paso a la vez (flecha, botón y arrastre) ───────────────

/** Paso siguiente del flujo: Nuevas → En preparación → Listas → Entregadas. */
export function siguienteColumna(columna: ColumnaComanda | null): ColumnaComanda | null {
  const i = columna ? COLUMNAS.indexOf(columna) : -1;
  return i >= 0 && i < COLUMNAS.length - 1 ? COLUMNAS[i + 1] : null;
}

/**
 * Paso atrás que el flujo actual admite: solo «En preparación» → «Nuevas»
 * (la misma «Devolver a Nuevas» del menú, que exige gestionar la cocina). La
 * base no tiene un camino de «Listas» a «En preparación», ni se des-entrega.
 */
export function columnaAnterior(columna: ColumnaComanda | null): ColumnaComanda | null {
  return columna === 'preparing' ? 'new' : null;
}

export type MotivoMovimiento = 'misma_columna' | 'un_paso' | 'sin_permiso' | 'no_arrastrable';

export type Movimiento =
  | { ok: true; sentido: 'avanzar' | 'retroceder'; estado: ColumnaComanda }
  | { ok: false; motivo: MotivoMovimiento };

/**
 * ¿Se puede mover la comanda de `desde` a `hacia`? Lo usan la flecha, el
 * botón principal y el soltar del arrastre, así que el tablero y la pantalla
 * de cocina deciden igual. `estado` es lo que se manda a `pos_cocina_cambiar_estado`.
 */
export function validarMovimiento(
  desde: ColumnaComanda | null,
  hacia: ColumnaComanda | null,
  permisos: { operar: boolean; gestionar: boolean },
): Movimiento {
  if (!desde || !hacia) return { ok: false, motivo: 'no_arrastrable' };
  if (desde === hacia) return { ok: false, motivo: 'misma_columna' };
  if (hacia === siguienteColumna(desde)) {
    return permisos.operar ? { ok: true, sentido: 'avanzar', estado: hacia } : { ok: false, motivo: 'sin_permiso' };
  }
  if (hacia === columnaAnterior(desde)) {
    return permisos.gestionar ? { ok: true, sentido: 'retroceder', estado: hacia } : { ok: false, motivo: 'sin_permiso' };
  }
  return { ok: false, motivo: 'un_paso' };
}

/**
 * ¿Se puede marcar o desmarcar este ítem a mano? Solo cuando la estación ya
 * empezó (`in_progress`) o para deshacer un «hecho» (`ready`). Un ítem
 * `pending` marcado como hecho saltaba de «Nuevas» a «Listas para servir» sin
 * pasar por «En preparación» (una comanda de una sola línea quedaba lista al
 * primer toque).
 */
export function puedeMarcarItem(item: Pick<ItemTablero, 'status' | 'cancelled_at'>): boolean {
  if (item.cancelled_at) return false;
  return item.status === 'in_progress' || item.status === 'ready';
}
