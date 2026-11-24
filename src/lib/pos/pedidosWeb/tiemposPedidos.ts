/**
 * Tiempos de los pedidos online (Figma pág. «10 Configuración», sección 3011:35924; T1–T5):
 * cuánto tarda un pedido en estar listo («Listo aprox.») y en llegar («Entrega aprox.») según el
 * tipo de entrega y la sede. Módulo puro: sin React ni Supabase. Lo usan la pestaña
 * Configuración › Punto de venta › Pedidos online, el diálogo de confirmar (lista y detalle) y la
 * confirmación automática del servidor (`webOrderServerConfirmation`).
 *
 * Se guarda en `organization_settings` con la clave `pedidos_online_tiempos` (una fila jsonb por
 * organización, sin migración):
 *
 *   {
 *     por_tipo: { domicilio: { alistar, entrega }, transportadora: { alistar, entrega }, recoger: { alistar } },
 *     por_sede: { "<branch_id>": { domicilio?: {...}, transportadora?: {...}, recoger?: {...} } },
 *     usar_en_confirmacion_automatica: boolean,
 *     contar_desde_apertura: boolean
 *   }
 *
 * Cada tiempo es `{ valor, unidad }` con unidad `minutos | horas | dias`.
 *
 * Resolución de cada tiempo: sede → tipo (general) → fábrica.
 *
 * VALORES DE FÁBRICA = LOS DE HOY, exactos (nada cambia hasta que el negocio los edite):
 * - el diálogo de confirmar de Pedidos online (lista y detalle) arranca con
 *   `isRetail ? 1 día : 30 min` de preparación y `isRetail ? 5 días : 30 min` de traslado, con
 *   `isRetail = (organizations.type_id ?? 3) === 3`. Es la vertical `comercio` / `restaurante`
 *   de aquí (`restaurante` = cualquier tipo distinto de comercio, igual que el diálogo).
 * - la confirmación automática del servidor tiene sus propios números (restaurante 30/60 min,
 *   el resto 1 día y 5 días o los días de tránsito de la tarifa): esos NO salen de aquí. El
 *   servidor solo usa este módulo cuando el negocio enciende «Usar estos tiempos al confirmarse
 *   solo»; si no, sigue con su lógica de siempre.
 */
import { turnosDelDia, esHorarioPorDefecto, DIAS_SEMANA, type DiaSemana } from '@/lib/organizacion/horarioSede';
import { addPlainDays, toPlainDate, wallTimeToInstant } from '@/lib/utils/dateCore';

export const CLAVE_TIEMPOS_PEDIDOS = 'pedidos_online_tiempos';

export const UNIDADES_TIEMPO = ['minutos', 'horas', 'dias'] as const;
export type UnidadTiempo = (typeof UNIDADES_TIEMPO)[number];

export interface Tiempo {
  valor: number;
  unidad: UnidadTiempo;
}

export const TIPOS_TIEMPO = ['domicilio', 'transportadora', 'recoger'] as const;
export type TipoTiempo = (typeof TIPOS_TIEMPO)[number];

/** Tiempos de un tipo tal como se guardan (cada campo puede faltar: se resuelve hacia arriba). */
export interface TiemposDeTipo {
  alistar?: Tiempo;
  /** No aplica a «Recoger en la tienda». */
  entrega?: Tiempo;
}

/** Tiempos de un tipo ya resueltos. `entrega` es null en «Recoger en la tienda». */
export interface TiemposResueltos {
  alistar: Tiempo;
  entrega: Tiempo | null;
}

export type TiemposPorTipo = Partial<Record<TipoTiempo, TiemposDeTipo>>;

export interface AjustesTiemposPedidos {
  por_tipo: TiemposPorTipo;
  por_sede: Record<string, TiemposPorTipo>;
  usar_en_confirmacion_automatica: boolean;
  contar_desde_apertura: boolean;
}

export type VerticalTiempos = 'comercio' | 'restaurante';

/** Tope de cada número (999 días ya es absurdo; evita que un error de tecleo rompa una fecha). */
export const VALOR_MAXIMO = 999;

/** Misma regla que el diálogo de confirmar: `isRetail = (type_id ?? 3) === 3`. */
export function verticalDeTipo(typeId: number | null | undefined): VerticalTiempos {
  return (typeId ?? 3) === 3 ? 'comercio' : 'restaurante';
}

const DIA: Tiempo = { valor: 1, unidad: 'dias' };
const CINCO_DIAS: Tiempo = { valor: 5, unidad: 'dias' };
const MEDIA_HORA: Tiempo = { valor: 30, unidad: 'minutos' };

/** Valores de fábrica por vertical (los de hoy del diálogo de confirmar). */
export function tiemposDeFabrica(vertical: VerticalTiempos): Record<TipoTiempo, TiemposResueltos> {
  if (vertical === 'comercio') {
    return {
      domicilio: { alistar: { ...DIA }, entrega: { ...CINCO_DIAS } },
      transportadora: { alistar: { ...DIA }, entrega: { ...CINCO_DIAS } },
      recoger: { alistar: { ...DIA }, entrega: null },
    };
  }
  return {
    domicilio: { alistar: { ...MEDIA_HORA }, entrega: { ...MEDIA_HORA } },
    transportadora: { alistar: { ...MEDIA_HORA }, entrega: { ...MEDIA_HORA } },
    recoger: { alistar: { ...MEDIA_HORA }, entrega: null },
  };
}

export const AJUSTES_TIEMPOS_VACIOS: AjustesTiemposPedidos = {
  por_tipo: {},
  por_sede: {},
  usar_en_confirmacion_automatica: false,
  contar_desde_apertura: false,
};

// ── Lectura tolerante ────────────────────────────────────────────────────────

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Un tiempo válido o null. Entero entre `minimo` y `VALOR_MAXIMO`; acepta números en texto
 * («30») y la unidad en inglés (`minutes`/`hours`/`days`), como la usa el diálogo.
 */
export function leerTiempo(raw: unknown, minimo = 0): Tiempo | null {
  if (!esObjeto(raw)) return null;
  const n = typeof raw.valor === 'string' && raw.valor.trim() !== '' ? Number(raw.valor) : raw.valor;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const valor = Math.round(n);
  if (valor < minimo || valor > VALOR_MAXIMO) return null;
  const u = typeof raw.unidad === 'string' ? raw.unidad.trim().toLowerCase() : '';
  const unidad = ({ minutos: 'minutos', minutes: 'minutos', horas: 'horas', hours: 'horas', dias: 'dias', días: 'dias', days: 'dias' } as Record<string, UnidadTiempo>)[u];
  return unidad ? { valor, unidad } : null;
}

function leerTipo(raw: unknown, tipo: TipoTiempo): TiemposDeTipo | null {
  if (!esObjeto(raw)) return null;
  const alistar = leerTiempo(raw.alistar, 1);
  const entrega = tipo === 'recoger' ? null : leerTiempo(raw.entrega, 0);
  if (!alistar && !entrega) return null;
  return { ...(alistar ? { alistar } : {}), ...(entrega ? { entrega } : {}) };
}

function leerPorTipo(raw: unknown): TiemposPorTipo {
  const salida: TiemposPorTipo = {};
  if (!esObjeto(raw)) return salida;
  for (const tipo of TIPOS_TIEMPO) {
    const t = leerTipo(raw[tipo], tipo);
    if (t) salida[tipo] = t;
  }
  return salida;
}

/** `organization_settings.settings` → ajustes saneados. Basura → lo que se pueda rescatar. */
export function normalizarAjustesTiempos(raw: unknown): AjustesTiemposPedidos {
  if (!esObjeto(raw)) return { ...AJUSTES_TIEMPOS_VACIOS, por_tipo: {}, por_sede: {} };
  const por_sede: Record<string, TiemposPorTipo> = {};
  if (esObjeto(raw.por_sede)) {
    for (const [clave, valor] of Object.entries(raw.por_sede)) {
      if (!/^[1-9]\d{0,9}$/.test(clave)) continue;
      const t = leerPorTipo(valor);
      if (Object.keys(t).length > 0) por_sede[clave] = t;
    }
  }
  return {
    por_tipo: leerPorTipo(raw.por_tipo),
    por_sede,
    usar_en_confirmacion_automatica: raw.usar_en_confirmacion_automatica === true,
    contar_desde_apertura: raw.contar_desde_apertura === true,
  };
}

// ── Resolución ───────────────────────────────────────────────────────────────

/** `web_orders.delivery_type` → tipo de esta configuración. Comer aquí y lo desconocido = recoger. */
export function tipoDeEntrega(deliveryType: string | null | undefined): TipoTiempo {
  if (deliveryType === 'delivery_own') return 'domicilio';
  if (deliveryType === 'delivery_third_party') return 'transportadora';
  return 'recoger';
}

export interface ResultadoTiempos extends TiemposResueltos {
  tipo: TipoTiempo;
  /** De dónde salió el tiempo de alistar (la entrega puede venir de un nivel más arriba). */
  origen: 'sede' | 'general' | 'fabrica';
}

export interface ContextoTiempos {
  sedeId?: number | string | null;
  deliveryType: string | null | undefined;
  vertical: VerticalTiempos;
}

/** Tiempos generales completos (lo guardado por tipo; lo que falte, de fábrica). */
export function tiemposGenerales(ajustes: AjustesTiemposPedidos | null, vertical: VerticalTiempos): Record<TipoTiempo, TiemposResueltos> {
  const fabrica = tiemposDeFabrica(vertical);
  const salida = {} as Record<TipoTiempo, TiemposResueltos>;
  for (const tipo of TIPOS_TIEMPO) {
    const g = ajustes?.por_tipo[tipo];
    salida[tipo] = {
      alistar: g?.alistar ?? fabrica[tipo].alistar,
      entrega: tipo === 'recoger' ? null : g?.entrega ?? fabrica[tipo].entrega,
    };
  }
  return salida;
}

/** Tiempos completos de una sede (sus propios; lo que falte, de los generales). */
export function tiemposDeSede(
  ajustes: AjustesTiemposPedidos | null,
  sedeId: number | string,
  vertical: VerticalTiempos,
): Record<TipoTiempo, TiemposResueltos> {
  const generales = tiemposGenerales(ajustes, vertical);
  const propios = ajustes?.por_sede[String(sedeId)];
  if (!propios) return generales;
  const salida = {} as Record<TipoTiempo, TiemposResueltos>;
  for (const tipo of TIPOS_TIEMPO) {
    salida[tipo] = {
      alistar: propios[tipo]?.alistar ?? generales[tipo].alistar,
      entrega: tipo === 'recoger' ? null : propios[tipo]?.entrega ?? generales[tipo].entrega,
    };
  }
  return salida;
}

/** ¿La sede tiene tiempos propios guardados? (insignia «Propios»). */
export function sedeTienePropios(ajustes: AjustesTiemposPedidos | null, sedeId: number | string): boolean {
  return Object.keys(ajustes?.por_sede[String(sedeId)] ?? {}).length > 0;
}

/** Sede → tipo → general → fábrica. Con `ajustes = null` (sin fila) da los valores de fábrica. */
export function resolverTiempos(ajustes: AjustesTiemposPedidos | null, ctx: ContextoTiempos): ResultadoTiempos {
  const tipo = tipoDeEntrega(ctx.deliveryType);
  const fabrica = tiemposDeFabrica(ctx.vertical)[tipo];
  const sede = ctx.sedeId !== null && ctx.sedeId !== undefined ? ajustes?.por_sede[String(ctx.sedeId)]?.[tipo] : undefined;
  const general = ajustes?.por_tipo[tipo];
  const alistar = sede?.alistar ?? general?.alistar ?? fabrica.alistar;
  const entrega = tipo === 'recoger' ? null : sede?.entrega ?? general?.entrega ?? fabrica.entrega;
  const origen = sede?.alistar ? 'sede' : general?.alistar ? 'general' : 'fabrica';
  return { tipo, alistar: { ...alistar }, entrega: entrega ? { ...entrega } : null, origen };
}

// ── Cálculo ──────────────────────────────────────────────────────────────────

const MINUTOS_POR_UNIDAD: Record<UnidadTiempo, number> = { minutos: 1, horas: 60, dias: 24 * 60 };

export function aMinutos(t: Tiempo): number {
  return t.valor * MINUTOS_POR_UNIDAD[t.unidad];
}

export function aMs(t: Tiempo): number {
  return aMinutos(t) * 60_000;
}

/** Unidad del diálogo de confirmar (`EstimatedTime` de `[id]/components/ConfirmOrderDialog`). */
export type UnidadDialogo = 'minutes' | 'hours' | 'days';
const A_DIALOGO: Record<UnidadTiempo, UnidadDialogo> = { minutos: 'minutes', horas: 'hours', dias: 'days' };

export function aTiempoDialogo(t: Tiempo): { value: number; unit: UnidadDialogo } {
  return { value: t.valor, unit: A_DIALOGO[t.unidad] };
}

// ── «Si llega con la tienda cerrada, contar desde la apertura» ─────────────

function diaSemana(plain: string): DiaSemana {
  const [a, m, d] = plain.split('-').map(Number);
  // getUTCDay: 0 = domingo. DIAS_SEMANA empieza en lunes.
  const n = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return DIAS_SEMANA[(n + 6) % 7];
}

function minutosDe(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Horario legible de la sede para contar desde la apertura: un objeto con al menos un turno y
 * que NO sea el horario por defecto del formulario (sin revisar; el sitio tampoco calcula
 * «Abierto ahora» con él). Si no, null: el interruptor se ignora.
 */
export function horarioLegible(horario: unknown): Record<string, unknown> | null {
  if (!esObjeto(horario) || esHorarioPorDefecto(horario)) return null;
  return DIAS_SEMANA.some((d) => turnosDelDia(horario[d]).length > 0) ? horario : null;
}

/**
 * Próxima apertura de la sede si AHORA está cerrada; null si está abierta, si el horario no se
 * puede leer o si no abre en la próxima semana (en todos esos casos se cuenta desde ahora).
 * Las horas son de pared en la zona de la sede (`wallTimeToInstant`, con DST).
 */
export function proximaApertura(horario: unknown, zona: string, ahora: Date): Date | null {
  const h = horarioLegible(horario);
  if (!h) return null;
  const hoy = toPlainDate(ahora, zona);
  const ayer = addPlainDays(hoy, -1);
  const minutoAhora = (() => {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ahora);
    const v = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
    return v('hour') * 60 + v('minute');
  })();

  // ¿Abierta ahora? Un turno de hoy que ya empezó y no ha cerrado, o uno de ayer que cruza la medianoche.
  for (const t of turnosDelDia(h[diaSemana(hoy)])) {
    const abre = minutosDe(t.open);
    const cierra = minutosDe(t.close);
    if (cierra > abre ? minutoAhora >= abre && minutoAhora < cierra : minutoAhora >= abre) return null;
  }
  for (const t of turnosDelDia(h[diaSemana(ayer)])) {
    if (minutosDe(t.close) < minutosDe(t.open) && minutoAhora < minutosDe(t.close)) return null;
  }

  // Cerrada: la primera apertura posterior a ahora en los próximos 7 días.
  for (let i = 0; i <= 7; i++) {
    const dia = addPlainDays(hoy, i);
    const aperturas = turnosDelDia(h[diaSemana(dia)])
      .map((t) => wallTimeToInstant(dia, t.open, zona))
      .filter((d) => d.getTime() > ahora.getTime())
      .sort((a, b) => a.getTime() - b.getTime());
    if (aperturas.length > 0) return aperturas[0];
  }
  return null;
}

// ── Confirmación automática ──────────────────────────────────────────────────

export interface EntradaConfirmacionAutomatica {
  ajustes: AjustesTiemposPedidos;
  sedeId: number | null | undefined;
  deliveryType: string | null | undefined;
  vertical: VerticalTiempos;
  ahora: Date;
  /** `shipping_rates.estimated_transit_days` de la tarifa del pedido (solo cuenta en transportadora). */
  diasTransitoTarifa?: number | null;
  /** `branches.opening_hours` y la zona de la sede (para «contar desde la apertura»). */
  horarioSede?: unknown;
  zonaSede?: string | null;
}

export interface TiemposConfirmacionAutomatica {
  /** Minutos de preparación para la comanda. */
  prepMin: number;
  /** Desde cuándo se cuenta (ahora, o la próxima apertura de la sede). */
  inicio: Date;
  estimatedReadyAt: Date;
  /** Solo domicilio y transportadora. */
  estimatedDeliveryAt: Date | null;
  /** La entrega salió de la tarifa (transportadora con días de tránsito). */
  entregaDeTarifa: boolean;
}

/**
 * Tiempos de un pedido que se confirma solo, cuando el negocio encendió
 * `usar_en_confirmacion_automatica`. Con el interruptor apagado devuelve null y el servidor
 * sigue con su lógica de siempre (no sale de aquí).
 *
 * - Listo = inicio + alistar. Entrega = listo + entrega (como el diálogo de confirmar).
 * - Transportadora: si la tarifa trae días de tránsito, manda la tarifa (como hoy); el valor
 *   configurado es el respaldo.
 * - «Contar desde la apertura»: solo con horario legible de la sede; si no, desde ahora.
 */
export function tiemposConfirmacionAutomatica(e: EntradaConfirmacionAutomatica): TiemposConfirmacionAutomatica | null {
  if (!e.ajustes.usar_en_confirmacion_automatica) return null;
  const r = resolverTiempos(e.ajustes, { sedeId: e.sedeId, deliveryType: e.deliveryType, vertical: e.vertical });
  let inicio = e.ahora;
  if (e.ajustes.contar_desde_apertura && e.zonaSede) {
    const apertura = proximaApertura(e.horarioSede, e.zonaSede, e.ahora);
    if (apertura) inicio = apertura;
  }
  const prepMin = aMinutos(r.alistar);
  const listo = new Date(inicio.getTime() + prepMin * 60_000);
  const tarifa = r.tipo === 'transportadora' && typeof e.diasTransitoTarifa === 'number' && e.diasTransitoTarifa > 0 ? e.diasTransitoTarifa : null;
  let entrega: Date | null = null;
  if (r.tipo !== 'recoger') {
    const minutosEntrega = tarifa !== null ? tarifa * 24 * 60 : r.entrega ? aMinutos(r.entrega) : 0;
    entrega = new Date(listo.getTime() + minutosEntrega * 60_000);
  }
  return { prepMin, inicio, estimatedReadyAt: listo, estimatedDeliveryAt: entrega, entregaDeTarifa: tarifa !== null };
}
