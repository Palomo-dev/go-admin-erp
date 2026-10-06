/**
 * Cuenta de una mesa (Figma «POS — Mesas: flujo completo de atención», D3–D9 y
 * T2–T6): reglas puras para pintarla. Sin Supabase ni React, para Jest.
 *
 * - La cuenta se agrupa en «Por enviar» (líneas nuevas que la cocina aún no
 *   tiene: `sale_items.notes.por_enviar`) y en rondas (`notes.ronda`, que pone
 *   `pos_mesa_enviar_ronda`; las líneas de antes de las rondas toman el número
 *   del orden de su comanda).
 * - El estado de cocina de cada línea sale de sus ítems de comanda (no de un
 *   reloj del navegador): en cocina, preparando, lista, servida o cancelada.
 * - Nada se cobra aquí: los importes son los de la línea guardada (regla única
 *   de `fn_pos_recalcular_venta`); las partes de una cuenta dividida se cobran
 *   por MONTO y el saldo lo decide el servidor.
 */

import { repartirPartesIguales } from '@/lib/pos/mesas/cuentaDividida';

export type EstadoCocinaMesa = 'por_enviar' | 'en_cocina' | 'preparando' | 'lista' | 'servida' | 'cancelada' | 'sin_cocina';

export interface ModificadorMesa {
  name: string;
  extraPrice?: number | null;
  groupName?: string | null;
}

/** Línea de `sale_items` tal como llega de la base (con su producto y sus ítems de comanda). */
export interface LineaGuardadaMesa {
  id: string;
  sale_id: string;
  product_id: number | null;
  quantity: number | string;
  unit_price: number | string;
  total: number | string;
  tax_amount?: number | string | null;
  tax_rate?: number | string | null;
  tax_included?: boolean | null;
  discount_amount?: number | string | null;
  paid_at?: string | null;
  paid_amount?: number | string | null;
  created_at?: string | null;
  notes?: Record<string, unknown> | string | null;
  product?: {
    id?: number;
    name?: string | null;
    variant_data?: Record<string, string> | null;
    product_images?: Array<{ storage_path: string; is_primary?: boolean | null; display_order?: number | null }> | null;
  } | null;
  kitchen_ticket_items?: Array<{
    id: number;
    status: string;
    kitchen_ticket_id?: number | null;
    cancelled_at?: string | null;
    adjustment_kind?: string | null;
  }> | null;
}

/** Comanda de la mesa (solo lo que se pinta). */
export interface ComandaMesa {
  id: number;
  created_at: string;
  updated_at?: string | null;
  status: string;
  ticket_type?: string | null;
  round_key?: string | null;
}

export interface LineaMesa {
  id: string;
  nombre: string;
  variante: string | null;
  cantidad: number;
  precioUnitario: number;
  total: number;
  impuesto: number;
  tasaImpuesto: number;
  impuestoIncluido: boolean;
  descuento: number;
  comensal: number | null;
  notaCocina: string | null;
  notaCliente: string | null;
  alergia: boolean;
  modificadores: ModificadorMesa[];
  pagada: boolean;
  abonado: number;
  ronda: number | null;
  porEnviar: boolean;
  enviadaAt: string | null;
  estado: EstadoCocinaMesa;
  /** Instante desde el que corre el tiempo del estado (envío de la ronda). */
  estadoDesde: string | null;
  imagen: string | null;
  creadaAt: string | null;
  productoId: number | null;
  /** Comanda (pedido) en la que salió la línea. */
  comandaId: number | null;
}

export type EstadoRonda = 'en_cocina' | 'preparando' | 'lista' | 'servida';

export interface RondaMesa {
  numero: number;
  estado: EstadoRonda;
  enviadaAt: string | null;
  /** Hora en que quedó servida (la última comanda entregada). */
  servidaAt: string | null;
  lineas: LineaMesa[];
}

export interface CuentaAgrupada {
  porEnviar: LineaMesa[];
  /** De la más reciente a la más antigua, como en el Figma (Ronda 2 arriba de Ronda 1). */
  rondas: RondaMesa[];
  /** Líneas que no pasan por cocina ni tienen ronda (bebida embotellada de antes de las rondas). */
  directas: LineaMesa[];
  pagadas: LineaMesa[];
  /** Líneas con algo en cocina sin entregar («3 en cocina»). */
  enCocina: number;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

export function notasDeLinea(notes: LineaGuardadaMesa['notes']): Record<string, unknown> {
  if (!notes) return {};
  if (typeof notes === 'string') {
    try {
      const v = JSON.parse(notes);
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return notes;
}

/** «Talla 40 · Negro» a partir de `variant_data`. */
export function textoVariante(variante: Record<string, string> | null | undefined): string | null {
  if (!variante) return null;
  const partes = Object.values(variante).filter((v) => typeof v === 'string' && v.trim() !== '');
  return partes.length > 0 ? partes.join(' · ') : null;
}

const ESTADO_ITEM: Record<string, EstadoCocinaMesa> = {
  pending: 'en_cocina',
  in_progress: 'preparando',
  ready: 'lista',
  delivered: 'servida',
  cancelled: 'cancelada',
};

/** Estado de cocina de la línea a partir de sus ítems de comanda (los de pedido mandan sobre los ajustes). */
export function estadoCocinaDeItems(items: LineaGuardadaMesa['kitchen_ticket_items']): EstadoCocinaMesa | null {
  const vivos = (items ?? []).filter((i) => !i.adjustment_kind || i.adjustment_kind === 'increase');
  if (vivos.length === 0) return null;
  const estados: EstadoCocinaMesa[] = vivos.map((i) => (i.cancelled_at ? 'cancelada' : ESTADO_ITEM[i.status] ?? 'en_cocina'));
  const activos: EstadoCocinaMesa[] = estados.filter((e) => e !== 'cancelada');
  if (activos.length === 0) return 'cancelada';
  // El menos avanzado manda: si un ítem sigue en cocina, la línea sigue en cocina.
  const orden: EstadoCocinaMesa[] = ['en_cocina', 'preparando', 'lista', 'servida'];
  return orden.find((e) => activos.includes(e)) ?? 'servida';
}

/** URL pública de la imagen principal (la arma la pantalla con su cliente de almacenamiento). */
export type ResolverImagen = (storagePath: string) => string | null;

export function aLineaMesa(
  l: LineaGuardadaMesa,
  comandas: readonly ComandaMesa[],
  resolverImagen?: ResolverImagen,
): LineaMesa {
  const n = notasDeLinea(l.notes);
  const items = l.kitchen_ticket_items ?? [];
  const ticketDe = items.find((i) => i.kitchen_ticket_id != null)?.kitchen_ticket_id ?? null;
  const pedidos = [...comandas]
    .filter((c) => (c.ticket_type ?? 'order') === 'order')
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
  const comanda = ticketDe != null ? comandas.find((c) => c.id === ticketDe) ?? null : null;
  const rondaNota = n.ronda != null && Number.isFinite(Number(n.ronda)) ? Number(n.ronda) : null;
  const rondaComanda = comanda ? pedidos.findIndex((c) => c.id === comanda.id) + 1 || null : null;
  const porEnviar = n.por_enviar === true && !l.paid_at;
  const estadoItems = estadoCocinaDeItems(items);
  const estado: EstadoCocinaMesa = porEnviar ? 'por_enviar' : estadoItems ?? 'sin_cocina';
  const enviadaAt = texto(n.enviada_at) ?? comanda?.created_at ?? null;
  const imagenes = l.product?.product_images ?? [];
  const principal = imagenes.find((i) => i.is_primary) ?? imagenes[0];
  const modificadores = Array.isArray(n.modifiers)
    ? (n.modifiers as Array<Record<string, unknown>>)
        .filter((m) => texto(m?.name))
        .map((m) => ({ name: String(m.name), extraPrice: num(m.extraPrice), groupName: texto(m.groupName) }))
    : [];
  return {
    id: l.id,
    nombre: texto(n.product_name) ?? l.product?.name ?? '',
    variante: textoVariante(l.product?.variant_data ?? null),
    cantidad: num(l.quantity),
    precioUnitario: num(l.unit_price),
    total: num(l.total),
    impuesto: num(l.tax_amount),
    tasaImpuesto: num(l.tax_rate),
    impuestoIncluido: l.tax_included !== false,
    descuento: num(l.discount_amount),
    comensal: n.guest_number != null && num(n.guest_number) > 0 ? num(n.guest_number) : null,
    notaCocina: texto(n.extra),
    notaCliente: texto(n.customer_note),
    alergia: n.is_allergy === true && !!texto(n.extra),
    modificadores,
    pagada: !!l.paid_at,
    abonado: Math.max(0, num(l.paid_amount)),
    ronda: porEnviar ? null : rondaNota ?? rondaComanda,
    porEnviar,
    enviadaAt: porEnviar ? null : enviadaAt,
    estado,
    estadoDesde: porEnviar ? null : enviadaAt,
    imagen: principal && resolverImagen ? resolverImagen(principal.storage_path) : null,
    creadaAt: l.created_at ?? null,
    productoId: l.product_id,
    comandaId: ticketDe,
  };
}

function estadoDeRonda(lineas: LineaMesa[]): EstadoRonda {
  const conCocina = lineas.filter((l) => l.estado !== 'sin_cocina' && l.estado !== 'cancelada');
  if (conCocina.length === 0) return 'servida';
  if (conCocina.every((l) => l.estado === 'servida')) return 'servida';
  if (conCocina.every((l) => l.estado === 'lista' || l.estado === 'servida')) return 'lista';
  if (conCocina.some((l) => l.estado === 'preparando')) return 'preparando';
  return 'en_cocina';
}

export function agruparCuenta(lineas: readonly LineaMesa[], comandas: readonly ComandaMesa[] = []): CuentaAgrupada {
  const vivas = lineas.filter((l) => l.cantidad > 0);
  const pagadas = vivas.filter((l) => l.pagada);
  const pendientes = vivas.filter((l) => !l.pagada);
  const porEnviar = pendientes.filter((l) => l.porEnviar);
  const conRonda = pendientes.filter((l) => !l.porEnviar && l.ronda != null);
  const directas = pendientes.filter((l) => !l.porEnviar && l.ronda == null);
  const porNumero = new Map<number, LineaMesa[]>();
  for (const l of conRonda) {
    const lista = porNumero.get(l.ronda as number) ?? [];
    lista.push(l);
    porNumero.set(l.ronda as number, lista);
  }
  const rondas: RondaMesa[] = Array.from(porNumero.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([numero, ls]) => {
      const estado = estadoDeRonda(ls);
      const enviadas = ls.map((l) => l.enviadaAt).filter((v): v is string => !!v).sort();
      const ids = new Set(ls.map((l) => l.comandaId).filter((v): v is number => v != null));
      const servidaAt =
        estado === 'servida'
          ? comandas
              .filter((c) => ids.has(c.id) && c.status === 'delivered')
              .map((c) => c.updated_at ?? c.created_at)
              .sort()
              .pop() ?? null
          : null;
      return { numero, estado, enviadaAt: enviadas[0] ?? null, servidaAt, lineas: ls };
    });
  const enCocina = pendientes.filter((l) => l.estado === 'en_cocina' || l.estado === 'preparando' || l.estado === 'lista').length;
  return { porEnviar, rondas, directas, pagadas, enCocina };
}

export interface ImpuestoAgrupado {
  tasa: number;
  importe: number;
}

export interface TotalesCuenta {
  subtotal: number;
  impuestos: ImpuestoAgrupado[];
  descuento: number;
  total: number;
  /** Lo ya abonado por partes a líneas que siguen sin pagar. */
  abonado: number;
  /** Lo que falta por cobrar (total − abonado). */
  saldo: number;
}

/** Totales de lo que falta por pagar (las líneas pagadas ya no cuentan). */
export function totalesCuenta(lineas: readonly LineaMesa[]): TotalesCuenta {
  const pendientes = lineas.filter((l) => !l.pagada && l.cantidad > 0);
  const r = (n: number) => Math.round(n * 100) / 100;
  let total = 0;
  let impuesto = 0;
  let descuento = 0;
  let abonado = 0;
  const porTasa = new Map<number, number>();
  for (const l of pendientes) {
    total += l.total;
    impuesto += l.impuesto;
    descuento += l.descuento;
    abonado += Math.min(l.abonado, l.total);
    if (l.impuesto > 0) porTasa.set(l.tasaImpuesto, (porTasa.get(l.tasaImpuesto) ?? 0) + l.impuesto);
  }
  const impuestos = Array.from(porTasa.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([tasa, importe]) => ({ tasa, importe: r(importe) }));
  return {
    subtotal: r(total - impuesto),
    impuestos,
    descuento: r(descuento),
    total: r(total),
    abonado: r(abonado),
    saldo: r(Math.max(0, total - abonado)),
  };
}

/** Minutos enteros entre un instante y ahora (nunca negativos). */
export function minutosDesde(desde: string | null | undefined, ahora: Date = new Date()): number | null {
  if (!desde) return null;
  const t = new Date(desde).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((ahora.getTime() - t) / 60000));
}

/** «8 min», «1 h 00», «26 h» (como el plano del Figma). */
export function textoDuracion(minutos: number | null): string {
  if (minutos == null) return '';
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h >= 24) return `${h} h`;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

/** Umbral por defecto de «mesa abierta sin movimiento» (S7): 4 h, como recomienda el diseño. */
export const UMBRAL_MESA_ABANDONADA_MIN = 240;

export function mesaAbandonada(abiertaDesde: string | null | undefined, ultimoMovimiento: string | null | undefined, ahora: Date = new Date(), umbral = UMBRAL_MESA_ABANDONADA_MIN): boolean {
  const ref = ultimoMovimiento ?? abiertaDesde;
  const m = minutosDesde(ref, ahora);
  return m != null && m >= umbral;
}

// ── Cuenta dividida (D8, T6, D8b) ─────────────────────────────────────────────

export type ModoDivision = 'comensal' | 'productos' | 'iguales';

export interface ParteMesa {
  id: string;
  /** «Comensal 1», «Parte 2». */
  nombre: string;
  /** Comensal de la parte (modo comensal). */
  comensal: number | null;
  /** Líneas con su cantidad en la parte (para mostrar y para «por productos»). */
  lineas: Array<{ lineaId: string; nombre: string; cantidad: number; importe: number }>;
  /** Fracción de lo general («+ 1/4 de lo general»). */
  fraccionGeneral: number;
  importe: number;
}

function redondear(valor: number, decimales: number): number {
  const f = 10 ** Math.max(0, decimales);
  return Math.round((valor + Number.EPSILON) * f) / f;
}

/**
 * Partes por comensal: cada línea va a su comensal; lo «General» (sin comensal)
 * se reparte en partes iguales entre los comensales. Sobre lo que falta por
 * pagar: el abono previo se descuenta de forma proporcional. La última parte
 * absorbe el redondeo para que la suma sea exactamente el saldo.
 */
export function partesPorComensal(lineas: readonly LineaMesa[], comensales: number, decimales = 0): ParteMesa[] {
  const pendientes = lineas.filter((l) => !l.pagada && l.cantidad > 0);
  const n = Math.max(1, Math.trunc(comensales), ...pendientes.map((l) => l.comensal ?? 0));
  const saldo = pendientes.reduce((s, l) => s + Math.max(0, l.total - Math.min(l.abonado, l.total)), 0);
  const general = pendientes.filter((l) => !l.comensal);
  const totalGeneral = general.reduce((s, l) => s + (l.total - Math.min(l.abonado, l.total)), 0);
  const partes: ParteMesa[] = [];
  for (let c = 1; c <= n; c += 1) {
    const propias = pendientes.filter((l) => l.comensal === c);
    const importePropio = propias.reduce((s, l) => s + (l.total - Math.min(l.abonado, l.total)), 0);
    partes.push({
      id: `comensal-${c}`,
      nombre: String(c),
      comensal: c,
      lineas: propias.map((l) => ({ lineaId: l.id, nombre: l.nombre, cantidad: l.cantidad, importe: l.total })),
      fraccionGeneral: general.length > 0 ? 1 / n : 0,
      importe: importePropio + totalGeneral / n,
    });
  }
  return cuadrar(partes, saldo, decimales);
}

/** Partes iguales por MONTO (sin repartir platos). */
export function partesIguales(lineas: readonly LineaMesa[], partes: number, decimales = 0): ParteMesa[] {
  const saldo = totalesCuenta(lineas).saldo;
  return repartirPartesIguales(saldo, Math.max(1, Math.trunc(partes)), decimales).map((importe, i) => ({
    id: `parte-${i + 1}`,
    nombre: String(i + 1),
    comensal: null,
    lineas: [],
    fraccionGeneral: 1 / Math.max(1, Math.trunc(partes)),
    importe,
  }));
}

/**
 * Por productos: la persona asigna unidades de cada línea a cada parte
 * (`asignacion[lineaId][parte] = unidades`). Una línea puede partirse en
 * unidades; el importe de la unidad es el total de la línea / su cantidad.
 */
export function partesPorProductos(
  lineas: readonly LineaMesa[],
  asignacion: Record<string, number[]>,
  partes: number,
  decimales = 0,
): ParteMesa[] {
  const pendientes = lineas.filter((l) => !l.pagada && l.cantidad > 0);
  const n = Math.max(1, Math.trunc(partes));
  const resultado: ParteMesa[] = Array.from({ length: n }, (_, i) => ({
    id: `parte-${i + 1}`,
    nombre: String(i + 1),
    comensal: null,
    lineas: [],
    fraccionGeneral: 0,
    importe: 0,
  }));
  for (const l of pendientes) {
    const porParte = asignacion[l.id] ?? [];
    const unitario = l.cantidad > 0 ? (l.total - Math.min(l.abonado, l.total)) / l.cantidad : 0;
    porParte.slice(0, n).forEach((unidades, i) => {
      const u = Math.max(0, Math.min(unidades || 0, l.cantidad));
      if (u <= 0) return;
      resultado[i].lineas.push({ lineaId: l.id, nombre: l.nombre, cantidad: u, importe: unitario * u });
      resultado[i].importe += unitario * u;
    });
  }
  return resultado.map((p) => ({ ...p, importe: redondear(p.importe, decimales) }));
}

/** Unidades de cada línea que aún no tienen parte (por productos). */
export function unidadesSinAsignar(lineas: readonly LineaMesa[], asignacion: Record<string, number[]>): number {
  return lineas
    .filter((l) => !l.pagada && l.cantidad > 0)
    .reduce((s, l) => s + Math.max(0, l.cantidad - (asignacion[l.id] ?? []).reduce((a, b) => a + (b || 0), 0)), 0);
}

function cuadrar(partes: ParteMesa[], saldo: number, decimales: number): ParteMesa[] {
  if (partes.length === 0) return partes;
  const redondeadas = partes.map((p) => ({ ...p, importe: redondear(p.importe, decimales) }));
  const suma = redondeadas.slice(0, -1).reduce((s, p) => s + p.importe, 0);
  const ultima = redondeadas[redondeadas.length - 1];
  ultima.importe = redondear(Math.max(0, redondear(saldo, decimales) - suma), decimales);
  return redondeadas;
}

/** Estado de una parte en «Cobrar por partes» (D8b). */
export type EstadoParte = 'pendiente' | 'cobrando' | 'pagada';

export interface ParteCobro extends ParteMesa {
  estado: EstadoParte;
  /** «Pagado con Tarjeta · 20:41». */
  pagadaCon?: string | null;
  pagadaAt?: string | null;
}

/** Lo que muestra el pie de «Cobrar por partes»: total de la mesa, pagado y falta. */
export function resumenPartes(partes: readonly ParteCobro[]): { total: number; pagado: number; falta: number } {
  const total = partes.reduce((s, p) => s + p.importe, 0);
  const pagado = partes.filter((p) => p.estado === 'pagada').reduce((s, p) => s + p.importe, 0);
  return { total, pagado, falta: Math.max(0, total - pagado) };
}

/** Une las partes pendientes en una sola (D8b «Unir partes pendientes»). */
export function unirPendientes(partes: readonly ParteCobro[], nombre: string): ParteCobro[] {
  const pendientes = partes.filter((p) => p.estado !== 'pagada');
  if (pendientes.length < 2) return [...partes];
  const unida: ParteCobro = {
    id: `unida-${pendientes.map((p) => p.id).join('-')}`,
    nombre,
    comensal: null,
    lineas: pendientes.flatMap((p) => p.lineas),
    fraccionGeneral: pendientes.reduce((s, p) => s + p.fraccionGeneral, 0),
    importe: pendientes.reduce((s, p) => s + p.importe, 0),
    estado: 'pendiente',
  };
  return [...partes.filter((p) => p.estado === 'pagada'), unida];
}

// ── Nota de la mesa (D6) ───────────────────────────────────────────────────────

export type RitmoSalida = 'junto' | 'tiempos' | 'aviso';

export interface NotaMesa {
  alergias: string[];
  instrucciones: string;
  ritmo: RitmoSalida;
  notaCliente: string;
}

export const NOTA_MESA_VACIA: NotaMesa = { alergias: [], instrucciones: '', ritmo: 'junto', notaCliente: '' };

export function leerNotaMesa(valor: unknown): NotaMesa {
  if (!valor || typeof valor !== 'object') return { ...NOTA_MESA_VACIA };
  const v = valor as Record<string, unknown>;
  const ritmo = v.ritmo === 'tiempos' || v.ritmo === 'aviso' ? v.ritmo : 'junto';
  return {
    alergias: Array.isArray(v.alergias) ? v.alergias.filter((a): a is string => typeof a === 'string' && a.trim() !== '').map((a) => a.trim()) : [],
    instrucciones: typeof v.instrucciones === 'string' ? v.instrucciones : '',
    ritmo,
    notaCliente: typeof v.nota_cliente === 'string' ? v.nota_cliente : '',
  };
}

export function escribirNotaMesa(nota: NotaMesa): Record<string, unknown> {
  const limpio = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max);
  return {
    alergias: Array.from(new Set(nota.alergias.map((a) => limpio(a, 40)).filter(Boolean))).slice(0, 12),
    instrucciones: limpio(nota.instrucciones, 300),
    ritmo: nota.ritmo,
    nota_cliente: limpio(nota.notaCliente, 200),
  };
}

/** Resumen de la fila de la nota: «4 comensales · Entradas primero · Cumpleaños». */
export function hayNotaMesa(nota: NotaMesa): boolean {
  return nota.alergias.length > 0 || nota.instrucciones.trim() !== '' || nota.notaCliente.trim() !== '' || nota.ritmo !== 'junto';
}
