/**
 * «Mis envíos»: la app del domiciliario en el celular (logística Fase 1). Puro.
 *
 * Aquí vive todo lo que la pantalla calcula: en qué pestaña va cada envío, el resumen de la ruta,
 * cuál es el siguiente paso, la promesa de hora, los enlaces de llamar / WhatsApp / cómo llegar,
 * el cambio del efectivo, las horas para reprogramar y el resumen del fin de jornada.
 *
 * La base manda (RPC `logistica_*`, docs/logistica/FASE1-CIMIENTOS.md): esto solo decide qué botón
 * se ofrece; la transición la valida `fn_logistica_transicion_valida` (copiada en estadosEnvio.ts).
 *
 * El código de entrega NUNCA pasa por aquí: el domiciliario lo pide al cliente y lo escribe.
 */
import { addPlainDays, toPlainDate } from '@/lib/utils/dateCore';
import { transicionValida, type EstadoEnvio, type MotivoNovedad } from './estadosEnvio';
import type { MedioCobroContraentrega } from './contraentrega';

/** Lo que la app necesita de un envío (subconjunto de `shipments` + lo que se le pega). */
export interface EnvioDomiciliario {
  id: string;
  shipment_number: string;
  status: EstadoEnvio | string;
  source_type?: string | null;
  source_id?: string | null;
  branch_id?: number | null;
  delivery_address?: string | null;
  delivery_city?: string | null;
  delivery_contact_name?: string | null;
  delivery_contact_phone?: string | null;
  delivery_instructions?: string | null;
  delivery_latitude?: number | string | null;
  delivery_longitude?: number | string | null;
  expected_delivery_date?: string | null;
  assigned_at?: string | null;
  picked_at?: string | null;
  dispatched_at?: string | null;
  delivered_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  cod_amount?: number | string | null;
  cod_status?: 'pending' | 'collected' | 'remitted' | null | string;
  cod_collected_amount?: number | string | null;
  cod_collected_method?: MedioCobroContraentrega | string | null;
  cod_collected_at?: string | null;
  delivery_code_required?: boolean | null;
  failed_attempts?: number | null;
  exception_reason?: MotivoNovedad | string | null;
  shipping_fee?: number | string | null;
  payment_status?: string | null;
  /** `web_orders.estimated_delivery_at` del pedido (timestamptz), si es de la tienda. */
  promesa?: string | null;
}

const n = (v: unknown) => Number(v) || 0;
const centavos = (v: unknown) => Math.round(n(v) * 100);

/** Estados en los que el envío está en la ruta del día (sin entregar ni cerrar). */
export const ESTADOS_EN_RUTA: readonly string[] = [
  'assigned', 'ready', 'ready_for_pickup', 'picked', 'dispatched', 'in_transit', 'out_for_delivery',
];
/** Estados en los que el domiciliario ya tiene el paquete encima. */
export const ESTADOS_CON_PAQUETE: readonly string[] = ['picked', 'dispatched', 'in_transit', 'out_for_delivery'];

export type PestanaMisEnvios = 'pendientes' | 'entregados' | 'novedades';

/** ¿Un intento fallido vuelve hoy a la ruta? (reprogramado para hoy o antes, o sin fecha). */
function reintentoDeHoy(e: EnvioDomiciliario, hoy: string): boolean {
  return e.status === 'failed_attempt' && (!e.expected_delivery_date || e.expected_delivery_date <= hoy);
}

/**
 * Pestaña de cada envío. `hoy` es el día de la organización y `zona` la de la sede (el día de un
 * `delivered_at` es el de SU sede).
 * - pendientes: en ruta, y los intentos fallidos reprogramados para hoy (el 2.º intento);
 * - entregados: entregados hoy;
 * - novedades: intentos fallidos para otro día y devueltos hoy.
 * Lo demás (entregado otro día, cancelado) no se muestra.
 */
export function pestanaDeEnvio(e: EnvioDomiciliario, hoy: string, zona: string): PestanaMisEnvios | null {
  if (ESTADOS_EN_RUTA.includes(String(e.status)) || reintentoDeHoy(e, hoy)) return 'pendientes';
  if (e.status === 'delivered') return diaEn(e.delivered_at, zona) === hoy ? 'entregados' : null;
  if (e.status === 'failed_attempt') return 'novedades';
  if (e.status === 'returned') return diaEn(e.updated_at, zona) === hoy ? 'novedades' : null;
  return null;
}

function diaEn(instante: string | null | undefined, zona: string): string {
  if (!instante) return '';
  const d = new Date(instante);
  return isNaN(d.getTime()) ? '' : toPlainDate(d, zona);
}

/** Orden de las paradas: primero lo que va en camino, luego por fecha prometida y asignación. */
export function ordenarParadas<T extends EnvioDomiciliario>(envios: readonly T[]): T[] {
  const peso = (e: EnvioDomiciliario) =>
    e.status === 'out_for_delivery' ? 0 : ESTADOS_CON_PAQUETE.includes(String(e.status)) ? 1 : e.status === 'failed_attempt' ? 3 : 2;
  const clave = (e: EnvioDomiciliario) => e.promesa ?? e.expected_delivery_date ?? e.assigned_at ?? e.created_at ?? '';
  return [...envios].sort((a, b) => peso(a) - peso(b) || clave(a).localeCompare(clave(b)) || a.shipment_number.localeCompare(b.shipment_number));
}

export interface GruposMisEnvios<T> {
  pendientes: T[];
  entregados: T[];
  novedades: T[];
}

export function agruparMisEnvios<T extends EnvioDomiciliario>(
  envios: readonly T[],
  hoy: string,
  zonaDe: (e: T) => string,
): GruposMisEnvios<T> {
  const g: GruposMisEnvios<T> = { pendientes: [], entregados: [], novedades: [] };
  for (const e of envios) {
    const p = pestanaDeEnvio(e, hoy, zonaDe(e));
    if (p) g[p].push(e);
  }
  return {
    pendientes: ordenarParadas(g.pendientes),
    entregados: [...g.entregados].sort((a, b) => (b.delivered_at ?? '').localeCompare(a.delivered_at ?? '')),
    novedades: ordenarParadas(g.novedades),
  };
}

/** ¿Falta cobrar la contraentrega de este envío? */
export function porCobrar(e: EnvioDomiciliario): number {
  return n(e.cod_amount) > 0 && (e.cod_status ?? 'pending') === 'pending' ? n(e.cod_amount) : 0;
}

export type EstadoRuta = 'sin_salir' | 'en_ruta' | 'terminada' | 'vacia';

export interface ResumenRuta {
  estado: EstadoRuta;
  /** Parada actual (1-based) y total del día (pendientes + entregados). */
  parada: number;
  totalParadas: number;
  porEntregar: number;
  entregados: number;
  aCobrar: number;
  /** Efectivo cobrado y aún sin entregar en caja. */
  enMano: number;
}

export function resumenRuta(g: GruposMisEnvios<EnvioDomiciliario>, todos: readonly EnvioDomiciliario[]): ResumenRuta {
  const porEntregar = g.pendientes.length;
  const entregados = g.entregados.length;
  const totalParadas = porEntregar + entregados;
  const aCobrar = g.pendientes.reduce((s, e) => s + centavos(porCobrar(e)), 0) / 100;
  const enMano =
    todos
      .filter((e) => e.cod_status === 'collected' && e.cod_collected_method === 'cash')
      .reduce((s, e) => s + centavos(e.cod_collected_amount), 0) / 100;
  const conPaquete = g.pendientes.some((e) => ESTADOS_CON_PAQUETE.includes(String(e.status)));
  const estado: EstadoRuta =
    totalParadas === 0 ? 'vacia' : porEntregar === 0 ? 'terminada' : conPaquete || entregados > 0 ? 'en_ruta' : 'sin_salir';
  return { estado, parada: Math.min(entregados + 1, Math.max(totalParadas, 1)), totalParadas, porEntregar, entregados, aCobrar, enMano };
}

/** Siguiente paso del domiciliario sobre un envío (el botón grande de la parada). */
export type PasoDomiciliario = 'recoger' | 'en_camino' | 'entregar' | 'reintentar' | null;

export function siguientePaso(estado: string | null | undefined): PasoDomiciliario {
  switch (estado) {
    case 'assigned':
    case 'ready':
    case 'ready_for_pickup':
      return transicionValida(estado, 'picked') ? 'recoger' : null;
    case 'picked':
    case 'dispatched':
    case 'in_transit':
      return transicionValida(estado, 'out_for_delivery') ? 'en_camino' : null;
    case 'out_for_delivery':
      return 'entregar';
    case 'failed_attempt':
      return transicionValida(estado, 'out_for_delivery') ? 'reintentar' : null;
    default:
      return null;
  }
}

/** Estado al que lleva cada paso que es un simple cambio de estado. */
export function estadoDelPaso(paso: PasoDomiciliario): 'picked' | 'out_for_delivery' | null {
  if (paso === 'recoger') return 'picked';
  if (paso === 'en_camino' || paso === 'reintentar') return 'out_for_delivery';
  return null;
}

/** «No se pudo entregar» solo cuando ya salió con el paquete (o en el reintento). */
export function puedeReportarNovedad(estado: string | null | undefined): boolean {
  return ['picked', 'dispatched', 'in_transit', 'out_for_delivery', 'failed_attempt'].includes(String(estado));
}

/** Estado del pedido web que confirma el aviso al cliente tras cada RPC (`aviso` de la base). */
export function estadoPedidoDelAviso(aviso: string | null | undefined): 'in_delivery' | 'delivered' | null {
  if (aviso === 'en_camino') return 'in_delivery';
  if (aviso === 'entregado') return 'delivered';
  return null;
}

export type Promesa =
  | { tipo: 'tarde'; minutos: number }
  | { tipo: 'pronto'; minutos: number }
  | { tipo: 'a_tiempo'; minutos: number };

/** Cuánto falta (o cuánto va tarde) frente a la hora prometida. «Pronto» = 15 minutos o menos. */
export function estadoPromesa(prometido: string | null | undefined, ahora: Date): Promesa | null {
  if (!prometido) return null;
  const p = new Date(prometido).getTime();
  if (isNaN(p)) return null;
  const minutos = Math.round((p - ahora.getTime()) / 60000);
  if (minutos < 0) return { tipo: 'tarde', minutos: -minutos };
  return { tipo: minutos <= 15 ? 'pronto' : 'a_tiempo', minutos };
}

// ── Contacto ────────────────────────────────────────────────────────────────

/** `tel:` con solo dígitos y el «+» inicial. */
export function enlaceLlamar(telefono: string | null | undefined): string | null {
  const t = (telefono ?? '').trim();
  const digitos = t.replace(/\D/g, '');
  if (digitos.length < 7) return null;
  return `tel:${t.startsWith('+') ? '+' : ''}${digitos}`;
}

/** `https://wa.me/<número internacional>`; el número ya normalizado (telefonoWhatsApp). */
export function enlaceWhatsApp(numeroInternacional: string | null | undefined, texto?: string): string | null {
  const digitos = (numeroInternacional ?? '').replace(/\D/g, '');
  if (digitos.length < 7) return null;
  return `https://wa.me/${digitos}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

function coordenadas(e: Pick<EnvioDomiciliario, 'delivery_latitude' | 'delivery_longitude'>): { lat: number; lng: number } | null {
  if (e.delivery_latitude == null || e.delivery_longitude == null || e.delivery_latitude === '' || e.delivery_longitude === '') return null;
  const lat = Number(e.delivery_latitude);
  const lng = Number(e.delivery_longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** «Cómo llegar» en Google Maps: por coordenadas si las hay; si no, por la dirección escrita. */
export function enlaceComoLlegar(e: Pick<EnvioDomiciliario, 'delivery_latitude' | 'delivery_longitude' | 'delivery_address' | 'delivery_city'>): string | null {
  const c = coordenadas(e);
  if (c) return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`;
  const texto = [e.delivery_address, e.delivery_city].map((s) => (s ?? '').trim()).filter(Boolean).join(', ');
  return texto ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(texto)}` : null;
}

/** Waze, solo con coordenadas (con texto libre Waze adivina mal en Colombia). */
export function enlaceWaze(e: Pick<EnvioDomiciliario, 'delivery_latitude' | 'delivery_longitude'>): string | null {
  const c = coordenadas(e);
  return c ? `https://waze.com/ul?ll=${c.lat},${c.lng}&navigate=yes` : null;
}

// ── Entregar: efectivo y cambio ─────────────────────────────────────────────

/** Cambio a devolver (null si el efectivo no alcanza o no es un número). */
export function cambioADevolver(total: number, recibido: number): number | null {
  if (!Number.isFinite(recibido) || recibido < 0) return null;
  const c = centavos(recibido) - centavos(total);
  return c < 0 ? null : c / 100;
}

/**
 * Billetes con que suele pagar el cliente: «Exacto» y el total redondeado hacia arriba a
 * 10.000, 50.000 y 100.000 (sin repetir y siempre mayores que el total). 128.900 → 130.000,
 * 150.000, 200.000. Montos pequeños redondean también a 1.000 y 5.000.
 */
export function montosRapidos(total: number): number[] {
  const t = Math.max(0, n(total));
  if (t <= 0) return [];
  const pasos = t < 20000 ? [1000, 5000, 10000, 50000] : [10000, 50000, 100000];
  const salida: number[] = [];
  for (const p of pasos) {
    const arriba = Math.ceil(t / p) * p;
    const valor = arriba === t ? arriba + p : arriba;
    if (valor > t && !salida.includes(valor)) salida.push(valor);
  }
  return salida.slice(0, 3);
}

/** Quién recibió: los valores del CHECK `proof_of_delivery_recipient_relationship_check`. */
export const RELACIONES_RECEPTOR = ['customer', 'family', 'doorman', 'other'] as const;
export type RelacionReceptor = (typeof RELACIONES_RECEPTOR)[number];

/** Dónde quedó (CHECK `proof_of_delivery_delivery_location_type_check`): portería → lobby. */
export function lugarDeEntrega(relacion: RelacionReceptor): 'door' | 'lobby' {
  return relacion === 'doorman' ? 'lobby' : 'door';
}

export const MEDIOS_COBRO_APP = ['cash', 'card', 'transfer'] as const satisfies readonly MedioCobroContraentrega[];
export type MedioCobroApp = (typeof MEDIOS_COBRO_APP)[number];

export type PruebaEntrega = 'codigo' | 'foto' | 'firma';

export interface FormularioEntrega {
  codigoRequerido: boolean;
  codigo: string;
  prueba: PruebaEntrega;
  fotos: number;
  firma: boolean;
  receptor: string;
  totalCobrar: number;
  medio: MedioCobroApp | null;
  recibidoEfectivo: number | null;
  aprobacion: string;
  comprobante: boolean;
}

export type ErrorEntrega =
  | 'codigo'
  | 'foto_o_firma'
  | 'receptor'
  | 'medio'
  | 'efectivo_insuficiente'
  | 'aprobacion'
  | 'comprobante';

/**
 * Lo que falta para confirmar la entrega, en el orden de la pantalla. Con contraentrega el código
 * es obligatorio (la base lo exige) y la foto, opcional; sin código hay que dejar foto o firma.
 * Cobro: efectivo que alcance, número de aprobación del datáfono, foto del comprobante de la
 * transferencia.
 */
export function faltanteEntrega(f: FormularioEntrega): ErrorEntrega | null {
  if (f.codigoRequerido) {
    if (!/^[0-9]{4}$/.test(f.codigo)) return 'codigo';
  } else if (f.prueba === 'firma' ? !f.firma : f.fotos === 0) {
    return 'foto_o_firma';
  }
  if (!f.receptor.trim()) return 'receptor';
  if (f.totalCobrar > 0) {
    if (!f.medio) return 'medio';
    if (f.medio === 'cash' && cambioADevolver(f.totalCobrar, f.recibidoEfectivo ?? NaN) === null) return 'efectivo_insuficiente';
    if (f.medio === 'card' && !f.aprobacion.trim()) return 'aprobacion';
    if (f.medio === 'transfer' && !f.comprobante) return 'comprobante';
  }
  return null;
}

/** Nota de la prueba de entrega con los datos del cobro que no tienen columna propia. */
export function notaEntrega(p: { medio: MedioCobroApp | null; recibidoEfectivo: number | null; cambio: number | null; aprobacion: string; etiquetas: { efectivo: string; cambio: string; aprobacion: string } }): string | null {
  if (p.medio === 'cash' && p.recibidoEfectivo != null) {
    return `${p.etiquetas.efectivo}: ${p.recibidoEfectivo}${p.cambio ? ` · ${p.etiquetas.cambio}: ${p.cambio}` : ''}`;
  }
  if (p.medio === 'card' && p.aprobacion.trim()) return `${p.etiquetas.aprobacion}: ${p.aprobacion.trim()}`;
  return null;
}

// ── No se pudo entregar ─────────────────────────────────────────────────────

/** Los motivos que ofrece la app (los demás de MOTIVOS_NOVEDAD los registra la tienda). */
export const MOTIVOS_APP = ['not_home', 'wrong_address', 'rejected', 'other'] as const satisfies readonly MotivoNovedad[];
export type MotivoApp = (typeof MOTIVOS_APP)[number];

export type PlanReintento =
  | { tipo: 'hoy'; hora: number }
  | { tipo: 'manana' }
  | { tipo: 'devolver' };

/** Hora local (0-23) de `ahora` en la zona dada. */
export function horaEnZona(ahora: Date, zona: string): number {
  const h = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: zona }).format(ahora);
  return Number(h) % 24;
}

/**
 * Horas para reintentar hoy: la siguiente hora en punto + 1 y + 3 (a las 13:20 → 15:00 y 17:00),
 * sin pasar de las 20:00. Tarde en la noche no hay opciones de hoy.
 */
export function horasReintentoHoy(ahora: Date, zona: string, ultima = 20): number[] {
  const base = horaEnZona(ahora, zona) + 1;
  return [base + 1, base + 3].filter((h) => h <= ultima);
}

/** Opciones de «¿Y ahora?» con la sugerida primero: rechazado → devolver; si no, la primera de hoy. */
export function opcionesReintento(ahora: Date, zona: string): PlanReintento[] {
  return [...horasReintentoHoy(ahora, zona).map((hora) => ({ tipo: 'hoy' as const, hora })), { tipo: 'manana' }, { tipo: 'devolver' }];
}

export function planSugerido(motivo: MotivoApp, opciones: readonly PlanReintento[]): PlanReintento {
  if (motivo === 'rejected') return { tipo: 'devolver' };
  return opciones[0] ?? { tipo: 'manana' };
}

/** Fecha para `p_reprogramar` (date en la zona de la sede): hoy o mañana; devolver no reprograma. */
export function fechaReprogramada(plan: PlanReintento, hoy: string): string | null {
  if (plan.tipo === 'hoy') return hoy;
  if (plan.tipo === 'manana') return addPlainDays(hoy, 1);
  return null;
}

export const claveDePlan = (p: PlanReintento) => (p.tipo === 'hoy' ? `hoy-${p.hora}` : p.tipo);

/** La nota de «otro» es obligatoria (la tienda no sabría qué pasó). */
export function faltanteNovedad(p: { motivo: MotivoApp | null; nota: string; plan: PlanReintento | null }): 'motivo' | 'nota' | 'plan' | null {
  if (!p.motivo) return 'motivo';
  if (p.motivo === 'other' && !p.nota.trim()) return 'nota';
  if (!p.plan) return 'plan';
  return null;
}

// ── Fin de jornada ──────────────────────────────────────────────────────────

export interface CobroPorMedio {
  medio: MedioCobroContraentrega;
  envios: number;
  total: number;
}

export interface ResumenJornada {
  entregados: number;
  noEntregados: number;
  porDevolver: number;
  cobros: CobroPorMedio[];
  totalCobrado: number;
  /** Efectivo cobrado y aún no entregado en un cuadre: lo que lleva a la caja. */
  efectivoACaja: number;
  reprogramados: EnvioDomiciliario[];
  devoluciones: EnvioDomiciliario[];
}

/** Resumen del día para el cuadre. `hoy` y `zonaDe` como en `agruparMisEnvios`. */
export function resumenJornada<T extends EnvioDomiciliario>(envios: readonly T[], hoy: string, zonaDe: (e: T) => string): ResumenJornada {
  const deHoy = (instante: string | null | undefined, e: T) => diaEn(instante, zonaDe(e)) === hoy;
  const entregados = envios.filter((e) => e.status === 'delivered' && deHoy(e.delivered_at, e));
  const reprogramados = envios.filter((e) => e.status === 'failed_attempt');
  const devoluciones = envios.filter((e) => e.status === 'returned' && deHoy(e.updated_at, e));
  const pendientesHoy = envios.filter((e) => ESTADOS_EN_RUTA.includes(String(e.status)));

  const porMedio = new Map<MedioCobroContraentrega, { envios: number; c: number }>();
  for (const e of envios) {
    if (!e.cod_collected_at || !deHoy(e.cod_collected_at, e) || !e.cod_collected_method) continue;
    const medio = e.cod_collected_method as MedioCobroContraentrega;
    const actual = porMedio.get(medio) ?? { envios: 0, c: 0 };
    porMedio.set(medio, { envios: actual.envios + 1, c: actual.c + centavos(e.cod_collected_amount) });
  }
  const orden: MedioCobroContraentrega[] = ['cash', 'card', 'transfer', 'qr'];
  const cobros = orden.filter((m) => porMedio.has(m)).map((m) => ({ medio: m, envios: porMedio.get(m)!.envios, total: porMedio.get(m)!.c / 100 }));
  const efectivoACaja =
    envios.filter((e) => e.cod_status === 'collected' && e.cod_collected_method === 'cash').reduce((s, e) => s + centavos(e.cod_collected_amount), 0) / 100;

  return {
    entregados: entregados.length,
    noEntregados: reprogramados.length + devoluciones.length + pendientesHoy.length,
    porDevolver: devoluciones.length,
    cobros,
    totalCobrado: cobros.reduce((s, c) => s + Math.round(c.total * 100), 0) / 100,
    efectivoACaja,
    reprogramados,
    devoluciones,
  };
}

// ── Fotos ───────────────────────────────────────────────────────────────────

/** Ruta en el bucket `shipment-pod`: {organización}/{envío}/{prefijo}-{uuid}.{ext} (política de subida). */
export function rutaFotoEnvio(organizationId: number, shipmentId: string, uuid: string, tipo: 'foto' | 'firma' | 'novedad' | 'comprobante', extension = 'jpg'): string {
  const ext = extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  return `${organizationId}/${shipmentId}/${tipo}-${uuid}.${ext}`;
}
