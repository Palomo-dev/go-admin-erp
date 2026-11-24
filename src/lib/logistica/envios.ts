/**
 * Logística › Envíos: el historial completo de envíos de todos los canales (Figma «21 Logística»,
 * sección 11 lista 2959:8043; sección 12 formulario 2963:8719, editar 2965:9202 y diálogos).
 * Puro: sin Supabase ni React.
 *
 * Qué decide: en qué pestaña cae cada envío, cómo se cobra (del PEDIDO, no de campos vacíos del
 * envío), los cuatro KPI, la búsqueda y los filtros, qué acciones ofrece cada fila y qué campos se
 * pueden editar según el estado. Qué NO decide: las transiciones (las valida la base,
 * `fn_logistica_transicion_valida`, copiada en estadosEnvio.ts), el costo del envío (lo calcula
 * `logistica_cotizar_envio`) ni la contraentrega de un pedido (la calcula la base al crear el envío).
 */
import { toPlainDate } from '@/lib/utils/dateCore';
import { coincideBusqueda, type FilaDespacho } from './despacho';
import { ESTADOS_ASIGNABLES, esEstadoEnvio, puedeAsignarse, transicionValida, type EstadoEnvio } from './estadosEnvio';

// ── Pestañas ────────────────────────────────────────────────────────────────────

export const PESTANAS_ENVIOS = ['todos', 'por_asignar', 'en_camino', 'con_novedad', 'entregados', 'devueltos', 'cancelados'] as const;
export type PestanaEnvios = (typeof PESTANAS_ENVIOS)[number];

export function esPestanaEnvios(v: unknown): v is PestanaEnvios {
  return typeof v === 'string' && (PESTANAS_ENVIOS as readonly string[]).includes(v);
}

/** Estados en los que el envío todavía no ha salido de la sede. */
export const ESTADOS_PREPARACION: readonly EstadoEnvio[] = ['draft', 'pending', 'ready', 'ready_for_pickup', 'assigned'];
/** Estados en los que el envío va en la calle (con su novedad incluida). */
export const ESTADOS_EN_CALLE: readonly EstadoEnvio[] = ['picked', 'dispatched', 'in_transit', 'out_for_delivery', 'failed_attempt'];
/** Estados finales: el envío ya no se mueve. `failed` es el heredado de «novedad». */
export const ESTADOS_CERRADOS: readonly EstadoEnvio[] = ['delivered', 'returned', 'cancelled', 'failed'];

/** Origen del envío que lo ata a un pedido (sus valores y su cobro salen del pedido). */
export type OrigenEnvio = 'web_order' | 'sale' | 'invoice_sale' | 'manual' | 'return' | 'transfer' | string;

/** Una fila de Envíos: la de la bandeja más lo que el historial necesita. */
export interface FilaEnvio extends FilaDespacho {
  sourceType: OrigenEnvio;
  sourceId: string | null;
  /** Guía de la transportadora (`tracking_number`), solo si no es domicilio propio. */
  guia: string | null;
  transportadora: string | null;
  transportadoraId: string | null;
  /** Tipo de vehículo del domiciliario (`driver_credentials.vehicle_type`). */
  vehiculoTipo: string | null;
  sede: string | null;
  zonaId: string | null;
  zona: string | null;
  /** Viaje de Transporte (metadata.trip_id) cuando sale en un viaje. */
  viajeId: string | null;
  /** Cuándo salió (`dispatched_at` o `picked_at`). */
  salio: string | null;
  entregado: string | null;
  actualizado: string | null;
  pesoKg: number | null;
  costoEnvio: number;
  /** Estado de pago del PEDIDO (web_orders / sales); en un envío manual, el del envío. */
  pagoPedido: string | null;
  /** El pedido o la venta que lo originó está anulado. */
  pedidoAnulado: boolean;
  /** Quién recibió (prueba de entrega), si se entregó. */
  recibio: string | null;
  recibioConFoto: boolean;
}

export function pestanaDeEnvio(f: Pick<FilaEnvio, 'status' | 'domiciliarioId' | 'modo'>): Exclude<PestanaEnvios, 'todos'> | null {
  switch (f.status) {
    case 'cancelled':
      return 'cancelados';
    case 'returned':
      return 'devueltos';
    case 'delivered':
      return 'entregados';
    case 'failed_attempt':
    case 'failed':
      return 'con_novedad';
    case 'picked':
    case 'dispatched':
    case 'in_transit':
    case 'out_for_delivery':
      return 'en_camino';
    default:
      return esEstadoEnvio(f.status) && ESTADOS_PREPARACION.includes(f.status) && !f.domiciliarioId && f.modo === 'own' ? 'por_asignar' : null;
  }
}

export function contarPestanas(filas: readonly FilaEnvio[]): Record<PestanaEnvios, number> {
  const c = Object.fromEntries(PESTANAS_ENVIOS.map((p) => [p, 0])) as Record<PestanaEnvios, number>;
  for (const f of filas) {
    c.todos += 1;
    const p = pestanaDeEnvio(f);
    if (p) c[p] += 1;
  }
  return c;
}

// ── Cobro ───────────────────────────────────────────────────────────────────────

export const COBROS_ENVIO = ['contraentrega', 'pagado', 'pendiente', 'sin_cobro'] as const;
export type CobroEnvio = (typeof COBROS_ENVIO)[number];

/**
 * Cómo se cobra el envío. La contraentrega la fija la base al crear el envío; «pagado» sale del
 * PEDIDO (web_orders / sales.payment_status), no del `payment_status` del envío, que en los
 * envíos de la tienda queda en «pending» aunque el pedido esté pagado.
 */
export function cobroDeEnvio(f: Pick<FilaEnvio, 'contraentrega' | 'codStatus' | 'status' | 'pagoPedido' | 'sourceId' | 'costoEnvio'>): CobroEnvio {
  if (f.contraentrega > 0) {
    if (f.codStatus === 'collected' || f.codStatus === 'remitted') return 'pagado';
    return f.status === 'cancelled' ? 'sin_cobro' : 'contraentrega';
  }
  if (f.pagoPedido === 'paid') return 'pagado';
  if (f.status === 'cancelled' || f.pagoPedido === 'refunded') return 'sin_cobro';
  // Un envío manual sin pedido: solo hay algo por cobrar si lleva costo de envío.
  if (!f.sourceId) return f.costoEnvio > 0 ? 'pendiente' : 'sin_cobro';
  return 'pendiente';
}

// ── KPI ─────────────────────────────────────────────────────────────────────────

export interface KpisEnvios {
  total: number;
  creadosHoy: number;
  entregados: number;
  /** Entregados sobre los que no se cancelaron (0–100) o null si no hay base. */
  pctEntregados: number | null;
  /** Entregados sin intentos fallidos sobre los entregados (0–100) o null. */
  pctPrimerIntento: number | null;
  enCamino: number;
  conNovedad: number;
  /** Motivo más frecuente de las novedades abiertas. */
  motivoNovedad: string | null;
  contraentregaPorCobrar: number;
  enviosContraentrega: number;
  domiciliariosContraentrega: number;
}

const centavos = (v: number) => Math.round((Number(v) || 0) * 100);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/** Los cuatro KPI de la cabecera (Figma 2959:8043), sobre los envíos del periodo. */
export function kpisEnvios(filas: readonly FilaEnvio[], hoy: string, zona: string): KpisEnvios {
  let creadosHoy = 0;
  let entregados = 0;
  let primerIntento = 0;
  let cancelados = 0;
  let enCamino = 0;
  let conNovedad = 0;
  let cod = 0;
  let enviosCod = 0;
  const domiciliarios = new Set<string>();
  const motivos = new Map<string, number>();
  for (const f of filas) {
    if (toPlainDate(new Date(f.creado), zona) === hoy) creadosHoy += 1;
    const p = pestanaDeEnvio(f);
    if (p === 'entregados') {
      entregados += 1;
      if (f.intentosFallidos === 0) primerIntento += 1;
    }
    if (p === 'cancelados') cancelados += 1;
    if (p === 'en_camino') enCamino += 1;
    if (p === 'con_novedad') {
      conNovedad += 1;
      if (f.motivoNovedad) motivos.set(f.motivoNovedad, (motivos.get(f.motivoNovedad) ?? 0) + 1);
    }
    if (cobroDeEnvio(f) === 'contraentrega' && p !== 'entregados' && p !== 'devueltos' && p !== 'cancelados') {
      cod += centavos(f.contraentrega);
      enviosCod += 1;
      if (f.domiciliarioId) domiciliarios.add(f.domiciliarioId);
    }
  }
  let motivoNovedad: string | null = null;
  let max = 0;
  for (const [m, n] of motivos) {
    if (n > max) {
      max = n;
      motivoNovedad = m;
    }
  }
  return {
    total: filas.length,
    creadosHoy,
    entregados,
    pctEntregados: pct(entregados, filas.length - cancelados),
    pctPrimerIntento: pct(primerIntento, entregados),
    enCamino,
    conNovedad,
    motivoNovedad,
    contraentregaPorCobrar: cod / 100,
    enviosContraentrega: enviosCod,
    domiciliariosContraentrega: domiciliarios.size,
  };
}

// ── Búsqueda y filtros ──────────────────────────────────────────────────────────

/** «Quién lo lleva»: sin asignar o un domiciliario. */
export const QUIEN_SIN_ASIGNAR = 'sin_asignar';

export interface FiltrosEnvios {
  busqueda?: string;
  pestana?: PestanaEnvios | null;
  canal?: string | null;
  cobro?: CobroEnvio | null;
  quien?: string | null;
  transportadora?: string | null;
  viaje?: string | null;
  zona?: string | null;
}

/** Busca por envío, pedido, guía, cliente, teléfono o dirección (sin tildes ni mayúsculas). */
export function coincideBusquedaEnvio(f: FilaEnvio, termino: string): boolean {
  if (coincideBusqueda(f, termino)) return true;
  const t = termino.trim().toLowerCase().replace(/\s+/g, '');
  return t.length > 0 && !!f.guia && f.guia.toLowerCase().replace(/\s+/g, '').includes(t);
}

export function filtrarEnvios(filas: readonly FilaEnvio[], filtros: FiltrosEnvios): FilaEnvio[] {
  return filas.filter((f) => {
    if (filtros.busqueda && !coincideBusquedaEnvio(f, filtros.busqueda)) return false;
    if (filtros.pestana && filtros.pestana !== 'todos' && pestanaDeEnvio(f) !== filtros.pestana) return false;
    if (filtros.canal && f.canal !== filtros.canal) return false;
    if (filtros.cobro && cobroDeEnvio(f) !== filtros.cobro) return false;
    if (filtros.quien === QUIEN_SIN_ASIGNAR && (f.domiciliarioId || f.transportadoraId)) return false;
    if (filtros.quien && filtros.quien !== QUIEN_SIN_ASIGNAR && f.domiciliarioId !== filtros.quien) return false;
    if (filtros.transportadora && f.transportadoraId !== filtros.transportadora) return false;
    if (filtros.viaje && f.viajeId !== filtros.viaje) return false;
    if (filtros.zona && f.zonaId !== filtros.zona) return false;
    return true;
  });
}

/** El historial va del más nuevo al más viejo. */
export function ordenarEnvios(filas: readonly FilaEnvio[]): FilaEnvio[] {
  return [...filas].sort((a, b) => b.creado.localeCompare(a.creado));
}

// ── Acciones por estado (Figma 2799:7510) ──────────────────────────────────────

/** Estados que se eligen en «Cambiar estado» (los demás tienen su propio diálogo o RPC). */
export const ESTADOS_CAMBIO_ESTADO = ['ready_for_pickup', 'picked', 'in_transit', 'out_for_delivery'] as const;
export type EstadoCambioEstado = (typeof ESTADOS_CAMBIO_ESTADO)[number];

export function estadosCambioDisponibles(status: string | null | undefined): EstadoCambioEstado[] {
  return ESTADOS_CAMBIO_ESTADO.filter((e) => transicionValida(status, e));
}

export interface AccionesFilaEnvio {
  editar: boolean;
  duplicar: boolean;
  imprimir: boolean;
  asignar: boolean;
  cambiarEstado: boolean;
  devolver: boolean;
  cancelar: boolean;
  /** Solo envíos manuales: el cobro de un pedido se registra en el pedido. */
  marcarPagado: boolean;
}

/** El menú ⋯ y la barra masiva muestran SOLO lo que permite el estado canónico. */
export function accionesFilaEnvio(f: Pick<FilaEnvio, 'status' | 'modo' | 'contraentrega' | 'codStatus' | 'pagoPedido' | 'sourceId' | 'costoEnvio'>): AccionesFilaEnvio {
  return {
    editar: true,
    duplicar: true,
    imprimir: true,
    asignar: f.modo === 'own' && puedeAsignarse(f.status),
    cambiarEstado: estadosCambioDisponibles(f.status).length > 0,
    devolver: transicionValida(f.status, 'returned'),
    cancelar: transicionValida(f.status, 'cancelled'),
    marcarPagado: !f.sourceId && cobroDeEnvio(f) === 'pendiente',
  };
}

export interface ParticionCambio<T> {
  pueden: T[];
  noPueden: T[];
}

/** «Solo pasan los que pueden»: separa los que admiten el estado nuevo de los que no. */
export function particionPorTransicion<T extends Pick<FilaEnvio, 'status'>>(filas: readonly T[], hacia: string): ParticionCambio<T> {
  const pueden: T[] = [];
  const noPueden: T[] = [];
  for (const f of filas) (transicionValida(f.status, hacia) ? pueden : noPueden).push(f);
  return { pueden, noPueden };
}

// ── Edición según el estado (Figma 2965:9202) ──────────────────────────────────

export const CAMPOS_ENVIO = [
  'pedido', 'sede', 'remitente', 'cliente', 'telefono', 'direccion', 'barrio', 'ciudad', 'indicaciones',
  'lineas', 'tipoPaquete', 'peso', 'valorDeclarado', 'fragil', 'firma',
  'modo', 'domiciliario', 'transportadora', 'guia', 'viaje', 'promesa', 'costo', 'seguro', 'contraentrega', 'notas',
] as const;
export type CampoEnvio = (typeof CAMPOS_ENVIO)[number];

export type EtapaEnvio = 'nuevo' | 'preparacion' | 'en_camino' | 'cerrado';

export function etapaDeEnvio(status: string | null | undefined): Exclude<EtapaEnvio, 'nuevo'> {
  if (esEstadoEnvio(status) && ESTADOS_CERRADOS.includes(status)) return 'cerrado';
  if (esEstadoEnvio(status) && ESTADOS_EN_CALLE.includes(status)) return 'en_camino';
  return 'preparacion';
}

/** Lo que trae el pedido vinculado no se edita aquí: se corrige en el pedido. */
const DEL_PEDIDO: readonly CampoEnvio[] = ['lineas', 'valorDeclarado', 'costo', 'seguro', 'contraentrega'];

/**
 * Campos que se pueden cambiar. En preparación, todo (menos lo que viene del pedido); en camino,
 * la promesa, las notas, el teléfono, las indicaciones, la guía y la contraentrega de un envío
 * manual; cerrado, solo las notas. El pedido vinculado solo se elige al crear.
 */
export function camposEditables(e: { status: string | null | undefined; vinculado: boolean; nuevo: boolean }): Set<CampoEnvio> {
  if (e.nuevo) return new Set(CAMPOS_ENVIO.filter((c) => !(e.vinculado && DEL_PEDIDO.includes(c))));
  const etapa = etapaDeEnvio(e.status);
  const editable = new Set<CampoEnvio>();
  if (etapa === 'preparacion') {
    for (const c of CAMPOS_ENVIO) if (c !== 'pedido' && !(e.vinculado && DEL_PEDIDO.includes(c))) editable.add(c);
  } else if (etapa === 'en_camino') {
    for (const c of ['telefono', 'indicaciones', 'promesa', 'notas', 'guia'] as const) editable.add(c);
    if (!e.vinculado) editable.add('contraentrega');
  } else {
    editable.add('notas');
  }
  // Asignar o cambiar domiciliario solo donde la RPC lo admite (también tras un intento fallido).
  if (esEstadoEnvio(e.status) && ESTADOS_ASIGNABLES.includes(e.status)) editable.add('domiciliario');
  else editable.delete('domiciliario');
  return editable;
}

// ── Formulario ─────────────────────────────────────────────────────────────────

export const TIPOS_PAQUETE = ['envelope', 'small_box', 'medium_box', 'large_box', 'pallet', 'other'] as const;
export type TipoPaquete = (typeof TIPOS_PAQUETE)[number];

/** Cómo sale: domiciliario propio, transportadora (guía) o en un viaje de Transporte (paradas). */
export const MODOS_ENTREGA = ['own', 'national_carrier', 'viaje'] as const;
export type ModoEntrega = (typeof MODOS_ENTREGA)[number];

export function modoEntregaDe(modo: string | null | undefined, viajeId: string | null | undefined): ModoEntrega {
  if (viajeId) return 'viaje';
  return modo === 'national_carrier' ? 'national_carrier' : 'own';
}

/** El modo de despacho que se guarda (`fulfillment_mode`): un viaje propio es domicilio propio. */
export function fulfillmentDeModo(modo: ModoEntrega): 'own' | 'national_carrier' {
  return modo === 'national_carrier' ? 'national_carrier' : 'own';
}

export interface LineaPaquete {
  clave: string;
  /** shipment_items.id si ya existe. */
  id?: string | null;
  descripcion: string;
  cantidad: number;
  pesoKg: number | null;
  valor: number | null;
}

/** Peso total sugerido: la suma de las líneas (se puede corregir al pesar). */
export function pesoDeLineas(lineas: readonly LineaPaquete[]): number | null {
  let total = 0;
  let alguno = false;
  for (const l of lineas) {
    if (l.pesoKg != null && Number.isFinite(l.pesoKg)) {
      total += l.pesoKg * Math.max(1, Number(l.cantidad) || 1);
      alguno = true;
    }
  }
  return alguno ? Math.round(total * 1000) / 1000 : null;
}

/** Valor declarado sugerido: la suma de los valores de las líneas. */
export function valorDeLineas(lineas: readonly LineaPaquete[]): number | null {
  let total = 0;
  let alguno = false;
  for (const l of lineas) {
    if (l.valor != null && Number.isFinite(l.valor)) {
      total += l.valor;
      alguno = true;
    }
  }
  return alguno ? total : null;
}

export interface DatosFormularioEnvio {
  pedidoWebId: string | null;
  sedeId: number | null;
  remitente: string;
  telefonoRemitente: string;
  clienteId: string | null;
  destinatario: string;
  telefono: string;
  direccion: string;
  barrio: string;
  ciudad: string;
  indicaciones: string;
  lineas: LineaPaquete[];
  tipoPaquete: TipoPaquete;
  pesoKg: number | null;
  valorDeclarado: number | null;
  fragil: boolean;
  firma: boolean;
  modo: ModoEntrega;
  domiciliarioId: string | null;
  transportadoraId: string | null;
  guia: string;
  viajeId: string | null;
  paradaOrigenId: string | null;
  paradaDestinoId: string | null;
  promesa: string | null;
  costoEnvio: number | null;
  seguro: number | null;
  cobrarContraentrega: boolean;
  contraentrega: number | null;
  notas: string;
}

export type FaltanteEnvio = 'sede' | 'destinatario' | 'telefono' | 'direccion' | 'ciudad' | 'transportadora' | 'viaje' | 'contraentrega' | null;

/** Lo mínimo para guardar. Con pedido vinculado, el destino sale del pedido. */
export function faltanteFormulario(d: DatosFormularioEnvio): FaltanteEnvio {
  if (!d.sedeId) return 'sede';
  if (!d.pedidoWebId) {
    if (d.destinatario.trim().length < 2) return 'destinatario';
    if (d.telefono.replace(/\D/g, '').length < 7) return 'telefono';
    if (d.direccion.trim().length < 4) return 'direccion';
    if (d.ciudad.trim().length < 2) return 'ciudad';
  }
  if (d.modo === 'national_carrier' && !d.transportadoraId) return 'transportadora';
  if (d.modo === 'viaje' && !d.viajeId) return 'viaje';
  if (!d.pedidoWebId && d.cobrarContraentrega && !(Number(d.contraentrega) > 0)) return 'contraentrega';
  return null;
}
