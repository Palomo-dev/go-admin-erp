/**
 * Transporte › Flota › Documentos y vencimientos (Figma «23 Transporte» › 13, 2889:8513). Puro.
 *
 * Fase 1 «Documentos completos» (2026-11-23): cada documento sale de `vehicle_documents`
 * (número, entidad, archivo, si bloquea; migración 20261123234500). Las fechas de siempre de
 * `vehicles` (SOAT, técnico-mecánica, póliza, tarjeta de operación) y `driver_credentials`
 * (licencia, examen médico) que aún no tienen documento cargado se siguen mostrando: nada que
 * funcionaba se pierde. La regla del bloqueo es la de la base (`fn_transporte_cumplimiento`):
 * vencido a la fecha del viaje → no sale.
 */
import type { CausaBloqueo } from './despachos';

export type EstadoDocumento = 'vencido' | 'por_vencer' | 'vigente';

/** `vehicle_documents.doc_type`. */
export const TIPOS_DOCUMENTO = ['soat', 'tecnomecanica', 'poliza', 'tarjeta_operacion', 'matricula', 'navegabilidad', 'licencia', 'examen_medico', 'otro'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];
export const TIPOS_DE_VEHICULO: readonly TipoDocumento[] = ['soat', 'tecnomecanica', 'poliza', 'tarjeta_operacion', 'matricula', 'navegabilidad', 'otro'];
export const TIPOS_DE_CONDUCTOR: readonly TipoDocumento[] = ['licencia', 'examen_medico', 'otro'];

/** Fila de `vehicle_documents` (vigente). */
export interface DocumentoTabla {
  id: string;
  vehicle_id: string | null;
  driver_credential_id: string | null;
  doc_type: TipoDocumento;
  number: string | null;
  issuer: string | null;
  category: string | null;
  expires_on: string | null;
  blocks_dispatch: boolean;
  file_path: string | null;
  file_name: string | null;
  notes: string | null;
}

export interface DocumentoFlota {
  id: string;
  tipo: CausaBloqueo;
  /** Id en `vehicle_documents` (null: fecha de siempre sin documento cargado). */
  docId: string | null;
  numero: string | null;
  archivo: string | null;
  archivoNombre: string | null;
  bloquea: boolean;
  de: 'vehiculo' | 'conductor';
  /** Id del vehículo o del conductor (driver_credentials). */
  duenoId: string;
  /** Placa o nombre. */
  nombre: string;
  /** Tipo de vehículo o categoría de licencia. */
  detalle: string | null;
  vence: string;
  dias: number;
  estado: EstadoDocumento;
}

export const DIAS_AVISO = 30;
/** Avisos antes de vencer (decisión del diseño: 30, 15 y 7 días). */
export const UMBRALES_AVISO = [30, 15, 7] as const;

/** Días entre dos fechas `AAAA-MM-DD` (sin horas ni zona: son columnas `date`). */
export function diasEntre(desde: string, hasta: string): number {
  const a = desde.split('-').map(Number);
  const b = hasta.split('-').map(Number);
  if (a.length !== 3 || b.length !== 3 || [...a, ...b].some((n) => !Number.isFinite(n))) return NaN;
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000);
}

export function estadoDocumento(dias: number): EstadoDocumento {
  if (dias < 0) return 'vencido';
  return dias <= DIAS_AVISO ? 'por_vencer' : 'vigente';
}

export interface VehiculoConFechas {
  id: string;
  plate: string;
  vehicle_type: string | null;
  soat_expiry: string | null;
  techno_expiry: string | null;
  insurance_expiry: string | null;
  operating_card_expiry: string | null;
}

export interface ConductorConFechas {
  id: string;
  full_name: string | null;
  license_category: string | null;
  license_expiry: string | null;
  medical_certificate_expiry: string | null;
}

type BaseDoc = Omit<DocumentoFlota, 'dias' | 'estado' | 'id' | 'docId' | 'numero' | 'archivo' | 'archivoNombre' | 'bloquea'> & Partial<Pick<DocumentoFlota, 'docId' | 'numero' | 'archivo' | 'archivoNombre' | 'bloquea'>>;

/**
 * Un documento por cada fila vigente de `vehicle_documents` con vencimiento y, para los tipos
 * que no tienen fila, uno por cada fecha de siempre; sin fecha no hay documento que vigilar.
 */
export function documentosFlota(
  vehiculos: readonly VehiculoConFechas[],
  conductores: readonly ConductorConFechas[],
  hoy: string,
  tabla: readonly DocumentoTabla[] = [],
): DocumentoFlota[] {
  const out: DocumentoFlota[] = [];
  const agregar = (d: BaseDoc) => {
    const dias = diasEntre(hoy, d.vence);
    if (!Number.isFinite(dias)) return;
    out.push({
      docId: null,
      numero: null,
      archivo: null,
      archivoNombre: null,
      bloquea: true,
      ...d,
      id: d.docId ?? `${d.de}:${d.duenoId}:${d.tipo}`,
      dias,
      estado: estadoDocumento(dias),
    });
  };
  const porVehiculo = new Map(vehiculos.map((v) => [v.id, v]));
  const porConductor = new Map(conductores.map((c) => [c.id, c]));
  const cargados = new Set<string>();
  for (const d of tabla) {
    const de = d.vehicle_id ? 'vehiculo' : 'conductor';
    const duenoId = (d.vehicle_id ?? d.driver_credential_id) as string;
    cargados.add(`${de}:${duenoId}:${d.doc_type}`);
    if (!d.expires_on) continue;
    const v = d.vehicle_id ? porVehiculo.get(d.vehicle_id) : undefined;
    const c = d.driver_credential_id ? porConductor.get(d.driver_credential_id) : undefined;
    if (!v && !c) continue; // dueño de otra sede o inactivo
    agregar({
      tipo: d.doc_type,
      de,
      duenoId,
      nombre: v ? v.plate : c?.full_name?.trim() || '—',
      detalle: v ? v.vehicle_type : d.category ?? c?.license_category ?? null,
      vence: d.expires_on,
      docId: d.id,
      numero: d.number,
      archivo: d.file_path,
      archivoNombre: d.file_name,
      bloquea: d.blocks_dispatch,
    });
  }
  const sinFila = (de: string, duenoId: string, tipo: string) => !cargados.has(`${de}:${duenoId}:${tipo}`);
  for (const v of vehiculos) {
    const fechas: [CausaBloqueo, string | null][] = [
      ['soat', v.soat_expiry],
      ['tecnomecanica', v.techno_expiry],
      ['poliza', v.insurance_expiry],
      ['tarjeta_operacion', v.operating_card_expiry],
    ];
    for (const [tipo, vence] of fechas) if (vence && sinFila('vehiculo', v.id, tipo)) agregar({ tipo, de: 'vehiculo', duenoId: v.id, nombre: v.plate, detalle: v.vehicle_type, vence });
  }
  for (const c of conductores) {
    const fechas: [CausaBloqueo, string | null][] = [
      ['licencia', c.license_expiry],
      ['examen_medico', c.medical_certificate_expiry],
    ];
    for (const [tipo, vence] of fechas) if (vence && sinFila('conductor', c.id, tipo)) agregar({ tipo, de: 'conductor', duenoId: c.id, nombre: c.full_name?.trim() || '—', detalle: c.license_category, vence });
  }
  return out.sort((a, b) => a.dias - b.dias || a.nombre.localeCompare(b.nombre));
}

export interface KpisDocumentos {
  vencidos: number;
  porVencer: number;
  vigentes: number;
  total: number;
  /** Vehículos y conductores sin ninguna fecha registrada. */
  sinFecha: number;
  /** Fecha del primero que vence entre los por vencer. */
  primero: string | null;
  /** Documentos vigilados sin archivo cargado. */
  sinArchivo: number;
}

export function kpisDocumentos(docs: readonly DocumentoFlota[], sinFecha: number): KpisDocumentos {
  const porVencer = docs.filter((d) => d.estado === 'por_vencer');
  return {
    vencidos: docs.filter((d) => d.estado === 'vencido').length,
    porVencer: porVencer.length,
    vigentes: docs.filter((d) => d.estado === 'vigente').length,
    total: docs.length,
    sinFecha,
    primero: porVencer.length ? porVencer.reduce((m, d) => (d.vence < m ? d.vence : m), porVencer[0].vence) : null,
    sinArchivo: docs.filter((d) => !d.archivo).length,
  };
}

/** CSV de la selección (separador `;` y BOM para que Excel en español lo abra bien). */
export function documentosACsv(docs: readonly DocumentoFlota[], encabezados: readonly string[], fila: (d: DocumentoFlota) => readonly string[]): string {
  const celda = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿' + [encabezados, ...docs.map(fila)].map((f) => f.map(celda).join(';')).join('\r\n');
}
