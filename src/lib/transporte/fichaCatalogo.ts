/**
 * Catálogo común › fichas de detalle (Figma «23 Transporte»: vehículo 2872:1691, persona
 * 2874:2806). Puro (sin red ni React).
 *
 * Los documentos de un dueño salen de `documentosFlota` (la regla de Flota y del bloqueo de
 * despacho), más las filas de `vehicle_documents` sin vencimiento, que `documentosFlota` no vigila
 * pero existen y se deben poder ver.
 *
 * Lo que el diseño pide y la base no tiene (MCP, 2026-11-24): mantenimiento, combustible, costos
 * del mes y liquidaciones (Fase 3 de Transporte), odómetro, propietario o afiliado, puntualidad
 * del mes y la fecha desde la que la persona tiene el vehículo asignado.
 */
import type { Trip } from '@/lib/services/transportService';
import type { NovedadFicha } from '@/lib/services/transporte/fichaCatalogoService';
import { SIN_DOCS, type EstadoDocs, type ResumenDocs } from './catalogoComun';
import type { DocumentoFlota, DocumentoTabla } from './documentosFlota';
import type { EntradaBitacora } from './formulariosCatalogo';

export const PESTANAS_FICHA = ['resumen', 'documentos', 'viajes', 'envios', 'novedades'] as const;
export type PestanaFicha = (typeof PESTANAS_FICHA)[number];

/** Filas que se ven en «Resumen» antes de «Ver los N». */
export const FILAS_RESUMEN = 5;

// ── Documentos ─────────────────────────────────────────────────────────────

export interface FilaDocumentoFicha {
  id: string;
  /** `vehicle_documents.doc_type` o la causa de bloqueo de la fecha de siempre. */
  tipo: string;
  docId: string | null;
  numero: string | null;
  entidad: string | null;
  categoria: string | null;
  archivo: string | null;
  archivoNombre: string | null;
  vence: string | null;
  dias: number | null;
  estado: EstadoDocs;
  bloquea: boolean;
}

export function documentosDeDueno(
  de: 'vehiculo' | 'conductor',
  duenoId: string,
  docs: readonly DocumentoFlota[],
  tabla: readonly DocumentoTabla[],
): FilaDocumentoFicha[] {
  const filasTabla = tabla.filter((t) => (de === 'vehiculo' ? t.vehicle_id : t.driver_credential_id) === duenoId);
  const porId = new Map(filasTabla.map((t) => [t.id, t]));
  const conFecha: FilaDocumentoFicha[] = docs
    .filter((d) => d.de === de && d.duenoId === duenoId)
    .map((d) => {
      const fila = d.docId ? porId.get(d.docId) : undefined;
      return {
        id: d.id,
        tipo: d.tipo,
        docId: d.docId,
        numero: d.numero,
        entidad: fila?.issuer ?? null,
        categoria: fila?.category ?? null,
        archivo: d.archivo,
        archivoNombre: d.archivoNombre,
        vence: d.vence,
        dias: d.dias,
        estado: d.estado,
        bloquea: d.bloquea,
      };
    });
  const sinFecha: FilaDocumentoFicha[] = filasTabla
    .filter((t) => !t.expires_on)
    .map((t) => ({
      id: t.id,
      tipo: t.doc_type,
      docId: t.id,
      numero: t.number,
      entidad: t.issuer,
      categoria: t.category,
      archivo: t.file_path,
      archivoNombre: t.file_name,
      vence: null,
      dias: null,
      estado: 'sin_fecha',
      bloquea: t.blocks_dispatch,
    }));
  return [...conFecha, ...sinFecha];
}

/** El documento que manda (el que vence primero entre los que tienen fecha). */
export function peorDocumento(filas: readonly FilaDocumentoFicha[]): ResumenDocs {
  const conDias = filas.filter((f) => f.dias !== null);
  if (!conDias.length) return SIN_DOCS;
  const peor = conDias.reduce((m, f) => ((f.dias as number) < (m.dias as number) ? f : m));
  return { estado: peor.estado, tipo: peor.tipo, vence: peor.vence, dias: peor.dias };
}

// ── Viajes ─────────────────────────────────────────────────────────────────

export const ESTADOS_VIAJE = ['scheduled', 'boarding', 'in_transit', 'arrived', 'completed', 'cancelled', 'delayed'] as const;
export const TONO_VIAJE: Record<string, 'informacion' | 'exito' | 'advertencia' | 'neutro' | 'peligro' | 'marca'> = {
  scheduled: 'neutro',
  boarding: 'informacion',
  in_transit: 'marca',
  arrived: 'exito',
  completed: 'exito',
  cancelled: 'peligro',
  delayed: 'advertencia',
};

/** El viaje que está andando (abordando o en ruta), si hay. */
export function viajeEnCurso(viajes: readonly Trip[]): Trip | null {
  return viajes.find((v) => v.status === 'boarding' || v.status === 'in_transit') ?? null;
}

/** Viajes del mes de `hoy` (`trip_date` es `date`: se compara el prefijo AAAA-MM). */
export function viajesDelMes(viajes: readonly Trip[], hoy: string): number {
  const mes = hoy.slice(0, 7);
  return viajes.filter((v) => (v.trip_date ?? '').slice(0, 7) === mes && v.status !== 'cancelled').length;
}

/** Viajes por salir desde `hoy` (programados, retrasados o abordando), del más próximo al más lejano. */
export function viajesProgramados(viajes: readonly Trip[], hoy: string): Trip[] {
  return viajes
    .filter((v) => ['scheduled', 'delayed', 'boarding'].includes(v.status) && (v.trip_date ?? '') >= hoy)
    .sort((a, b) => (a.trip_date < b.trip_date ? -1 : a.trip_date > b.trip_date ? 1 : 0));
}

/** Puestos vendidos de un viaje de pasajeros (null si el viaje no tiene puestos). */
export function ocupacionViaje(v: Pick<Trip, 'total_seats' | 'available_seats'>): { vendidos: number; total: number } | null {
  const total = Number(v.total_seats) || 0;
  if (total <= 0) return null;
  const libres = Math.min(Math.max(Number(v.available_seats) || 0, 0), total);
  return { vendidos: total - libres, total };
}

/** «Llegada» del diseño: en viajes cerrados, a tiempo o con retraso; si no, su estado. */
export type LlegadaViaje = { tipo: 'aTiempo' } | { tipo: 'retraso'; minutos: number } | { tipo: 'estado'; estado: string };

export function llegadaViaje(v: { status: string; delay_minutes?: number | null }): LlegadaViaje {
  // `trips.status` admite también «arrived» y «delayed» (CHECK), aunque el tipo `Trip` no los nombre.
  if (v.status === 'completed' || v.status === 'arrived') {
    const m = Number(v.delay_minutes) || 0;
    return m > 0 ? { tipo: 'retraso', minutos: m } : { tipo: 'aTiempo' };
  }
  return { tipo: 'estado', estado: v.status };
}

// ── Novedades ──────────────────────────────────────────────────────────────

export const ESTADOS_NOVEDAD = ['open', 'investigating', 'in_progress', 'resolved', 'closed', 'cancelled'] as const;
export const TONO_NOVEDAD: Record<string, 'informacion' | 'exito' | 'advertencia' | 'neutro'> = {
  open: 'advertencia',
  investigating: 'informacion',
  in_progress: 'informacion',
  resolved: 'exito',
  closed: 'neutro',
  cancelled: 'neutro',
};
const ABIERTAS = new Set(['open', 'investigating', 'in_progress']);

export function novedadesAbiertas(n: readonly Pick<NovedadFicha, 'status'>[]): number {
  return n.filter((x) => ABIERTAS.has(x.status)).length;
}

/** Costo de una novedad: el real si ya se cerró la cuenta, si no el estimado. */
export function costoNovedad(n: Pick<NovedadFicha, 'actual_cost' | 'estimated_cost'>): number | null {
  const v = n.actual_cost ?? n.estimated_cost;
  return v == null ? null : Number(v);
}

// ── Envíos ─────────────────────────────────────────────────────────────────

export const TONO_ENVIO: Record<string, 'informacion' | 'exito' | 'advertencia' | 'neutro' | 'peligro' | 'marca'> = {
  draft: 'neutro',
  pending: 'neutro',
  assigned: 'informacion',
  ready: 'informacion',
  ready_for_pickup: 'informacion',
  picked: 'marca',
  dispatched: 'marca',
  in_transit: 'marca',
  out_for_delivery: 'marca',
  failed_attempt: 'advertencia',
  delivered: 'exito',
  failed: 'peligro',
  returned: 'advertencia',
  cancelled: 'neutro',
};

// ── Historial (hoja lateral 2972:21903) ───────────────────────────────────

/**
 * «Quién cambió qué y cuándo» con lo que la base guarda: la bitácora de estado y conductor que
 * anotan estas pantallas (`vehicles.metadata.bitacora`), los documentos subidos (también los
 * archivados al renovar), los despachos (`trips.dispatched_at`), las novedades y el alta. No hay
 * tabla de auditoría de vehículos ni de conductores: el «quién» no se guarda (MCP, 2026-11-24).
 */
export type EventoHistorial =
  | { id: string; at: string; tipo: 'estado'; de: string | null; a: string | null; motivo: string | null }
  | { id: string; at: string; tipo: 'conductor'; de: string | null; a: string | null }
  | { id: string; at: string; tipo: 'documento'; documento: string; vence: string | null; archivado: boolean }
  | { id: string; at: string; tipo: 'despacho'; codigo: string; otro: string | null }
  | { id: string; at: string; tipo: 'novedad'; titulo: string }
  | { id: string; at: string; tipo: 'alta' };

export function eventosHistorial(e: {
  bitacora: readonly EntradaBitacora[];
  documentos: readonly { id: string; doc_type: string; expires_on: string | null; is_active: boolean; created_at: string }[];
  viajes: readonly (Trip & { dispatched_at?: string | null })[];
  /** Vehículo o conductor del viaje, según la ficha. */
  otroDeViaje?: (v: Trip) => string | null;
  novedades: readonly Pick<NovedadFicha, 'id' | 'title' | 'reported_at' | 'occurred_at'>[];
  creado: string | null;
}): EventoHistorial[] {
  const out: EventoHistorial[] = [];
  e.bitacora.forEach((b, i) =>
    out.push(b.tipo === 'estado' ? { id: `b${i}`, at: b.at, tipo: 'estado', de: b.de, a: b.a, motivo: b.motivo ?? null } : { id: `b${i}`, at: b.at, tipo: 'conductor', de: b.de, a: b.a }),
  );
  for (const d of e.documentos) out.push({ id: `d${d.id}`, at: d.created_at, tipo: 'documento', documento: d.doc_type, vence: d.expires_on, archivado: !d.is_active });
  for (const v of e.viajes) if (v.dispatched_at) out.push({ id: `v${v.id}`, at: v.dispatched_at, tipo: 'despacho', codigo: v.trip_code, otro: e.otroDeViaje?.(v) ?? null });
  for (const n of e.novedades) {
    const at = n.reported_at ?? n.occurred_at;
    if (at) out.push({ id: `n${n.id}`, at, tipo: 'novedad', titulo: n.title });
  }
  if (e.creado) out.push({ id: 'alta', at: e.creado, tipo: 'alta' });
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
