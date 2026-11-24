/**
 * Catálogo común (Figma «23 Transporte» › 20, 2905:15548): Vehículos y Conductores y domiciliarios,
 * una sola tabla vista desde Logística y desde Transporte. Puro (sin red ni React).
 *
 * El estado de los documentos sale de `documentosFlota` (la misma regla de Transporte › Flota y del
 * bloqueo de despacho): por cada dueño se toma el peor documento, que es el primero porque
 * `documentosFlota` ordena por días.
 *
 * Lo que el diseño pide y la base no tiene (verificado con el MCP, 2026-11-24): la columna y el
 * filtro «Uso» (Logística, Transporte, Ambos) no existen en `vehicles` ni en `driver_credentials`.
 */
import type { Vehicle } from '@/lib/services/transportService';
import type { PersonaCatalogo } from '@/lib/services/transporte/catalogoComunService';
import type { DocumentoFlota, EstadoDocumento } from './documentosFlota';

export type Modulo = 'logistica' | 'transporte';

/** De qué menú se abrió la página (la misma pantalla vive en las dos rutas). */
export function moduloDeRuta(pathname: string | null | undefined): Modulo {
  return pathname?.startsWith('/app/logistica') ? 'logistica' : 'transporte';
}

export const RUTAS_CATALOGO: Record<Modulo, { inicio: string; vehiculos: string; conductores: string }> = {
  logistica: { inicio: '/app/logistica', vehiculos: '/app/logistica/vehiculos', conductores: '/app/logistica/conductores' },
  transporte: { inicio: '/app/transporte/viajes', vehiculos: '/app/transporte/vehiculos', conductores: '/app/transporte/conductores' },
};

/** Ficha de un vehículo o de una persona, bajo la misma ruta desde la que se abrió la lista. */
export function rutaFicha(modulo: Modulo, de: 'vehiculo' | 'persona', id: string): string {
  return `${de === 'vehiculo' ? RUTAS_CATALOGO[modulo].vehiculos : RUTAS_CATALOGO[modulo].conductores}/${encodeURIComponent(id)}`;
}

// ── Documentos ─────────────────────────────────────────────────────────────

export type EstadoDocs = EstadoDocumento | 'sin_fecha';

export interface ResumenDocs {
  estado: EstadoDocs;
  /** Documento que manda (el peor). */
  tipo: string | null;
  vence: string | null;
  dias: number | null;
}

export const SIN_DOCS: ResumenDocs = { estado: 'sin_fecha', tipo: null, vence: null, dias: null };

/** Peor documento por dueño, con clave `vehiculo:<id>` o `conductor:<id>[:<tipo>]`. */
export function resumenDocumentos(docs: readonly DocumentoFlota[]): Map<string, ResumenDocs> {
  const out = new Map<string, ResumenDocs>();
  const poner = (clave: string, d: DocumentoFlota) => {
    const actual = out.get(clave);
    if (!actual || (actual.dias ?? Infinity) > d.dias) out.set(clave, { estado: d.estado, tipo: d.tipo, vence: d.vence, dias: d.dias });
  };
  for (const d of docs) {
    poner(`${d.de}:${d.duenoId}`, d);
    poner(`${d.de}:${d.duenoId}:${d.tipo}`, d);
  }
  return out;
}

export const TONO_DOCS = { vencido: 'peligro', por_vencer: 'advertencia', vigente: 'exito', sin_fecha: 'neutro' } as const;

// ── Vehículos ──────────────────────────────────────────────────────────────

export const TIPOS_VEHICULO = ['motorcycle', 'car', 'van', 'truck', 'minibus', 'bus', 'trailer', 'boat', 'yacht', 'other'] as const;
export const ESTADOS_VEHICULO = ['available', 'in_use', 'maintenance', 'inactive'] as const;
export type EstadoVehiculo = (typeof ESTADOS_VEHICULO)[number];
export const FILTROS_DOCS = ['vencido', 'por_vencer', 'vigente', 'sin_fecha'] as const;

export const TONO_ESTADO_VEHICULO: Record<EstadoVehiculo, 'exito' | 'informacion' | 'advertencia' | 'neutro'> = {
  available: 'exito',
  in_use: 'informacion',
  maintenance: 'advertencia',
  inactive: 'neutro',
};

export interface FilaVehiculo {
  id: string;
  placa: string;
  tipo: string;
  marcaModelo: string;
  anio: number | null;
  pasajeros: number | null;
  kg: number | null;
  m3: number | null;
  conductor: { nombre: string; cargo: string | null; externo: boolean } | null;
  /** `vehicles.current_driver_id` (auth.users) sin persona en el catálogo. */
  conductorDesconocido: boolean;
  estado: EstadoVehiculo;
  activo: boolean;
  transportadoraId: string | null;
  transportadora: string | null;
  sede: string | null;
  docs: ResumenDocs;
  vehiculo: Vehicle;
}

export function filasVehiculos(vehiculos: readonly Vehicle[], personas: readonly PersonaCatalogo[], docs: Map<string, ResumenDocs>): FilaVehiculo[] {
  const porUsuario = new Map(personas.filter((p) => p.userId).map((p) => [p.userId as string, p]));
  return vehiculos.map((v) => {
    const p = v.current_driver_id ? porUsuario.get(v.current_driver_id) : undefined;
    const estado = (ESTADOS_VEHICULO as readonly string[]).includes(v.status) ? v.status : 'inactive';
    return {
      id: v.id,
      placa: v.plate,
      tipo: v.vehicle_type,
      marcaModelo: [v.brand, v.model].filter(Boolean).join(' '),
      anio: v.year ?? null,
      pasajeros: v.passenger_capacity ?? null,
      kg: v.capacity_kg != null ? Number(v.capacity_kg) : null,
      m3: v.capacity_m3 != null ? Number(v.capacity_m3) : null,
      conductor: p ? { nombre: p.nombre, cargo: p.cargo, externo: p.externo } : null,
      conductorDesconocido: !!v.current_driver_id && !p,
      estado,
      activo: v.is_active !== false,
      transportadoraId: v.carrier_id ?? null,
      transportadora: v.transport_carriers?.name ?? null,
      sede: v.branches?.name ?? null,
      docs: docs.get(`vehiculo:${v.id}`) ?? SIN_DOCS,
      vehiculo: v,
    };
  });
}

export interface FiltrosVehiculos {
  busqueda: string;
  tipo: string | null;
  estado: string | null;
  transportadora: string | null;
  documentos: string | null;
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrarVehiculos(filas: readonly FilaVehiculo[], f: FiltrosVehiculos): FilaVehiculo[] {
  const q = normalizar(f.busqueda.trim());
  return filas.filter(
    (v) =>
      (!f.tipo || v.tipo === f.tipo) &&
      (!f.estado || v.estado === f.estado) &&
      (!f.transportadora || v.transportadoraId === f.transportadora) &&
      (!f.documentos || v.docs.estado === f.documentos) &&
      (!q || [v.placa, v.marcaModelo, v.conductor?.nombre ?? '', v.vehiculo.vin ?? '', v.transportadora ?? ''].some((x) => normalizar(x).includes(q))),
  );
}

export interface KpisVehiculos {
  total: number;
  inactivos: number;
  disponibles: number;
  enUso: number;
  mantenimiento: number;
  placasMantenimiento: string[];
  /** Disponibles con algún documento vencido: no salen a despacho. */
  disponiblesBloqueados: number;
  docsVencidos: number;
  docsPorVencer: number;
}

export function kpisVehiculos(filas: readonly FilaVehiculo[]): KpisVehiculos {
  const de = (e: EstadoVehiculo) => filas.filter((v) => v.estado === e);
  const disponibles = de('available');
  const mantenimiento = de('maintenance');
  return {
    total: filas.length,
    inactivos: de('inactive').length,
    disponibles: disponibles.length,
    enUso: de('in_use').length,
    mantenimiento: mantenimiento.length,
    placasMantenimiento: mantenimiento.map((v) => v.placa),
    disponiblesBloqueados: disponibles.filter((v) => v.docs.estado === 'vencido').length,
    docsVencidos: filas.filter((v) => v.docs.estado === 'vencido').length,
    docsPorVencer: filas.filter((v) => v.docs.estado === 'por_vencer').length,
  };
}

// ── Conductores y domiciliarios ────────────────────────────────────────────

export const ESTADOS_PERSONA = ['activo', 'inactivo'] as const;
export const FILTROS_VEHICULO_PERSONA = ['con', 'sin'] as const;
export const CATEGORIAS_LICENCIA = ['A1', 'A2', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'] as const;
/** Valor del filtro «Cargo» para quien no tiene empleo (domiciliario externo). */
export const CARGO_EXTERNO = '__externo__';
export const CARGO_SIN = '__sin_cargo__';

export interface FilaConductor {
  id: string;
  nombre: string;
  documentoTipo: string | null;
  documento: string | null;
  telefono: string | null;
  cargo: string | null;
  externo: boolean;
  licenciaCategoria: string | null;
  licencia: ResumenDocs;
  examen: ResumenDocs;
  /** Peor de licencia y examen. */
  docs: ResumenDocs;
  vehiculo: { id: string; placa: string; tipo: string } | null;
  activo: boolean;
  persona: PersonaCatalogo;
}

export function filasConductores(personas: readonly PersonaCatalogo[], vehiculos: readonly Vehicle[], docs: Map<string, ResumenDocs>): FilaConductor[] {
  const porUsuario = new Map<string, Vehicle>();
  for (const v of vehiculos) if (v.current_driver_id && v.is_active !== false && !porUsuario.has(v.current_driver_id)) porUsuario.set(v.current_driver_id, v);
  return personas.map((p) => {
    const v = p.userId ? porUsuario.get(p.userId) : undefined;
    return {
      id: p.id,
      nombre: p.nombre,
      documentoTipo: p.documentoTipo,
      documento: p.documento,
      telefono: p.telefono,
      cargo: p.cargo,
      externo: p.externo,
      licenciaCategoria: p.licenciaCategoria,
      licencia: docs.get(`conductor:${p.id}:licencia`) ?? SIN_DOCS,
      examen: docs.get(`conductor:${p.id}:examen_medico`) ?? SIN_DOCS,
      docs: docs.get(`conductor:${p.id}`) ?? SIN_DOCS,
      vehiculo: v ? { id: v.id, placa: v.plate, tipo: v.vehicle_type } : null,
      activo: p.activo,
      persona: p,
    };
  });
}

/** Clave del filtro «Cargo» de una persona. */
export function claveCargo(f: Pick<FilaConductor, 'cargo' | 'externo'>): string {
  return f.cargo ?? (f.externo ? CARGO_EXTERNO : CARGO_SIN);
}

/** Cargos presentes en la lista, ordenados (los de Recursos humanos primero). */
export function cargosDe(filas: readonly FilaConductor[]): string[] {
  const set = new Set(filas.map(claveCargo));
  const reales = [...set].filter((c) => c !== CARGO_EXTERNO && c !== CARGO_SIN).sort((a, b) => a.localeCompare(b, 'es'));
  return [...reales, ...[CARGO_EXTERNO, CARGO_SIN].filter((c) => set.has(c))];
}

export interface FiltrosConductores {
  busqueda: string;
  cargo: string | null;
  estado: string | null;
  categoria: string | null;
  documentos: string | null;
  vehiculo: string | null;
}

export function filtrarConductores(filas: readonly FilaConductor[], f: FiltrosConductores): FilaConductor[] {
  const q = normalizar(f.busqueda.trim());
  return filas.filter(
    (c) =>
      (!f.cargo || claveCargo(c) === f.cargo) &&
      (!f.estado || (f.estado === 'activo') === c.activo) &&
      (!f.categoria || c.licenciaCategoria === f.categoria) &&
      (!f.documentos || c.docs.estado === f.documentos) &&
      (!f.vehiculo || (f.vehiculo === 'con') === !!c.vehiculo) &&
      (!q || [c.nombre, c.documento ?? '', c.telefono ?? '', c.vehiculo?.placa ?? '', c.cargo ?? '', c.persona.licenciaNumero ?? ''].some((x) => normalizar(x).includes(q))),
  );
}

export interface KpisConductores {
  total: number;
  activos: number;
  inactivos: number;
  externos: number;
  docsVencidos: number;
  docsPorVencer: number;
  conVehiculo: number;
  sinVehiculo: number;
  sinLicencia: number;
}

export function kpisConductores(filas: readonly FilaConductor[]): KpisConductores {
  const activos = filas.filter((c) => c.activo);
  return {
    total: filas.length,
    activos: activos.length,
    inactivos: filas.length - activos.length,
    externos: filas.filter((c) => c.externo).length,
    docsVencidos: filas.filter((c) => c.docs.estado === 'vencido').length,
    docsPorVencer: filas.filter((c) => c.docs.estado === 'por_vencer').length,
    conVehiculo: activos.filter((c) => !!c.vehiculo).length,
    sinVehiculo: activos.filter((c) => !c.vehiculo).length,
    sinLicencia: activos.filter((c) => c.licencia.estado === 'sin_fecha').length,
  };
}

/** CSV con separador `;` y BOM: el mismo formato que exporta Flota (`documentosACsv`). */
export function aCsv<T>(filas: readonly T[], encabezados: readonly string[], fila: (x: T) => readonly string[]): string {
  const celda = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿' + [encabezados, ...filas.map(fila)].map((f) => f.map(celda).join(';')).join('\r\n');
}
