/**
 * Catálogo común › Importar desde Excel (Figma «23 Transporte» 2972:21818): plantilla, archivo,
 * revisión por fila e importar. Puro.
 *
 * Es la lógica que vivía dentro de `ImportVehiclesDialog` e `ImportDriversDialog` (mismas columnas y
 * mismas reglas), sacada de los componentes para revisarla fila por fila y probarla. Suma:
 * - Excel además de CSV (lo lee `leerLibro`, el lector común de los importadores) y «;» como
 *   separador (el que exportan las listas).
 * - Fechas de Excel (número de serie) a AAAA-MM-DD.
 * - Lo que ya existe (misma placa; mismo empleo) se ACTUALIZA en vez de fallar por duplicado.
 * - El externo (sin empleo, con `full_name`) también se importa.
 */
import type { Matriz } from '@/lib/importacion/libro';
import { CATEGORIAS_LICENCIA, ESTADOS_VEHICULO, TIPOS_VEHICULO } from './catalogoComun';
import { TIPOS_SANGRE, TIPOS_VEHICULO_PERSONA, clavePlaca, normalizarPlaca } from './formulariosCatalogo';

export const COLUMNAS_VEHICULOS = [
  'plate', 'vehicle_type', 'brand', 'model', 'year', 'color', 'capacity_kg', 'capacity_m3', 'passenger_capacity', 'vin',
  'soat_expiry', 'techno_expiry', 'insurance_expiry', 'operating_card_expiry', 'status', 'is_active',
] as const;
export const EJEMPLO_VEHICULOS = ['ABC-123', 'truck', 'Toyota', 'Hilux', '2023', 'Blanco', '1000', '10', '', '1HGBH41JXMN109186', '2027-12-31', '2027-06-30', '2027-12-31', '2027-12-31', 'available', 'true'];

export const COLUMNAS_CONDUCTORES = [
  'employment_id', 'full_name', 'phone', 'document_type', 'document_number', 'vehicle_type',
  'license_number', 'license_category', 'license_expiry', 'license_restrictions', 'medical_certificate_expiry',
  'hazmat_certified', 'passenger_certified', 'emergency_contact_name', 'emergency_contact_phone', 'blood_type', 'is_active',
] as const;
export const EJEMPLO_CONDUCTORES = ['uuid-del-empleo', '', '', '', '', 'car', 'ABC123456', 'C1', '2027-12-31', '', '2027-06-30', 'false', 'false', 'Contacto', '3001234567', 'O+', 'true'];

/** CSV de la plantilla (separador «,», como la de siempre). */
export function plantillaCsv(columnas: readonly string[], ejemplo: readonly string[]): string {
  return [columnas.join(','), ejemplo.join(',')].join('\n');
}

/** Matriz de la hoja → registros por encabezado (en minúsculas). `fila` es la del archivo (1 = encabezados). */
export function registrosDesdeMatriz(matriz: Matriz): { fila: number; datos: Record<string, string> }[] {
  if (matriz.length < 2) return [];
  const cab = (matriz[0] ?? []).map((h) => String(h ?? '').trim().toLowerCase());
  const out: { fila: number; datos: Record<string, string> }[] = [];
  for (let i = 1; i < matriz.length; i += 1) {
    const r = matriz[i] ?? [];
    if (r.every((c) => c === null || c === undefined || String(c).trim() === '')) continue;
    const datos: Record<string, string> = {};
    cab.forEach((h, j) => {
      if (h) datos[h] = celda(r[j]);
    });
    out.push({ fila: i + 1, datos });
  }
  return out;
}

function celda(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  return String(v).trim();
}

/** Encabezados que faltan entre los obligatorios. */
export function faltantes(matriz: Matriz, obligatorias: readonly string[]): string[] {
  const cab = new Set((matriz[0] ?? []).map((h) => String(h ?? '').trim().toLowerCase()));
  return obligatorias.filter((c) => !cab.has(c));
}

/** Fecha de una celda: AAAA-MM-DD, o número de serie de Excel. `null` vacía; `undefined` inválida. */
export function fechaCelda(v: string): string | null | undefined {
  const s = v.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{1,3}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [d, m, a] = s.split('/').map(Number);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return undefined;
  }
  if (/^\d{4,6}(\.\d+)?$/.test(s)) {
    // Excel cuenta días desde 1899-12-30 (con el 29-feb-1900 inexistente incluido).
    // Es un día del calendario (sin hora ni zona): se arma con las partes UTC del mismo instante.
    const fecha = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86_400_000);
    return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}-${String(fecha.getUTCDate()).padStart(2, '0')}`;
  }
  return undefined;
}

const bool = (v: string, porDefecto: boolean) => {
  const s = v.trim().toLowerCase();
  if (!s) return porDefecto;
  return ['true', '1', 'si', 'sí', 'yes', 'x'].includes(s);
};
const num = (v: string): number | null | undefined => {
  const s = v.trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

export type CodigoErrorImportacion =
  | 'placaVacia'
  | 'tipoInvalido'
  | 'estadoInvalido'
  | 'numeroInvalido'
  | 'fechaInvalida'
  | 'placaRepetida'
  | 'identidadFaltante'
  | 'licenciaIncompleta'
  | 'categoriaInvalida'
  | 'sangreInvalida'
  | 'empleoRepetido';

export interface FilaImportacion {
  fila: number;
  estado: 'nuevo' | 'existe' | 'error';
  /** Placa o nombre / licencia: para mostrar. */
  etiqueta: string;
  /** Id del registro que se actualiza (`existe`). */
  id?: string;
  datos?: Record<string, unknown>;
  error?: { codigo: CodigoErrorImportacion; campo?: string; valor?: string };
}

export function resumenImportacion(filas: readonly FilaImportacion[]) {
  return {
    nuevos: filas.filter((f) => f.estado === 'nuevo').length,
    existen: filas.filter((f) => f.estado === 'existe').length,
    errores: filas.filter((f) => f.estado === 'error').length,
  };
}

/** `existentes`: `clavePlaca` → id del vehículo de la organización. */
export function analizarVehiculos(registros: readonly { fila: number; datos: Record<string, string> }[], existentes: ReadonlyMap<string, string>): FilaImportacion[] {
  const vistas = new Set<string>();
  return registros.map(({ fila, datos: r }) => {
    const plate = normalizarPlaca(r.plate ?? '');
    const etiqueta = plate || '—';
    const error = (codigo: CodigoErrorImportacion, campo?: string, valor?: string): FilaImportacion => ({ fila, estado: 'error', etiqueta, error: { codigo, campo, valor } });
    if (!plate) return error('placaVacia', 'plate');
    const clave = clavePlaca(plate);
    if (vistas.has(clave)) return error('placaRepetida', 'plate', plate);
    vistas.add(clave);
    const tipo = (r.vehicle_type ?? '').trim().toLowerCase();
    if (!(TIPOS_VEHICULO as readonly string[]).includes(tipo)) return error('tipoInvalido', 'vehicle_type', r.vehicle_type);
    const estado = (r.status ?? '').trim().toLowerCase() || 'available';
    if (!(ESTADOS_VEHICULO as readonly string[]).includes(estado)) return error('estadoInvalido', 'status', r.status);
    const datos: Record<string, unknown> = { plate, vehicle_type: tipo, status: estado, is_active: bool(r.is_active ?? '', true) };
    for (const c of ['brand', 'model', 'color', 'vin'] as const) if ((r[c] ?? '').trim()) datos[c] = r[c].trim();
    for (const c of ['year', 'capacity_kg', 'capacity_m3', 'passenger_capacity'] as const) {
      const n = num(r[c] ?? '');
      if (n === undefined) return error('numeroInvalido', c, r[c]);
      if (n !== null) datos[c] = c === 'year' || c === 'passenger_capacity' ? Math.round(n) : n;
    }
    for (const c of ['soat_expiry', 'techno_expiry', 'insurance_expiry', 'operating_card_expiry'] as const) {
      const f = fechaCelda(r[c] ?? '');
      if (f === undefined) return error('fechaInvalida', c, r[c]);
      if (f) datos[c] = f;
    }
    const id = existentes.get(clave);
    return { fila, estado: id ? 'existe' : 'nuevo', etiqueta, id, datos };
  });
}

/** `existentes`: `employment_id` → id de la credencial de la organización. */
export function analizarConductores(registros: readonly { fila: number; datos: Record<string, string> }[], existentes: ReadonlyMap<string, string>): FilaImportacion[] {
  const vistos = new Set<string>();
  return registros.map(({ fila, datos: r }) => {
    const empleo = (r.employment_id ?? '').trim();
    const nombre = (r.full_name ?? '').trim().replace(/\s+/g, ' ');
    const licencia = (r.license_number ?? '').trim();
    const etiqueta = nombre || licencia || empleo || '—';
    const error = (codigo: CodigoErrorImportacion, campo?: string, valor?: string): FilaImportacion => ({ fila, estado: 'error', etiqueta, error: { codigo, campo, valor } });
    if (!empleo && !nombre) return error('identidadFaltante', 'employment_id');
    if (empleo) {
      if (vistos.has(empleo)) return error('empleoRepetido', 'employment_id', empleo);
      vistos.add(empleo);
    }
    const categoria = (r.license_category ?? '').trim().toUpperCase();
    const vence = fechaCelda(r.license_expiry ?? '');
    if (vence === undefined) return error('fechaInvalida', 'license_expiry', r.license_expiry);
    // Con empleo, la licencia es obligatoria (la regla del importador de siempre); sin empleo, si se empieza se completa.
    if ((empleo || licencia || categoria || vence) && !(licencia && categoria && vence)) return error('licenciaIncompleta', 'license_number');
    if (categoria && !(CATEGORIAS_LICENCIA as readonly string[]).includes(categoria)) return error('categoriaInvalida', 'license_category', r.license_category);
    const examen = fechaCelda(r.medical_certificate_expiry ?? '');
    if (examen === undefined) return error('fechaInvalida', 'medical_certificate_expiry', r.medical_certificate_expiry);
    const sangre = (r.blood_type ?? '').trim().toUpperCase();
    if (sangre && !(TIPOS_SANGRE as readonly string[]).includes(sangre)) return error('sangreInvalida', 'blood_type', r.blood_type);
    const tipo = (r.vehicle_type ?? '').trim().toLowerCase();
    if (tipo && !(TIPOS_VEHICULO_PERSONA as readonly string[]).includes(tipo)) return error('tipoInvalido', 'vehicle_type', r.vehicle_type);
    const datos: Record<string, unknown> = {
      license_number: licencia || null,
      license_category: categoria || null,
      license_expiry: vence ?? null,
      license_restrictions: (r.license_restrictions ?? '').trim() || null,
      medical_certificate_expiry: examen ?? null,
      hazmat_certified: bool(r.hazmat_certified ?? '', false),
      passenger_certified: bool(r.passenger_certified ?? '', false),
      emergency_contact_name: (r.emergency_contact_name ?? '').trim() || null,
      emergency_contact_phone: (r.emergency_contact_phone ?? '').trim() || null,
      blood_type: sangre || null,
      is_active: bool(r.is_active ?? '', true),
    };
    if (tipo) datos.vehicle_type = tipo;
    if (empleo) datos.employment_id = empleo;
    else {
      datos.employment_id = null;
      datos.is_external = true;
      datos.full_name = nombre;
      if ((r.phone ?? '').trim()) datos.phone = r.phone.trim();
      const doc = (r.document_number ?? '').replace(/[.\s-]/g, '').toUpperCase();
      if (doc) {
        datos.document_number = doc;
        datos.document_type = (r.document_type ?? '').trim().toUpperCase() || 'CC';
      }
    }
    const id = empleo ? existentes.get(empleo) : undefined;
    return { fila, estado: id ? 'existe' : 'nuevo', etiqueta, id, datos };
  });
}
