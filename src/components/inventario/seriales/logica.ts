/**
 * Lógica de presentación de seriales, garantías y trazabilidad (inventario B4),
 * sin React: rutas de cada documento, situación de la garantía, «dónde está»
 * la unidad, eventos del historial y exportación. La usan las tres pantallas,
 * el detalle del producto y las pruebas.
 *
 * Fechas: la garantía son columnas `date` (se comparan como día plano con el
 * `hoy` de la organización que devuelve la RPC); los instantes (`recibido`,
 * `fecha_venta`, eventos) los formatea la pantalla con `useFormatDate`.
 */
import { diasEntre } from '@/components/inventario/productos/logica/seriales';
import type {
  DocumentoSerial,
  EstadoReclamo,
  EventoSerial,
  FiltroGarantiaSerial,
  GarantiaSerial,
  SerialFila,
} from '@/lib/services/seriales/contrato';

// ── Rutas ────────────────────────────────────────────────────────────────────

const REF_SEGURA = /^[0-9A-Za-z-]{1,64}$/;
const RUTA_SEGURA = /^\/app\/[0-9A-Za-z\-/_?=&.]+$/;

/**
 * Ruta del documento: la resuelve el servidor (`fn_documento_de_movimiento`
 * del núcleo, o el reclamo de garantía). Solo se aceptan rutas internas de
 * la app; cualquier otra cosa no se enlaza.
 */
export function rutaDocumento(doc: Pick<DocumentoSerial, 'ruta'> | null | undefined): string | null {
  const ruta = doc?.ruta ?? null;
  return ruta && RUTA_SEGURA.test(ruta) && !ruta.includes('..') ? ruta : null;
}

/** Número visible de un documento: el suyo o, sin número, `#` y el comienzo de su id. */
export function numeroDocumento(doc: Pick<DocumentoSerial, 'numero' | 'source_id'> | null | undefined): string {
  if (!doc) return '';
  return doc.numero?.trim() || (doc.source_id ? `#${doc.source_id.slice(0, 8)}` : '—');
}

/** Documento de la garantía (el núcleo no lo conoce) con la misma forma. */
export function documentoReclamo(id: string, codigo: string | null): DocumentoSerial {
  return { source: 'warranty_claim', source_id: id, product_id: null, tipo: 'garantia', numero: codigo, ruta: rutaReclamo(id) };
}

export const RUTA_SERIALES = '/app/inventario/seriales';
export const RUTA_GARANTIAS = '/app/inventario/garantias';
export const RUTA_TRAZABILIDAD = '/app/inventario/reportes/trazabilidad';

export const rutaSerial = (id: number) => `${RUTA_SERIALES}/${id}`;
export const rutaReclamo = (id: string) => `${RUTA_GARANTIAS}/${id}`;
export const rutaTrazabilidad = (codigo: string) => `${RUTA_TRAZABILIDAD}?codigo=${encodeURIComponent(codigo)}`;
export const rutaProducto = (uuid: string | null | undefined) => (uuid && REF_SEGURA.test(uuid) ? `/app/inventario/productos/${uuid}` : null);
export const rutaCliente = (id: string | number | null | undefined) =>
  id !== null && id !== undefined && REF_SEGURA.test(String(id)) ? `/app/clientes/${id}` : null;
export const rutaProveedor = (uuid: string | null | undefined) => (uuid && REF_SEGURA.test(uuid) ? `/app/inventario/proveedores/${uuid}` : null);

/**
 * «Trasladar a otra sucursal»: abre el traslado nuevo (bloque B3) con el
 * producto y la sucursal de origen elegidos. El traslado es quien mueve el
 * stock y el serial; aquí solo se navega.
 */
export function rutaNuevoTraslado(productoId: number, sucursalId: number | null | undefined): string {
  const p = new URLSearchParams({ producto_id: String(productoId) });
  if (sucursalId) p.set('origen', String(sucursalId));
  return `/app/inventario/transferencias/nuevo?${p.toString()}`;
}

// ── Garantía ─────────────────────────────────────────────────────────────────

export const ESTADOS_EN_BODEGA = ['in_stock', 'reserved', 'in_transit'] as const;
export const ESTADOS_DADO_DE_BAJA = ['damaged', 'defective'] as const;
export const ESTADOS_RECLAMO_ABIERTO: readonly EstadoReclamo[] = ['pending', 'approved', 'in_process'];

export type SituacionGarantia =
  | { tipo: 'vigente'; dias: number; fin: string; meses: number | null }
  | { tipo: 'por_vencer'; dias: number; fin: string; meses: number | null }
  | { tipo: 'vencida'; dias: number; fin: string }
  | { tipo: 'empieza_al_vender'; meses: number }
  | { tipo: 'en_reclamo'; codigo: string | null; id: string }
  | { tipo: 'en_rma'; rma: string | null; id: string }
  | { tipo: 'no_aplica' }
  | { tipo: 'sin_garantia' };

/** Días para «por vencer» (el KPI «ninguna vence en 30 días» usa el mismo corte). */
export const DIAS_POR_VENCER = 30;

/**
 * Qué se muestra en la columna «Garantía» (Figma: «Vigente · 12 meses / hasta
 * 21/09/2027», «En reclamo / GAR-0007», «Empieza al vender / 12 meses», «No
 * aplica / dado de baja», «En RMA / RMA-2026-031»).
 */
export function situacionGarantia(
  fila: {
    estado: string;
    garantia: GarantiaSerial;
    reclamo?: { id: string; codigo: string | null; estado: string; rma: string | null } | null;
  },
  hoy: string,
): SituacionGarantia {
  const r = fila.reclamo;
  if (r && (ESTADOS_RECLAMO_ABIERTO as readonly string[]).includes(r.estado)) {
    return r.estado === 'in_process' ? { tipo: 'en_rma', rma: r.rma, id: r.id } : { tipo: 'en_reclamo', codigo: r.codigo, id: r.id };
  }
  const fin = fila.garantia.fin?.slice(0, 10) ?? null;
  if (fin && /^\d{4}-\d{2}-\d{2}$/.test(fin) && /^\d{4}-\d{2}-\d{2}$/.test(hoy)) {
    const dias = diasEntre(hoy, fin);
    if (dias < 0) return { tipo: 'vencida', dias: -dias, fin };
    return dias <= DIAS_POR_VENCER
      ? { tipo: 'por_vencer', dias, fin, meses: fila.garantia.meses }
      : { tipo: 'vigente', dias, fin, meses: fila.garantia.meses };
  }
  if ((ESTADOS_DADO_DE_BAJA as readonly string[]).includes(fila.estado)) return { tipo: 'no_aplica' };
  const meses = fila.garantia.meses ?? 0;
  if (meses > 0 && (ESTADOS_EN_BODEGA as readonly string[]).includes(fila.estado)) return { tipo: 'empieza_al_vender', meses };
  return { tipo: 'sin_garantia' };
}

/**
 * «Quedan 10 meses y 20 días» (Figma, diálogo de reclamo): meses completos de
 * calendario entre `hoy` y `fin` y los días que sobran. Días planos, sin zona.
 */
export function mesesYDias(hoy: string, fin: string): { meses: number; dias: number } {
  const [ah, mh, dh] = hoy.split('-').map(Number);
  const [af, mf, df] = fin.split('-').map(Number);
  if (![ah, mh, dh, af, mf, df].every(Number.isFinite) || diasEntre(hoy, fin) < 0) return { meses: 0, dias: 0 };
  let meses = (af - ah) * 12 + (mf - mh);
  if (df < dh) meses -= 1;
  // Día `hoy + meses` (ajustado al último día del mes si no existe).
  const anio = ah + Math.floor((mh - 1 + meses) / 12);
  const mes = ((mh - 1 + meses) % 12) + 1;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const ancla = `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(dh, ultimo)).padStart(2, '0')}`;
  return { meses: Math.max(meses, 0), dias: Math.max(diasEntre(ancla, fin), 0) };
}

// ── Dónde está ───────────────────────────────────────────────────────────────

export type DondeEsta =
  | { clave: 'conCliente'; detalle: 'vendidoEn' | 'vendido'; sucursal: string | null }
  | { clave: 'conProveedor'; proveedor: string | null }
  | { clave: 'enTransito'; destino: string | null; documento: DocumentoSerial | null }
  | { clave: 'enSucursal'; sucursal: string | null; detalle: 'recibido' | 'revision' | 'documento' | 'ninguno'; recibido: string | null; documento: DocumentoSerial | null };

/** Columna «Dónde está» del listado (dos líneas, Figma 590:319445). */
export function dondeEsta(fila: SerialFila): DondeEsta {
  const sucursal = fila.sucursal?.nombre ?? null;
  const ev = fila.ultimo_evento;
  switch (fila.estado) {
    case 'sold':
      return { clave: 'conCliente', detalle: fila.venta?.sucursal ? 'vendidoEn' : 'vendido', sucursal: fila.venta?.sucursal?.nombre ?? null };
    case 'rma':
      return { clave: 'conProveedor', proveedor: fila.proveedor?.nombre ?? null };
    case 'in_transit':
      return { clave: 'enTransito', destino: ev?.a_sucursal ?? null, documento: ev?.documento ?? null };
    case 'warranty_claim':
      return { clave: 'enSucursal', sucursal, detalle: 'revision', recibido: null, documento: null };
    case 'in_stock':
    case 'reserved':
      return { clave: 'enSucursal', sucursal, detalle: 'recibido', recibido: fila.recibido, documento: fila.origen };
    default:
      return ev?.documento
        ? { clave: 'enSucursal', sucursal, detalle: 'documento', recibido: null, documento: ev.documento }
        : { clave: 'enSucursal', sucursal, detalle: 'ninguno', recibido: null, documento: null };
  }
}

// ── Historial ────────────────────────────────────────────────────────────────

export type ClaveEvento =
  | 'recibido'
  | 'recibidoDe'
  | 'trasladado'
  | 'reservado'
  | 'vendido'
  | 'vendidoA'
  | 'reemplazoEntregado'
  | 'devuelto'
  | 'danado'
  | 'rma'
  | 'reclamoAbierto'
  | 'reclamoAprobado'
  | 'reparado'
  | 'reemplazado'
  | 'reembolsado'
  | 'reclamoRechazado'
  | 'garantiaReiniciada'
  | 'cambioEstado';

export type TonoEvento = 'marca' | 'informacion' | 'exito' | 'advertencia' | 'peligro' | 'neutro';

/** Qué dice y de qué color va cada evento de `serial_tracking_events`. */
export function claveEvento(e: Pick<EventoSerial, 'tipo' | 'cliente' | 'metadata'>, proveedor?: string | null): { clave: ClaveEvento; tono: TonoEvento } {
  const meta = (e.metadata ?? {}) as Record<string, unknown>;
  switch (e.tipo) {
    case 'received':
    case 'stock_in':
      return { clave: proveedor ? 'recibidoDe' : 'recibido', tono: 'marca' };
    case 'transferred':
      return { clave: 'trasladado', tono: 'informacion' };
    case 'reserved':
      return { clave: 'reservado', tono: 'informacion' };
    case 'sold':
      if (typeof meta.reemplazo_de === 'string') return { clave: 'reemplazoEntregado', tono: 'exito' };
      return { clave: e.cliente?.nombre ? 'vendidoA' : 'vendido', tono: 'peligro' };
    case 'returned':
      return { clave: 'devuelto', tono: 'advertencia' };
    case 'damaged':
      return { clave: 'danado', tono: 'peligro' };
    case 'rma_created':
      return { clave: 'rma', tono: 'advertencia' };
    case 'warranty_claim':
      return { clave: 'reclamoAbierto', tono: 'informacion' };
    case 'warranty_approved':
      return { clave: 'reclamoAprobado', tono: 'informacion' };
    case 'warranty_resolved': {
      const r = meta.resolucion;
      if (r === 'repair') return { clave: 'reparado', tono: 'exito' };
      if (r === 'replacement') return { clave: 'reemplazado', tono: 'exito' };
      if (r === 'refund') return { clave: 'reembolsado', tono: 'exito' };
      return { clave: 'reclamoRechazado', tono: 'neutro' };
    }
    case 'warranty_reset':
      return { clave: 'garantiaReiniciada', tono: 'neutro' };
    default:
      return { clave: 'cambioEstado', tono: 'neutro' };
  }
}

/** Eventos visibles, del más antiguo al más reciente. */
export function eventosVisibles(eventos: readonly EventoSerial[] | null | undefined): EventoSerial[] {
  return [...(eventos ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
}

// ── Filtros del listado ──────────────────────────────────────────────────────

export const FILTROS_GARANTIA: readonly FiltroGarantiaSerial[] = ['vigente', 'por_vencer', 'vencida', 'sin_iniciar', 'corriendo_en_bodega'];

/** Estados que ofrece el filtro (los 3 heredados se muestran, no se filtran). */
export const ESTADOS_FILTRO_SERIAL = ['in_stock', 'reserved', 'sold', 'returned', 'in_transit', 'damaged', 'rma', 'warranty_claim'] as const;

/** Lee `estado` de la URL (uno o varios separados por coma) contra la lista blanca. */
export function estadosDeUrl(valor: string | null | undefined): string[] {
  if (!valor) return [];
  const permitidos = new Set<string>(ESTADOS_FILTRO_SERIAL);
  return [...new Set(valor.split(',').map((v) => v.trim()))].filter((v) => permitidos.has(v));
}

// ── Exportación ──────────────────────────────────────────────────────────────

export interface TextosCsvSeriales {
  cabecera: readonly string[];
  estado: (estado: string) => string;
  fechaInstante: (valor: string | null) => string;
  fechaPlana: (valor: string | null) => string;
}

/** Filas del CSV de seriales (las celdas las escapa `filasACsv`). */
export function filasCsvSeriales(filas: readonly SerialFila[], x: Omit<TextosCsvSeriales, 'cabecera'>): (string | number | null)[][] {
  return filas.map((f) => [
    f.serial,
    f.producto.nombre,
    f.producto.sku,
    x.estado(f.estado),
    f.sucursal?.nombre ?? null,
    x.fechaInstante(f.recibido),
    f.origen ? numeroDocumento(f.origen) : null,
    f.proveedor?.nombre ?? null,
    f.venta ? numeroDocumento(f.venta.documento) || f.venta.numero : null,
    x.fechaInstante(f.fecha_venta),
    f.cliente?.nombre ?? null,
    f.garantia.meses,
    x.fechaPlana(f.garantia.inicio),
    x.fechaPlana(f.garantia.fin),
    f.reclamo?.codigo ?? null,
  ]);
}
