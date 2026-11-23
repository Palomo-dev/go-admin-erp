/**
 * «Por despachar»: la bandeja única de salida (Figma «21 Logística» 2794:3311, sin domiciliarios
 * 2795:4513, vacío 2795:5367). Puro: sin Supabase ni React.
 *
 * Qué decide: qué envío entra en la bandeja, cuándo está atrasado, los KPI, la búsqueda y los
 * filtros, qué acciones ofrece cada fila y el orden sugerido de la ruta al asignar. Qué NO decide:
 * las transiciones (las valida la base, `fn_logistica_transicion_valida`, copiada en
 * estadosEnvio.ts) ni el dinero (la contraentrega la calcula la base al crear el envío).
 */
import { toPlainDate, addPlainDays } from '@/lib/utils/dateCore';
import { estadoPromesa, type Promesa } from './misEnvios';
import { normalizarTexto } from './presentacionEnvio';
import { puedeAsignarse, transicionValida, type ModoDespacho } from './estadosEnvio';

/** Estados que entran en la bandeja (FASE1-CIMIENTOS, «Qué usará cada pantalla»). */
export const ESTADOS_POR_DESPACHAR = ['draft', 'pending', 'ready', 'ready_for_pickup', 'assigned', 'failed_attempt'] as const;

/** Canal que originó el envío (columna «Pedido»). */
export const CANALES_ENVIO = ['web', 'pos', 'qr', 'manual', 'marketplace'] as const;
export type CanalEnvio = (typeof CANALES_ENVIO)[number];

/** Estado que se muestra en la bandeja (columna «Estado», Figma 2794:3311). */
export type EstadoBandeja = 'por_asignar' | 'asignado' | 'listo_para_salir' | 'por_crear_guia' | 'intento_fallido';

/** Filtro de pago de la bandeja. */
export const FILTROS_PAGO = ['contraentrega', 'pagado'] as const;
export type FiltroPago = (typeof FILTROS_PAGO)[number];

/** Una fila de la bandeja, ya armada por el servicio con el envío, su pedido y su domiciliario. */
export interface FilaDespacho {
  id: string;
  numero: string;
  status: string;
  modo: ModoDespacho | string;
  branchId: number | null;
  canal: CanalEnvio;
  /** Número del pedido o de la venta que originó el envío. */
  pedido: string | null;
  /** id del pedido web (`source_id`) si el envío es de la tienda. */
  pedidoWebId: string | null;
  creado: string;
  cliente: string | null;
  telefono: string | null;
  direccion: string | null;
  ciudad: string | null;
  barrio: string | null;
  instrucciones: string | null;
  /** Hora prometida al cliente (timestamptz) o null. */
  promesa: string | null;
  /** Día de entrega esperado (`date`) cuando no hay hora prometida. */
  fechaEsperada: string | null;
  valor: number;
  moneda: string | null;
  contraentrega: number;
  codStatus: string | null;
  pagado: boolean;
  domiciliarioId: string | null;
  domiciliario: string | null;
  vehiculoId: string | null;
  asignado: string | null;
  intentosFallidos: number;
  motivoNovedad: string | null;
  codigoRequerido: boolean;
}

export function esCanalEnvio(v: unknown): v is CanalEnvio {
  return typeof v === 'string' && (CANALES_ENVIO as readonly string[]).includes(v);
}

/**
 * Canal del envío a partir de su origen. Pedido web de la carta QR → `qr`; resto de la tienda →
 * `web`; venta → `pos`; manual → `manual`. Los marketplaces llegan en la Fase 3.
 */
export function canalDeEnvio(sourceType: string | null | undefined, fuentePedido?: string | null): CanalEnvio {
  if (sourceType === 'sale' || sourceType === 'invoice_sale') return 'pos';
  if (sourceType === 'web_order') {
    const f = (fuentePedido ?? '').toLowerCase();
    if (f.includes('qr') || f === 'menu' || f === 'carta') return 'qr';
    if (f.includes('rappi') || f.includes('didi') || f.includes('marketplace')) return 'marketplace';
    return 'web';
  }
  return 'manual';
}

/** Estado de la bandeja: lo que la persona que despacha necesita saber de un vistazo. */
export function estadoBandeja(f: Pick<FilaDespacho, 'status' | 'modo' | 'domiciliarioId'>): EstadoBandeja {
  if (f.status === 'failed_attempt') return 'intento_fallido';
  if (f.modo === 'national_carrier') return 'por_crear_guia';
  if (f.status === 'ready_for_pickup' || f.status === 'ready') return 'listo_para_salir';
  if (f.status === 'assigned' || f.domiciliarioId) return 'asignado';
  return 'por_asignar';
}

/** Instante de la promesa: la hora prometida o, si solo hay día, el final de ese día en la zona. */
export function instantePromesa(f: Pick<FilaDespacho, 'promesa' | 'fechaEsperada'>): string | null {
  if (f.promesa) return f.promesa;
  return null;
}

/** Cuánto falta o cuánto va tarde frente a la promesa (misma regla que «Mis envíos»). */
export function promesaDe(f: Pick<FilaDespacho, 'promesa' | 'fechaEsperada'>, ahora: Date): Promesa | null {
  return estadoPromesa(instantePromesa(f), ahora);
}

/** Día de la promesa en la zona de la organización (para «hoy» y «mañana»). */
export function diaPromesa(f: Pick<FilaDespacho, 'promesa' | 'fechaEsperada' | 'creado'>, zona: string): string {
  if (f.promesa) return toPlainDate(new Date(f.promesa), zona);
  if (f.fechaEsperada) return f.fechaEsperada;
  return toPlainDate(new Date(f.creado), zona);
}

export interface KpisDespacho {
  porDespachar: number;
  paraHoy: number;
  paraManana: number;
  atrasados: number;
  contraentregaHoy: number;
  enviosContraentregaHoy: number;
  sinDomiciliario: number;
  /** De los que salen hoy, cuántos no tienen domiciliario (detalle del KPI). */
  sinDomiciliarioHoy: number;
  saleHoy: number;
}

const centavos = (v: number) => Math.round((Number(v) || 0) * 100);

/** Los cuatro KPI de la cabecera (Figma 2794:3311). Lo que está atrasado cuenta como «de hoy». */
export function kpisDespacho(filas: readonly FilaDespacho[], ahora: Date, zona: string): KpisDespacho {
  const hoy = toPlainDate(ahora, zona);
  const manana = addPlainDays(hoy, 1);
  let paraHoy = 0;
  let paraManana = 0;
  let atrasados = 0;
  let codHoy = 0;
  let enviosCod = 0;
  let sinDom = 0;
  let sinDomHoy = 0;
  for (const f of filas) {
    const dia = diaPromesa(f, zona);
    const tarde = promesaDe(f, ahora)?.tipo === 'tarde';
    const deHoy = dia <= hoy || tarde;
    if (deHoy) paraHoy += 1;
    else if (dia === manana) paraManana += 1;
    if (tarde) atrasados += 1;
    if (deHoy && f.contraentrega > 0 && f.codStatus !== 'collected' && f.codStatus !== 'remitted') {
      codHoy += centavos(f.contraentrega);
      enviosCod += 1;
    }
    if (!f.domiciliarioId && f.modo === 'own') {
      sinDom += 1;
      if (deHoy) sinDomHoy += 1;
    }
  }
  return {
    porDespachar: filas.length,
    paraHoy,
    paraManana,
    atrasados,
    contraentregaHoy: codHoy / 100,
    enviosContraentregaHoy: enviosCod,
    sinDomiciliario: sinDom,
    sinDomiciliarioHoy: sinDomHoy,
    saleHoy: paraHoy,
  };
}

export interface FiltrosDespacho {
  busqueda?: string;
  estado?: EstadoBandeja | null;
  pago?: FiltroPago | null;
  canal?: CanalEnvio | null;
  soloAtrasados?: boolean;
}

/** Busca en pedido, guía, cliente, teléfono, dirección y barrio (sin tildes ni mayúsculas). */
export function coincideBusqueda(f: FilaDespacho, termino: string): boolean {
  const t = normalizarTexto(termino);
  if (!t) return true;
  const digitos = termino.replace(/\D/g, '');
  const textos = [f.numero, f.pedido, f.cliente, f.direccion, f.barrio, f.ciudad, f.domiciliario];
  if (textos.some((s) => normalizarTexto(s).includes(t))) return true;
  return digitos.length >= 3 && (f.telefono ?? '').replace(/\D/g, '').includes(digitos);
}

export function filtrarDespacho(filas: readonly FilaDespacho[], filtros: FiltrosDespacho, ahora: Date): FilaDespacho[] {
  return filas.filter((f) => {
    if (filtros.busqueda && !coincideBusqueda(f, filtros.busqueda)) return false;
    if (filtros.estado && estadoBandeja(f) !== filtros.estado) return false;
    if (filtros.pago === 'contraentrega' && !(f.contraentrega > 0)) return false;
    if (filtros.pago === 'pagado' && !(f.contraentrega <= 0)) return false;
    if (filtros.canal && f.canal !== filtros.canal) return false;
    if (filtros.soloAtrasados && promesaDe(f, ahora)?.tipo !== 'tarde') return false;
    return true;
  });
}

/** Orden de la bandeja: lo atrasado y lo que vence primero, arriba; sin promesa, al final. */
export function ordenarDespacho(filas: readonly FilaDespacho[]): FilaDespacho[] {
  const clave = (f: FilaDespacho) => {
    const p = instantePromesa(f);
    const ms = p ? new Date(p).getTime() : NaN;
    return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
  };
  return [...filas].sort((a, b) => clave(a) - clave(b) || a.creado.localeCompare(b.creado));
}

/**
 * Orden sugerido de la ruta al asignar (Figma 2800:8231). Sin geocodificación en la Fase 1: por
 * hora prometida y, a igual promesa, por barrio, para que los vecinos vayan seguidos.
 */
export function ordenSugeridoRuta(filas: readonly FilaDespacho[]): FilaDespacho[] {
  const clave = (f: FilaDespacho) => {
    const p = instantePromesa(f);
    const ms = p ? new Date(p).getTime() : NaN;
    return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
  };
  return [...filas].sort(
    (a, b) => clave(a) - clave(b) || normalizarTexto(a.barrio).localeCompare(normalizarTexto(b.barrio)) || a.numero.localeCompare(b.numero),
  );
}

/** Motivo por el que una acción no aplica (se muestra en el menú, nunca un botón mudo). */
export type MotivoAccion =
  | 'estado_no_asignable'
  | 'no_es_propio'
  | 'requiere_tercero'
  | 'requiere_transportadora'
  | 'ya_listo'
  | 'sin_seleccion';

export interface AccionesFilaDespacho {
  asignar: { disponible: boolean; motivo?: MotivoAccion };
  listoParaSalir: { disponible: boolean; motivo?: MotivoAccion };
  cancelar: { disponible: boolean };
  /** Fase 3: última milla de terceros. Siempre deshabilitada con su motivo. */
  pedirRepartidor: { disponible: false; motivo: MotivoAccion };
  /** Fase 2: transportadora nacional. Siempre deshabilitada con su motivo. */
  crearGuia: { disponible: false; motivo: MotivoAccion };
}

export function accionesFilaDespacho(f: Pick<FilaDespacho, 'status' | 'modo'>): AccionesFilaDespacho {
  const propio = f.modo === 'own';
  const asignable = puedeAsignarse(f.status);
  return {
    asignar: propio ? (asignable ? { disponible: true } : { disponible: false, motivo: 'estado_no_asignable' }) : { disponible: false, motivo: 'no_es_propio' },
    listoParaSalir: transicionValida(f.status, 'ready_for_pickup')
      ? { disponible: true }
      : { disponible: false, motivo: f.status === 'ready_for_pickup' ? 'ya_listo' : 'estado_no_asignable' },
    cancelar: { disponible: transicionValida(f.status, 'cancelled') },
    pedirRepartidor: { disponible: false, motivo: 'requiere_tercero' },
    crearGuia: { disponible: false, motivo: 'requiere_transportadora' },
  };
}

export interface ResumenSeleccion {
  total: number;
  asignables: FilaDespacho[];
  noAsignables: FilaDespacho[];
  contraentrega: number;
  conContraentrega: number;
}

/** Lo que se lleva a la hoja «Asignar N envíos»: solo los asignables, con su contraentrega. */
export function resumenSeleccion(filas: readonly FilaDespacho[]): ResumenSeleccion {
  const asignables = filas.filter((f) => accionesFilaDespacho(f).asignar.disponible);
  const noAsignables = filas.filter((f) => !accionesFilaDespacho(f).asignar.disponible);
  let cod = 0;
  let con = 0;
  for (const f of asignables) {
    if (f.contraentrega > 0) {
      cod += centavos(f.contraentrega);
      con += 1;
    }
  }
  return { total: filas.length, asignables, noAsignables, contraentrega: cod / 100, conContraentrega: con };
}

/** Estado vacío de la bandeja: sin envíos, o con envíos pero sin domiciliarios registrados. */
export type AvisoBandeja = 'sin_domiciliarios' | null;

export function avisoBandeja(kpis: Pick<KpisDespacho, 'sinDomiciliario'>, domiciliariosActivos: number | null): AvisoBandeja {
  if (domiciliariosActivos === 0 && kpis.sinDomiciliario > 0) return 'sin_domiciliarios';
  return null;
}
