/**
 * Catálogo común › formularios y diálogos (Figma «23 Transporte» › sección 25, 2970:20718; nota
 * 2972:21942). Puro (sin red ni React): estado de los formularios de vehículo y de persona, su
 * validación, lo que se escribe en la base (solo columnas reales, verificadas con el MCP el
 * 2026-11-24), quién puede manejar qué vehículo y la bitácora de cambios del vehículo.
 *
 * - `vehicles`: plate, vehicle_type (CHECK de 10 tipos), brand, model, year, color, vin,
 *   capacity_kg, capacity_m3, passenger_capacity, seat_map_id, branch_id, carrier_id,
 *   current_driver_id (→ auth.users), status (CHECK), is_active, soat_expiry, techno_expiry,
 *   insurance_expiry, operating_card_expiry (date) y metadata (jsonb).
 * - `driver_credentials`: employment_id (único), user_id (único por organización), full_name,
 *   phone, document_type, document_number, is_external, vehicle_type (CHECK motorcycle, bicycle,
 *   car, van, on_foot, other), license_* (license_category con CHECK A1…C3), medical_certificate_expiry,
 *   blood_type (CHECK), passenger_certified, hazmat_certified, emergency_contact_*, is_active,
 *   branch_id y metadata. Sin empleo exige `full_name` (driver_credentials_identidad_check).
 */
import type { Vehicle } from '@/lib/services/transportService';
import { TIPOS_DOCUMENTO as TIPOS_DOCUMENTO_PERSONA, TIPOS_VEHICULO as TIPOS_VEHICULO_PERSONA, normalizarDocumento } from '@/lib/logistica/domiciliarios';
import { CATEGORIAS_LICENCIA, ESTADOS_VEHICULO, TIPOS_VEHICULO } from './catalogoComun';
import { diasEntre, estadoDocumento } from './documentosFlota';

export { TIPOS_DOCUMENTO_PERSONA, TIPOS_VEHICULO_PERSONA };
export const TIPOS_SANGRE = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

const limpio = (s: string | null | undefined) => {
  const v = (s ?? '').trim().replace(/\s+/g, ' ');
  return v ? v : null;
};
const numero = (s: string): number | null => {
  const v = s.trim().replace(/\s/g, '').replace(',', '.');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
/** AAAA-MM-DD que existe en el calendario (2027-13-40 no). */
const esFecha = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
};

/** Placa sin espacios dobles y en mayúsculas («wnp 103» → «WNP 103»). */
export function normalizarPlaca(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toUpperCase();
}
/** Clave para comparar placas: sin espacios ni guiones. */
export const clavePlaca = (s: string) => normalizarPlaca(s).replace(/[\s-]/g, '');

// ── Vehículo ───────────────────────────────────────────────────────────────

export const FECHAS_VEHICULO = ['soat_expiry', 'techno_expiry', 'insurance_expiry', 'operating_card_expiry'] as const;
export type FechaVehiculo = (typeof FECHAS_VEHICULO)[number];
/** Tipo de documento de Flota de cada fecha de siempre. */
export const DOCUMENTO_DE_FECHA: Record<FechaVehiculo, 'soat' | 'tecnomecanica' | 'poliza' | 'tarjeta_operacion'> = {
  soat_expiry: 'soat',
  techno_expiry: 'tecnomecanica',
  insurance_expiry: 'poliza',
  operating_card_expiry: 'tarjeta_operacion',
};

export interface FormVehiculo {
  plate: string;
  vehicle_type: string;
  brand: string;
  model: string;
  year: string;
  color: string;
  vin: string;
  capacity_kg: string;
  capacity_m3: string;
  passenger_capacity: string;
  seat_map_id: string | null;
  branch_id: number | null;
  carrier_id: string | null;
  current_driver_id: string | null;
  status: string;
  is_active: boolean;
  soat_expiry: string;
  techno_expiry: string;
  insurance_expiry: string;
  operating_card_expiry: string;
}

type VehiculoBase = Vehicle & { seat_map_id?: string | null; vin?: string | null };

export function vehiculoAFormulario(v: VehiculoBase | null, opciones: { sede: number | null; duplicar?: boolean } = { sede: null }): FormVehiculo {
  const txt = (x: unknown) => (x === null || x === undefined ? '' : String(x));
  if (!v) {
    return {
      plate: '', vehicle_type: 'car', brand: '', model: '', year: '', color: '', vin: '', capacity_kg: '', capacity_m3: '', passenger_capacity: '',
      seat_map_id: null, branch_id: opciones.sede, carrier_id: null, current_driver_id: null, status: 'available', is_active: true,
      soat_expiry: '', techno_expiry: '', insurance_expiry: '', operating_card_expiry: '',
    };
  }
  const dup = !!opciones.duplicar;
  return {
    // Duplicar copia el modelo, no la identidad: placa, VIN, conductor y fechas quedan vacíos.
    plate: dup ? '' : txt(v.plate),
    vehicle_type: txt(v.vehicle_type) || 'car',
    brand: txt(v.brand),
    model: txt(v.model),
    year: txt(v.year),
    color: txt(v.color),
    vin: dup ? '' : txt(v.vin),
    capacity_kg: txt(v.capacity_kg),
    capacity_m3: txt(v.capacity_m3),
    passenger_capacity: txt(v.passenger_capacity),
    seat_map_id: v.seat_map_id ?? null,
    branch_id: v.branch_id ?? opciones.sede,
    carrier_id: v.carrier_id ?? null,
    current_driver_id: dup ? null : v.current_driver_id ?? null,
    status: dup ? 'available' : (ESTADOS_VEHICULO as readonly string[]).includes(v.status) ? v.status : 'available',
    is_active: dup ? true : v.is_active !== false,
    soat_expiry: dup ? '' : txt(v.soat_expiry),
    techno_expiry: dup ? '' : txt(v.techno_expiry),
    insurance_expiry: dup ? '' : txt(v.insurance_expiry),
    operating_card_expiry: dup ? '' : txt(v.operating_card_expiry),
  };
}

export type ErrorCampo = 'requerido' | 'duplicada' | 'invalido' | 'incompleta';
export type ErroresVehiculo = Partial<Record<keyof FormVehiculo, ErrorCampo>>;

/** `placas`: claves (`clavePlaca`) de las OTRAS placas de la organización. */
export function validarVehiculo(f: FormVehiculo, placas: ReadonlySet<string>, anioMaximo: number): ErroresVehiculo {
  const e: ErroresVehiculo = {};
  if (!normalizarPlaca(f.plate)) e.plate = 'requerido';
  else if (placas.has(clavePlaca(f.plate))) e.plate = 'duplicada';
  if (!(TIPOS_VEHICULO as readonly string[]).includes(f.vehicle_type)) e.vehicle_type = 'requerido';
  if (f.year.trim()) {
    const a = numero(f.year);
    if (a === null || !Number.isInteger(a) || a < 1900 || a > anioMaximo) e.year = 'invalido';
  }
  for (const c of ['capacity_kg', 'capacity_m3'] as const) {
    const n = numero(f[c]);
    if (n !== null && (!Number.isFinite(n) || n < 0)) e[c] = 'invalido';
  }
  const p = numero(f.passenger_capacity);
  if (p !== null && (!Number.isInteger(p) || p < 0)) e.passenger_capacity = 'invalido';
  for (const c of FECHAS_VEHICULO) if (f[c] && !esFecha(f[c])) e[c] = 'invalido';
  if (!(ESTADOS_VEHICULO as readonly string[]).includes(f.status)) e.status = 'requerido';
  return e;
}

/** Lo que se escribe en `vehicles` (la organización la pone quien guarda, de la sesión). */
export function formularioAVehiculo(f: FormVehiculo): Record<string, unknown> {
  const n = (s: string) => {
    const v = numero(s);
    return v === null || !Number.isFinite(v) ? null : v;
  };
  return {
    plate: normalizarPlaca(f.plate),
    vehicle_type: f.vehicle_type,
    brand: limpio(f.brand),
    model: limpio(f.model),
    year: n(f.year),
    color: limpio(f.color),
    vin: limpio(f.vin)?.toUpperCase() ?? null,
    capacity_kg: n(f.capacity_kg),
    capacity_m3: n(f.capacity_m3),
    passenger_capacity: n(f.passenger_capacity),
    seat_map_id: f.seat_map_id || null,
    branch_id: f.branch_id || null,
    carrier_id: f.carrier_id || null,
    current_driver_id: f.current_driver_id || null,
    status: f.status,
    is_active: f.is_active,
    soat_expiry: f.soat_expiry || null,
    techno_expiry: f.techno_expiry || null,
    insurance_expiry: f.insurance_expiry || null,
    operating_card_expiry: f.operating_card_expiry || null,
  };
}

// ── Quién puede manejar qué ────────────────────────────────────────────────

/**
 * Categorías de licencia (Colombia) que sirven para cada tipo de vehículo. `null`: el tipo no pide
 * licencia de tránsito (embarcaciones y «otro»). Los vehículos de pasajeros van con licencia de
 * servicio público (C2 o C3 para bus, como en el diseño 2972:21658).
 */
export const CATEGORIAS_POR_TIPO: Record<string, readonly string[] | null> = {
  motorcycle: ['A1', 'A2'],
  car: ['B1', 'B2', 'B3', 'C1', 'C2', 'C3'],
  van: ['B1', 'B2', 'B3', 'C1', 'C2', 'C3'],
  minibus: ['C1', 'C2', 'C3'],
  bus: ['C2', 'C3'],
  truck: ['B2', 'B3', 'C2', 'C3'],
  trailer: ['B3', 'C3'],
  boat: null,
  yacht: null,
  other: null,
};

export type MotivoNoApto = 'sinUsuario' | 'inactivo' | 'sinLicencia' | 'vencida' | 'categoria';

export interface CandidatoConductor {
  apto: boolean;
  motivo: MotivoNoApto | null;
  /** Días para que venza la licencia (null sin fecha). */
  dias: number | null;
  porVencer: boolean;
}

export function evaluarConductor(
  p: { userId: string | null; activo: boolean; licenciaCategoria: string | null; licenciaVence: string | null },
  tipoVehiculo: string,
  hoy: string,
): CandidatoConductor {
  const categorias = CATEGORIAS_POR_TIPO[tipoVehiculo] ?? null;
  const dias = p.licenciaVence ? diasEntre(hoy, p.licenciaVence) : null;
  const diasOk = dias !== null && Number.isFinite(dias) ? dias : null;
  const porVencer = diasOk !== null && estadoDocumento(diasOk) === 'por_vencer';
  const no = (motivo: MotivoNoApto): CandidatoConductor => ({ apto: false, motivo, dias: diasOk, porVencer });
  if (!p.userId) return no('sinUsuario');
  if (!p.activo) return no('inactivo');
  if (categorias) {
    if (!p.licenciaCategoria || diasOk === null) return no('sinLicencia');
    if (diasOk < 0) return no('vencida');
    if (!categorias.includes(p.licenciaCategoria)) return no('categoria');
  }
  return { apto: true, motivo: null, dias: diasOk, porVencer };
}

// ── Bitácora del vehículo (metadata.bitacora) ──────────────────────────────

/**
 * No hay tabla de auditoría de vehículos: los cambios de estado y de conductor hechos desde estas
 * pantallas se anotan en `vehicles.metadata.bitacora` (jsonb existente), con un tope. Lo que cambie
 * por otros caminos (el despacho pone «En uso») no queda aquí.
 */
export interface EntradaBitacora {
  tipo: 'estado' | 'conductor';
  de: string | null;
  a: string | null;
  motivo?: string | null;
  at: string;
}
export const MAX_BITACORA = 30;

export function leerBitacora(metadata: unknown): EntradaBitacora[] {
  const b = (metadata as { bitacora?: unknown } | null)?.bitacora;
  if (!Array.isArray(b)) return [];
  return b.filter(
    (x): x is EntradaBitacora =>
      !!x && typeof x === 'object' && ((x as EntradaBitacora).tipo === 'estado' || (x as EntradaBitacora).tipo === 'conductor') && typeof (x as EntradaBitacora).at === 'string',
  );
}

export function agregarBitacora(metadata: unknown, entrada: EntradaBitacora): Record<string, unknown> {
  const base = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {};
  return { ...base, bitacora: [entrada, ...leerBitacora(base)].slice(0, MAX_BITACORA) };
}

// ── Persona ────────────────────────────────────────────────────────────────

export interface FormPersona {
  modo: 'empleado' | 'externo';
  employment_id: string | null;
  position_id: string | null;
  branch_id: number | null;
  /** Externo: miembro de la organización con cuenta (para «Mis envíos»). */
  user_id: string | null;
  full_name: string;
  document_type: string;
  document_number: string;
  phone: string;
  license_number: string;
  license_category: string | null;
  license_expiry: string;
  license_restrictions: string;
  medical_certificate_expiry: string;
  blood_type: string | null;
  passenger_certified: boolean;
  hazmat_certified: boolean;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  vehicle_type: string | null;
  vehiculo_id: string | null;
  is_active: boolean;
  /** `metadata.certifications` del formulario viejo (texto separado por comas). */
  certificaciones: string;
  cobra_contraentrega: boolean;
}

interface CredencialBase {
  employment_id?: string | null;
  user_id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  document_type?: string | null;
  document_number?: string | null;
  is_external?: boolean;
  vehicle_type?: string | null;
  license_number?: string | null;
  license_category?: string | null;
  license_expiry?: string | null;
  license_restrictions?: string | null;
  medical_certificate_expiry?: string | null;
  blood_type?: string | null;
  passenger_certified?: boolean | null;
  hazmat_certified?: boolean | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  is_active?: boolean | null;
  branch_id?: number | null;
  metadata?: Record<string, unknown> | null;
}

export function personaAFormulario(
  c: CredencialBase | null,
  extra: { positionId?: string | null; vehiculoId?: string | null; sede: number | null; duplicar?: boolean } = { sede: null },
): FormPersona {
  const t = (x: unknown) => (x === null || x === undefined ? '' : String(x));
  const certs = c?.metadata && Array.isArray((c.metadata as { certifications?: unknown }).certifications) ? ((c.metadata as { certifications: unknown[] }).certifications.map(String).join(', ')) : '';
  const cobra = (c?.metadata as { cobra_contraentrega?: unknown } | null | undefined)?.cobra_contraentrega;
  const dup = !!extra.duplicar;
  if (!c) {
    return {
      modo: 'empleado', employment_id: null, position_id: null, branch_id: extra.sede, user_id: null, full_name: '', document_type: 'CC', document_number: '', phone: '',
      license_number: '', license_category: null, license_expiry: '', license_restrictions: '', medical_certificate_expiry: '', blood_type: null,
      passenger_certified: false, hazmat_certified: false, emergency_contact_name: '', emergency_contact_phone: '', vehicle_type: null, vehiculo_id: null,
      is_active: true, certificaciones: '', cobra_contraentrega: true,
    };
  }
  const externo = !c.employment_id;
  return {
    modo: externo ? 'externo' : 'empleado',
    // Duplicar copia la licencia y las certificaciones, no a la persona.
    employment_id: dup ? null : c.employment_id ?? null,
    position_id: dup ? null : extra.positionId ?? null,
    branch_id: c.branch_id ?? extra.sede,
    user_id: dup || !externo ? null : c.user_id ?? null,
    full_name: dup ? '' : t(c.full_name),
    document_type: t(c.document_type) || 'CC',
    document_number: dup ? '' : t(c.document_number),
    phone: dup ? '' : t(c.phone),
    license_number: dup ? '' : t(c.license_number),
    license_category: c.license_category || null,
    license_expiry: dup ? '' : t(c.license_expiry),
    license_restrictions: t(c.license_restrictions),
    medical_certificate_expiry: dup ? '' : t(c.medical_certificate_expiry),
    blood_type: dup ? null : c.blood_type || null,
    passenger_certified: c.passenger_certified === true,
    hazmat_certified: c.hazmat_certified === true,
    emergency_contact_name: dup ? '' : t(c.emergency_contact_name),
    emergency_contact_phone: dup ? '' : t(c.emergency_contact_phone),
    vehicle_type: c.vehicle_type || null,
    vehiculo_id: dup ? null : extra.vehiculoId ?? null,
    is_active: dup ? true : c.is_active !== false,
    certificaciones: certs,
    cobra_contraentrega: cobra === undefined ? true : cobra === true,
  };
}

export type ErroresPersona = Partial<Record<keyof FormPersona, ErrorCampo>>;

/** Sin licencia de tránsito: la bici y a pie. */
export const SIN_LICENCIA = ['bicycle', 'on_foot'];

export function validarPersona(f: FormPersona): ErroresPersona {
  const e: ErroresPersona = {};
  if (f.modo === 'empleado') {
    if (!f.employment_id) e.employment_id = 'requerido';
  } else {
    // Las mismas reglas del alta de Logística › Domiciliarios (`altaDomiciliarioSchema`).
    if ((limpio(f.full_name) ?? '').length < 3) e.full_name = 'requerido';
    if (f.phone.replace(/\D/g, '').length < 7) e.phone = 'requerido';
    if (normalizarDocumento(f.document_number).length < 4) e.document_number = 'requerido';
    if (!f.branch_id) e.branch_id = 'requerido';
  }
  const pideLicencia = f.modo === 'empleado' && !SIN_LICENCIA.includes(f.vehicle_type ?? '');
  const algo = !!(f.license_number.trim() || f.license_category || f.license_expiry);
  if (pideLicencia || algo) {
    if (!f.license_number.trim()) e.license_number = pideLicencia ? 'requerido' : 'incompleta';
    if (!f.license_category) e.license_category = pideLicencia ? 'requerido' : 'incompleta';
    if (!f.license_expiry) e.license_expiry = pideLicencia ? 'requerido' : 'incompleta';
  }
  if (f.license_category && !(CATEGORIAS_LICENCIA as readonly string[]).includes(f.license_category)) e.license_category = 'invalido';
  if (f.license_expiry && !esFecha(f.license_expiry)) e.license_expiry = 'invalido';
  if (f.medical_certificate_expiry && !esFecha(f.medical_certificate_expiry)) e.medical_certificate_expiry = 'invalido';
  if (f.blood_type && !(TIPOS_SANGRE as readonly string[]).includes(f.blood_type)) e.blood_type = 'invalido';
  if (f.vehicle_type && !(TIPOS_VEHICULO_PERSONA as readonly string[]).includes(f.vehicle_type)) e.vehicle_type = 'invalido';
  return e;
}

/**
 * Columnas de `driver_credentials` que escribe el formulario. La identidad (empleo, nombre,
 * documento) solo se escribe para el externo; la del empleado sale de Recursos humanos.
 */
export function formularioAPersona(f: FormPersona, metadataActual: Record<string, unknown> | null): Record<string, unknown> {
  const certs = f.certificaciones.split(',').map((c) => c.trim()).filter(Boolean);
  const { certifications: _c, ...resto } = metadataActual ?? {};
  void _c;
  const metadata: Record<string, unknown> = { ...resto, ...(certs.length ? { certifications: certs } : {}) };
  if (f.modo === 'externo') metadata.cobra_contraentrega = f.cobra_contraentrega;
  const base: Record<string, unknown> = {
    branch_id: f.branch_id || null,
    vehicle_type: f.vehicle_type || null,
    license_number: limpio(f.license_number),
    license_category: f.license_category || null,
    license_expiry: f.license_expiry || null,
    license_restrictions: limpio(f.license_restrictions),
    medical_certificate_expiry: f.medical_certificate_expiry || null,
    blood_type: f.blood_type || null,
    passenger_certified: f.passenger_certified,
    hazmat_certified: f.hazmat_certified,
    emergency_contact_name: limpio(f.emergency_contact_name),
    emergency_contact_phone: limpio(f.emergency_contact_phone),
    is_active: f.is_active,
    metadata,
  };
  if (f.modo === 'empleado') return { ...base, employment_id: f.employment_id };
  const doc = normalizarDocumento(f.document_number);
  return {
    ...base,
    employment_id: null,
    is_external: true,
    full_name: limpio(f.full_name),
    phone: limpio(f.phone),
    document_type: doc ? f.document_type : null,
    document_number: doc || null,
    user_id: f.user_id || null,
  };
}

/** El alta del externo va por la ruta de Logística › Domiciliarios (`POST /api/logistica/domiciliarios`). */
export function altaExterno(f: FormPersona) {
  return {
    nombre: (limpio(f.full_name) ?? '').slice(0, 120),
    celular: f.phone.trim(),
    tipoDocumento: (TIPOS_DOCUMENTO_PERSONA as readonly string[]).includes(f.document_type) ? f.document_type : 'CC',
    documento: f.document_number.trim(),
    branchId: f.branch_id as number,
    tipoVehiculo: f.vehicle_type && (TIPOS_VEHICULO_PERSONA as readonly string[]).includes(f.vehicle_type) ? f.vehicle_type : null,
    cobraContraentrega: f.cobra_contraentrega,
    userId: f.user_id || null,
  };
}
