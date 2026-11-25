/**
 * Logística 1b — el domiciliario y el vehículo (Figma «21 Logística», sección 3151-10252). Puro.
 *
 * Toda regla de negocio vive en la base (migración 20261125044314):
 * - `logistica_revisar_asignacion`: preselección (envío > por defecto > «a pie / bici» explícito),
 *   obligatoriedad, documentos, licencia, capacidad y si el bloqueo aplica a la organización.
 * - `logistica_asignar_domiciliario`: la misma revisión al guardar, con la excepción del supervisor
 *   (PIN de Recursos humanos validado allá, 5 intentos en 15 minutos sobre SU PIN).
 * Aquí solo se LEE lo que responde la base y se arma lo que la pantalla muestra. Así la hoja de
 * Por despachar, Pedidos online (AssignDeliveryDialog) y el detalle no pueden divergir.
 */
import { MOTIVO_MAX, MOTIVO_MIN, PIN, excepcionCompleta } from '@/lib/transporte/despachos';

export { MOTIVO_MAX, MOTIVO_MIN, PIN, excepcionCompleta };

// ── Uso y dueño ─────────────────────────────────────────────────────────────

/** `vehicles.usage` y `driver_credentials.usage`. */
export const USOS = ['logistics', 'transport', 'both'] as const;
export type Uso = (typeof USOS)[number];

/** Decisión 9.6: nace en el módulo de alta (nunca en «Ambos»); después se puede marcar «Ambos». */
export function usoInicial(modulo: 'logistica' | 'transporte'): Uso {
  return modulo === 'logistica' ? 'logistics' : 'transport';
}

export function leerUso(v: unknown): Uso {
  return (USOS as readonly unknown[]).includes(v) ? (v as Uso) : 'both';
}

/** ¿Sale como opción en este módulo? Un bus con uso Transporte no sale en domicilios, y al revés. */
export function sirveEn(uso: unknown, modulo: 'logistica' | 'transporte'): boolean {
  const u = leerUso(uso);
  return u === 'both' || u === (modulo === 'logistica' ? 'logistics' : 'transport');
}

/** Con la casilla «Usar también en …» el uso pasa a «Ambos». */
export function usoConAmbos(modulo: 'logistica' | 'transporte', ambos: boolean): Uso {
  return ambos ? 'both' : usoInicial(modulo);
}

/** `vehicles.ownership`. */
export const DUENOS = ['company', 'driver', 'third_party'] as const;
export type Dueno = (typeof DUENOS)[number];

export function leerDueno(v: unknown): Dueno {
  return (DUENOS as readonly unknown[]).includes(v) ? (v as Dueno) : 'company';
}

// ── Tipos ───────────────────────────────────────────────────────────────────

/** Moto, carro y camioneta: el vehículo concreto es obligatorio (regla 5.2). */
export const TIPOS_CON_VEHICULO = ['motorcycle', 'car', 'van'] as const;
/** Bici y a pie pueden ir sin vehículo registrado (`metadata.sin_vehiculo`). */
export const SIN_VEHICULO = ['on_foot', 'bicycle'] as const;
export type SinVehiculo = (typeof SIN_VEHICULO)[number];

export function requiereVehiculo(tipoPersona: string | null | undefined): boolean {
  return (TIPOS_CON_VEHICULO as readonly string[]).includes(tipoPersona ?? '');
}

/** Tipos de la flota que sirven para domicilio en el alta (los de Transporte se crean allá). */
export const TIPOS_FLOTA_LOGISTICA = ['motorcycle', 'car', 'van', 'bicycle', 'truck', 'other'] as const;

/** Placa obligatoria salvo en bici y en vehículo de un tercero (CHECK `vehicles_placa_check`). */
export function placaObligatoria(tipo: string, dueno: Dueno): boolean {
  return tipo !== 'bicycle' && dueno !== 'third_party';
}

/**
 * ¿El vehículo encaja con la persona? Un domiciliario de moto no elige un carro sin querer: el
 * selector muestra primero los de su tipo. Bici y «otro» aceptan cualquiera.
 */
export function vehiculoDelTipo(tipoPersona: string | null | undefined, tipoVehiculo: string): boolean {
  if (!tipoPersona || tipoPersona === 'other') return true;
  if (tipoPersona === 'on_foot') return false;
  return tipoPersona === tipoVehiculo;
}

// ── Selección en la hoja «Asignar» ─────────────────────────────────────────

/** Valor del selector: un vehículo de la flota o «a pie / bici sin vehículo» explícito. */
export type Seleccion = { tipo: 'vehiculo'; id: string } | { tipo: 'sin'; motivo: SinVehiculo } | { tipo: 'ninguno' };

export function seleccionAValor(s: Seleccion): string {
  if (s.tipo === 'vehiculo') return `v:${s.id}`;
  if (s.tipo === 'sin') return `sin:${s.motivo}`;
  return '';
}

export function valorASeleccion(v: string | null | undefined): Seleccion {
  if (v?.startsWith('v:') && v.length > 2) return { tipo: 'vehiculo', id: v.slice(2) };
  if (v === 'sin:on_foot' || v === 'sin:bicycle') return { tipo: 'sin', motivo: v.slice(4) as SinVehiculo };
  return { tipo: 'ninguno' };
}

/** Lo que se manda a la RPC (vehículo o motivo «sin vehículo»). */
export function seleccionAParametros(s: Seleccion): { vehiculoId: string | null; sinVehiculo: SinVehiculo | null } {
  if (s.tipo === 'vehiculo') return { vehiculoId: s.id, sinVehiculo: null };
  if (s.tipo === 'sin') return { vehiculoId: null, sinVehiculo: s.motivo };
  return { vehiculoId: null, sinVehiculo: null };
}

// ── Revisión (respuesta de la base) ─────────────────────────────────────────

export type CausaBloqueo =
  | 'soat'
  | 'tecnomecanica'
  | 'licencia'
  | 'sin_licencia'
  | 'categoria_licencia'
  | 'vehiculo_requerido'
  | string;

export interface ItemRevision {
  causa: CausaBloqueo;
  grupo: 'vehiculo' | 'conductor' | 'asignacion' | 'capacidad' | string;
  vence: string | null;
  dias: number | null;
  excepcion: boolean;
  categoria: string | null;
  requeridas: string[];
  valor: number | null;
  capacidad: number | null;
}

export interface VehiculoRevision {
  id: string;
  placa: string | null;
  tipo: string;
  dueno: Dueno;
  ownerDriverId: string | null;
  capacidadKg: number | null;
  capacidadM3: number | null;
}

export interface RevisionAsignacion {
  fecha: string | null;
  tipoPersona: string | null;
  requiereVehiculo: boolean;
  vehiculo: VehiculoRevision | null;
  sinVehiculo: SinVehiculo | null;
  peso: number | null;
  volumen: number | null;
  bloqueos: ItemRevision[];
  avisos: ItemRevision[];
  bloqueoActivo: boolean;
  hayAutorizadorConPin: boolean;
  /** Bloquea de verdad: ajuste encendido + autorizador con PIN + algo vencido (decisión 6). */
  bloquea: boolean;
  admiteExcepcion: boolean;
  /** Preselección del servidor: el del envío, el por defecto, «a pie / bici» o nada. */
  origen: 'envio' | 'defecto' | 'tipo' | 'ninguno' | 'elegido';
  vehiculoOcupado: boolean;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const txt = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function leerItem(v: unknown): ItemRevision {
  const f = obj(v);
  return {
    causa: String(f.causa ?? ''),
    grupo: String(f.grupo ?? ''),
    vence: txt(f.vence),
    dias: num(f.dias),
    excepcion: f.excepcion === true,
    categoria: txt(f.categoria),
    requeridas: Array.isArray(f.requeridas) ? f.requeridas.map(String) : [],
    valor: num(f.valor),
    capacidad: num(f.capacidad),
  };
}

export function leerRevision(valor: unknown): RevisionAsignacion {
  const f = obj(valor);
  const v = f.vehiculo ? obj(f.vehiculo) : null;
  const origen = ['envio', 'defecto', 'tipo', 'ninguno', 'elegido'].includes(String(f.origen)) ? (f.origen as RevisionAsignacion['origen']) : 'elegido';
  const sin = (SIN_VEHICULO as readonly unknown[]).includes(f.sin_vehiculo) ? (f.sin_vehiculo as SinVehiculo) : null;
  return {
    fecha: txt(f.fecha),
    tipoPersona: txt(f.tipo_persona),
    requiereVehiculo: f.requiere_vehiculo === true,
    vehiculo: v && txt(v.id)
      ? { id: String(v.id), placa: txt(v.placa), tipo: String(v.tipo ?? ''), dueno: leerDueno(v.dueno), ownerDriverId: txt(v.owner_driver_id), capacidadKg: num(v.capacity_kg), capacidadM3: num(v.capacity_m3) }
      : null,
    sinVehiculo: sin,
    peso: num(f.peso),
    volumen: num(f.volumen),
    bloqueos: Array.isArray(f.bloqueos) ? f.bloqueos.map(leerItem) : [],
    avisos: Array.isArray(f.avisos) ? f.avisos.map(leerItem) : [],
    bloqueoActivo: f.bloqueo_activo === true,
    hayAutorizadorConPin: f.hay_autorizador_con_pin === true,
    bloquea: f.bloquea === true,
    admiteExcepcion: f.admite_excepcion === true,
    origen,
    vehiculoOcupado: f.vehiculo_ocupado === true,
  };
}

/** La selección con la que arranca la hoja: la que sugirió el servidor (regla 4.5). */
export function seleccionInicial(r: Pick<RevisionAsignacion, 'vehiculo' | 'sinVehiculo'>): Seleccion {
  if (r.vehiculo) return { tipo: 'vehiculo', id: r.vehiculo.id };
  if (r.sinVehiculo) return { tipo: 'sin', motivo: r.sinVehiculo };
  return { tipo: 'ninguno' };
}

/**
 * Estado del botón «Asignar» de la hoja. La base vuelve a decidir; esto solo evita pedir lo que
 * se sabe que no pasa. Sin bloqueo efectivo (ajuste apagado o nadie con PIN) todo es aviso.
 */
export type MotivoNoAsignar = 'vehiculo_requerido' | 'bloqueado' | 'sin_excepcion' | 'ocupado' | null;

export function motivoNoAsignar(r: RevisionAsignacion | null, s: Seleccion): MotivoNoAsignar {
  if (!r) return null;
  if (r.vehiculoOcupado && s.tipo === 'vehiculo') return 'ocupado';
  if (!r.bloquea) return null;
  if (!r.admiteExcepcion) return r.bloqueos.some((b) => b.causa === 'vehiculo_requerido') ? 'vehiculo_requerido' : 'sin_excepcion';
  return 'bloqueado';
}

/** Bloqueos que se muestran como aviso cuando el bloqueo no aplica (decisión 6). */
export function avisosVisibles(r: RevisionAsignacion): ItemRevision[] {
  return r.bloquea ? r.avisos : [...r.bloqueos, ...r.avisos];
}

/** ¿Hay aviso de capacidad? Solo avisa, nunca bloquea (decisión 4). */
export function avisoCapacidad(r: RevisionAsignacion): ItemRevision | null {
  return r.avisos.find((a) => a.causa === 'capacidad_kg' || a.causa === 'capacidad_m3') ?? null;
}

// ── Resultado de asignar ────────────────────────────────────────────────────

export type EstadoAsignacion =
  | 'asignado'
  | 'asignado_con_avisos'
  | 'asignado_con_excepcion'
  | 'bloqueado'
  | 'no_admite_excepcion'
  | 'motivo_invalido'
  | 'falta_supervisor'
  | 'sin_permiso_excepcion'
  | 'supervisor_sin_pin'
  | 'pin_rechazado'
  | 'pin_bloqueado';

const ESTADOS: readonly EstadoAsignacion[] = [
  'asignado',
  'asignado_con_avisos',
  'asignado_con_excepcion',
  'bloqueado',
  'no_admite_excepcion',
  'motivo_invalido',
  'falta_supervisor',
  'sin_permiso_excepcion',
  'supervisor_sin_pin',
  'pin_rechazado',
  'pin_bloqueado',
];

export interface ResultadoAsignacionRpc {
  ok: boolean;
  estado: EstadoAsignacion;
  vehiculoId: string | null;
  sinVehiculo: SinVehiculo | null;
  avisos: ItemRevision[];
  cumplimiento: RevisionAsignacion | null;
  /** pin_bloqueado: hasta cuándo (instante ISO). */
  hasta: string | null;
  intentosRestantes: number | null;
}

/** Respuesta de `logistica_asignar_domiciliario`. Las versiones viejas (sin `estado`) cuentan como asignado. */
export function leerResultadoAsignacion(valor: unknown): ResultadoAsignacionRpc {
  const f = obj(valor);
  const ok = f.ok !== false;
  const estado = (ESTADOS as readonly unknown[]).includes(f.estado) ? (f.estado as EstadoAsignacion) : ok ? 'asignado' : 'bloqueado';
  return {
    ok,
    estado,
    vehiculoId: txt(f.vehicle_id),
    sinVehiculo: (SIN_VEHICULO as readonly unknown[]).includes(f.sin_vehiculo) ? (f.sin_vehiculo as SinVehiculo) : null,
    avisos: Array.isArray(f.avisos) ? f.avisos.map(leerItem) : [],
    cumplimiento: f.cumplimiento ? leerRevision(f.cumplimiento) : null,
    hasta: txt(f.hasta),
    intentosRestantes: num(f.intentos_restantes),
  };
}

/** Estados que piden el diálogo del supervisor (los demás se explican y ya). */
export const ESTADOS_DE_EXCEPCION: readonly EstadoAsignacion[] = ['bloqueado', 'motivo_invalido', 'falta_supervisor', 'sin_permiso_excepcion', 'supervisor_sin_pin', 'pin_rechazado', 'pin_bloqueado'];

// ── Lo que quedó guardado en el envío (espejo, 4.4) ─────────────────────────

export type VehiculoDelEnvio =
  | { tipo: 'vehiculo'; id: string | null; placa: string | null; tipoVehiculo: string | null; dueno: Dueno | null }
  | { tipo: 'sin'; motivo: SinVehiculo }
  | null;

/**
 * Vehículo con el que salió un envío. Manda el espejo de metadata (no cambia aunque después se
 * edite la ficha); si no hay espejo (envíos de antes de la 1b) se usa el vehículo actual.
 */
export function vehiculoDelEnvio(
  metadata: unknown,
  actual?: { id?: string | null; plate?: string | null; vehicle_type?: string | null; ownership?: string | null } | null,
): VehiculoDelEnvio {
  const m = obj(metadata);
  const espejo = m.vehiculo ? obj(m.vehiculo) : null;
  if (espejo && (txt(espejo.id) || txt(espejo.placa))) {
    return { tipo: 'vehiculo', id: txt(espejo.id), placa: txt(espejo.placa), tipoVehiculo: txt(espejo.tipo), dueno: espejo.dueno ? leerDueno(espejo.dueno) : null };
  }
  if ((SIN_VEHICULO as readonly unknown[]).includes(m.sin_vehiculo)) return { tipo: 'sin', motivo: m.sin_vehiculo as SinVehiculo };
  if (actual?.id) return { tipo: 'vehiculo', id: actual.id, placa: actual.plate ?? null, tipoVehiculo: actual.vehicle_type ?? null, dueno: actual.ownership ? leerDueno(actual.ownership) : null };
  return null;
}

/** Excepción autorizada guardada en el envío (motivo, quién pidió, quién autorizó, cuándo). */
export interface ExcepcionDelEnvio {
  causas: string[];
  motivo: string;
  pidio: string | null;
  autorizo: string | null;
  at: string | null;
}

export function excepcionDelEnvio(metadata: unknown): ExcepcionDelEnvio | null {
  const e = obj(obj(metadata).excepcion_asignacion);
  if (!txt(e.motivo)) return null;
  return {
    causas: Array.isArray(e.causas) ? e.causas.map((c) => String(obj(c).causa ?? '')).filter(Boolean) : [],
    motivo: String(e.motivo),
    pidio: txt(e.pidio),
    autorizo: txt(e.autorizo),
    at: txt(e.at),
  };
}

// ── Personas y vehículo por defecto ─────────────────────────────────────────

/**
 * KPI «sin vehículo» (catálogo y Domiciliarios): cuenta a quien debería tener uno (moto, carro,
 * camioneta, otro o sin tipo) y no tiene vehículo por defecto. A pie y bici sin registrar no son falta.
 */
export function faltaVehiculo(p: { tipoVehiculo: string | null; vehiculoId: string | null }): boolean {
  if (p.vehiculoId) return false;
  return !(SIN_VEHICULO as readonly string[]).includes(p.tipoVehiculo ?? '');
}

/** Qué se muestra en la columna «Vehículo» de una persona (listas y ficha, Figma 3161-11986). */
export type VehiculoPersona =
  | { estado: 'con'; tipo: string | null; placa: string | null }
  | { estado: 'a_pie' }
  | { estado: 'bici_sin' }
  | { estado: 'sin'; tipo: string | null }
  | { estado: 'nada' };

export function vehiculoDePersona(d: {
  vehicle_type?: string | null;
  vehiculo?: { plate?: string | null; vehicle_type?: string | null } | null;
}): VehiculoPersona {
  if (d.vehiculo) return { estado: 'con', tipo: d.vehiculo.vehicle_type ?? d.vehicle_type ?? null, placa: d.vehiculo.plate ?? null };
  if (d.vehicle_type === 'on_foot') return { estado: 'a_pie' };
  if (d.vehicle_type === 'bicycle') return { estado: 'bici_sin' };
  if (d.vehicle_type) return { estado: 'sin', tipo: d.vehicle_type };
  return { estado: 'nada' };
}
