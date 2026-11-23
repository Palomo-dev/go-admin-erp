/**
 * Transporte › Flota › Documentos y vencimientos (Figma «23 Transporte» › 13, 2889:8513). Puro.
 *
 * Fase Cumplimiento, primera entrega: los documentos salen de las fechas que ya guardan
 * `vehicles` (SOAT, técnico-mecánica, póliza, tarjeta de operación) y `driver_credentials`
 * (licencia, examen médico). Número y archivo de cada documento llegan con la tabla
 * `vehicle_documents` (propuesta en la lámina 24, aún no creada). La regla del bloqueo es la
 * misma de la base (`fn_transporte_cumplimiento`): vencido a la fecha del viaje → no sale.
 */
import type { CausaBloqueo } from './despachos';

export type EstadoDocumento = 'vencido' | 'por_vencer' | 'vigente';

export interface DocumentoFlota {
  id: string;
  tipo: CausaBloqueo;
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

/** Un documento por cada fecha registrada; sin fecha no hay documento que vigilar. */
export function documentosFlota(vehiculos: readonly VehiculoConFechas[], conductores: readonly ConductorConFechas[], hoy: string): DocumentoFlota[] {
  const out: DocumentoFlota[] = [];
  const agregar = (d: Omit<DocumentoFlota, 'dias' | 'estado' | 'id'>) => {
    const dias = diasEntre(hoy, d.vence);
    if (!Number.isFinite(dias)) return;
    out.push({ ...d, id: `${d.de}:${d.duenoId}:${d.tipo}`, dias, estado: estadoDocumento(dias) });
  };
  for (const v of vehiculos) {
    const fechas: [CausaBloqueo, string | null][] = [
      ['soat', v.soat_expiry],
      ['tecnomecanica', v.techno_expiry],
      ['poliza', v.insurance_expiry],
      ['tarjeta_operacion', v.operating_card_expiry],
    ];
    for (const [tipo, vence] of fechas) if (vence) agregar({ tipo, de: 'vehiculo', duenoId: v.id, nombre: v.plate, detalle: v.vehicle_type, vence });
  }
  for (const c of conductores) {
    const fechas: [CausaBloqueo, string | null][] = [
      ['licencia', c.license_expiry],
      ['examen_medico', c.medical_certificate_expiry],
    ];
    for (const [tipo, vence] of fechas) if (vence) agregar({ tipo, de: 'conductor', duenoId: c.id, nombre: c.full_name?.trim() || '—', detalle: c.license_category, vence });
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
  };
}

/** CSV de la selección (separador `;` y BOM para que Excel en español lo abra bien). */
export function documentosACsv(docs: readonly DocumentoFlota[], encabezados: readonly string[], fila: (d: DocumentoFlota) => readonly string[]): string {
  const celda = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿' + [encabezados, ...docs.map(fila)].map((f) => f.map(celda).join(';')).join('\r\n');
}
