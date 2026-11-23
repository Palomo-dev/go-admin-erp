/**
 * Ajustes de Transporte (Configuración › Transporte, sección `transporte.general`). Puro.
 *
 * Figma «23 Transporte» › 21b (2937:19876, 2937:20973, 2937:21271), decisiones del dueño del
 * 2026-11-23: Transporte no tiene página de «Configuración»; retención del puesto, cambios y
 * anulaciones, liquidación, tipos de vehículo, motivos de novedad (lista corta) y quién autoriza
 * excepciones viven en el diálogo. Las credenciales del RNDC viven en Integraciones › Conexiones.
 *
 * Se guardan en `organization_settings` con la clave `transporte` (una fila por organización);
 * solo los escribe `PUT /api/transporte/ajustes`, que exige `transporte.manage` en el servidor.
 * La base lee `excepciones.*` (`fn_transporte_ajuste_excepcion`, migración 20261123220000) para
 * decidir si un bloqueo de despacho admite excepción y si pide PIN: el criterio es el mismo de
 * aquí (solo un `false` explícito apaga).
 */

export const CLAVE_AJUSTES_TRANSPORTE = 'transporte';

/** Tipos de `vehicles.vehicle_type` (CHECK de la base, con lancha y yate desde 20261123220000). */
export const TIPOS_VEHICULO = ['bus', 'minibus', 'truck', 'car', 'van', 'motorcycle', 'trailer', 'boat', 'yacht', 'other'] as const;
export type TipoVehiculo = (typeof TIPOS_VEHICULO)[number];

/** Uso habitual de cada tipo (texto de la tabla del diseño; no restringe nada). */
export const USO_TIPO_VEHICULO: Readonly<Record<TipoVehiculo, 'transporte' | 'logistica' | 'ambos'>> = {
  bus: 'transporte',
  minibus: 'transporte',
  truck: 'ambos',
  car: 'ambos',
  van: 'ambos',
  motorcycle: 'logistica',
  trailer: 'transporte',
  boat: 'transporte',
  yacht: 'transporte',
  other: 'ambos',
};

export const EMBARCACIONES: readonly TipoVehiculo[] = ['boat', 'yacht'];

export interface TipoVehiculoAjuste {
  codigo: TipoVehiculo;
  activo: boolean;
}

export const GRAVEDADES = ['leve', 'moderada', 'grave'] as const;
export type Gravedad = (typeof GRAVEDADES)[number];

/** `transport_incidents.incident_type` (CHECK de la base). */
export const TIPOS_INCIDENTE = [
  'delay',
  'accident',
  'damage',
  'lost',
  'theft',
  'customer_complaint',
  'vehicle_breakdown',
  'route_blocked',
  'driver_issue',
  'weather',
  'documentation',
  'other',
] as const;
export type TipoIncidente = (typeof TIPOS_INCIDENTE)[number];

/**
 * Motivo de novedad: una sola lista para la app del conductor, Viajes › Novedades y el diálogo
 * de reporte (decisión 11). `id` estable (va en `transport_incidents.metadata.motivo`);
 * `tipo` es el `incident_type` que se guarda; `nombre` lo escribe la organización (si está vacío
 * se muestra el nombre traducido del motivo por defecto con ese `id`).
 */
export interface MotivoNovedad {
  id: string;
  nombre: string;
  tipo: TipoIncidente;
  gravedad: Gravedad;
  bloqueaVehiculo: boolean;
  activo: boolean;
}

/** Severidad de `transport_incidents` para cada gravedad de la lista corta. */
export const SEVERIDAD_DE_GRAVEDAD: Readonly<Record<Gravedad, 'low' | 'medium' | 'high'>> = { leve: 'low', moderada: 'medium', grave: 'high' };

/** Los 8 motivos del diseño (2937:20973). `nombre` vacío: el de i18n (`transporte.motivos.<id>`). */
export const MOTIVOS_POR_DEFECTO: readonly MotivoNovedad[] = [
  { id: 'retraso', nombre: '', tipo: 'delay', gravedad: 'leve', bloqueaVehiculo: false, activo: true },
  { id: 'falla_mecanica', nombre: '', tipo: 'vehicle_breakdown', gravedad: 'grave', bloqueaVehiculo: true, activo: true },
  { id: 'accidente', nombre: '', tipo: 'accident', gravedad: 'grave', bloqueaVehiculo: true, activo: true },
  { id: 'control_transito', nombre: '', tipo: 'documentation', gravedad: 'leve', bloqueaVehiculo: false, activo: true },
  { id: 'pasajero', nombre: '', tipo: 'customer_complaint', gravedad: 'leve', bloqueaVehiculo: false, activo: true },
  { id: 'carga', nombre: '', tipo: 'damage', gravedad: 'moderada', bloqueaVehiculo: false, activo: true },
  { id: 'objeto_olvidado', nombre: '', tipo: 'lost', gravedad: 'leve', bloqueaVehiculo: false, activo: true },
  { id: 'clima', nombre: '', tipo: 'weather', gravedad: 'moderada', bloqueaVehiculo: false, activo: true },
];

export interface AjustesTransporte {
  /** Minutos que un puesto queda apartado mientras se cobra, por canal. */
  retencion: { taquilla: number; web: number; pos: number };
  /** Hasta cuántos minutos antes de la salida se cambia sin costo. */
  cambioSinCostoMin: number;
  /** Hasta cuántas horas antes se anula con reembolso. */
  anulacionHoras: number;
  /** Porcentaje del pasaje que se devuelve al anular a tiempo. */
  reembolsoPct: number;
  /** Al vencer la retención, ¿se libera solo el puesto? */
  liberarAlVencer: boolean;
  /** Porcentaje del producido que retiene la empresa a los propietarios afiliados. */
  administracionAfiliadosPct: number;
  tiposVehiculo: TipoVehiculoAjuste[];
  motivosNovedad: MotivoNovedad[];
  excepciones: { documentosVehiculo: boolean; documentosConductor: boolean; manifiesto: boolean; pedirPin: boolean };
}

export const RETENCION_MIN = 1;
export const RETENCION_MAX = 120;
export const CAMBIO_MAX_MIN = 1440;
export const ANULACION_MAX_H = 168;
export const MAX_MOTIVOS = 30;
export const MAX_NOMBRE_MOTIVO = 60;

const TIPOS_ACTIVOS_POR_DEFECTO: readonly TipoVehiculo[] = ['bus', 'minibus', 'truck', 'car', 'boat', 'yacht'];

export const AJUSTES_TRANSPORTE_POR_DEFECTO: AjustesTransporte = {
  retencion: { taquilla: 5, web: 15, pos: 5 },
  cambioSinCostoMin: 30,
  anulacionHoras: 2,
  reembolsoPct: 90,
  liberarAlVencer: true,
  administracionAfiliadosPct: 10,
  tiposVehiculo: TIPOS_VEHICULO.map((codigo) => ({ codigo, activo: TIPOS_ACTIVOS_POR_DEFECTO.includes(codigo) })),
  motivosNovedad: MOTIVOS_POR_DEFECTO.map((m) => ({ ...m })),
  excepciones: { documentosVehiculo: true, documentosConductor: true, manifiesto: true, pedirPin: true },
};

const esEntero = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const entero = (v: unknown, min: number, max: number, porDefecto: number) => (esEntero(v, min, max) ? v : porDefecto);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const ID_MOTIVO = /^[a-z0-9_]{1,40}$/;

function normalizarTipos(v: unknown): TipoVehiculoAjuste[] {
  const lista = Array.isArray(v) ? v : [];
  const vistos = new Set<TipoVehiculo>();
  const out: TipoVehiculoAjuste[] = [];
  for (const x of lista) {
    const f = obj(x);
    const codigo = f.codigo as TipoVehiculo;
    if (!(TIPOS_VEHICULO as readonly string[]).includes(codigo) || vistos.has(codigo)) continue;
    vistos.add(codigo);
    out.push({ codigo, activo: f.activo !== false });
  }
  if (out.length === 0) return AJUSTES_TRANSPORTE_POR_DEFECTO.tiposVehiculo.map((t) => ({ ...t }));
  // Los tipos que la lista guardada no traía se agregan al final, apagados.
  for (const codigo of TIPOS_VEHICULO) if (!vistos.has(codigo)) out.push({ codigo, activo: false });
  return out;
}

function normalizarMotivo(x: unknown): MotivoNovedad | null {
  const f = obj(x);
  if (typeof f.id !== 'string' || !ID_MOTIVO.test(f.id)) return null;
  const tipo = (TIPOS_INCIDENTE as readonly string[]).includes(f.tipo as string) ? (f.tipo as TipoIncidente) : 'other';
  const gravedad = (GRAVEDADES as readonly string[]).includes(f.gravedad as string) ? (f.gravedad as Gravedad) : 'leve';
  const nombre = typeof f.nombre === 'string' ? f.nombre.trim().slice(0, MAX_NOMBRE_MOTIVO) : '';
  return { id: f.id, nombre, tipo, gravedad, bloqueaVehiculo: f.bloqueaVehiculo === true, activo: f.activo !== false };
}

function normalizarMotivos(v: unknown): MotivoNovedad[] {
  if (!Array.isArray(v)) return MOTIVOS_POR_DEFECTO.map((m) => ({ ...m }));
  const vistos = new Set<string>();
  const out: MotivoNovedad[] = [];
  for (const x of v.slice(0, MAX_MOTIVOS)) {
    const m = normalizarMotivo(x);
    if (!m || vistos.has(m.id)) continue;
    vistos.add(m.id);
    out.push(m);
  }
  return out.length > 0 ? out : MOTIVOS_POR_DEFECTO.map((m) => ({ ...m }));
}

/** Lo guardado (jsonb) → ajustes completos; lo desconocido o inválido toma el valor por defecto. */
export function normalizarAjustesTransporte(valor: unknown): AjustesTransporte {
  const f = obj(valor);
  const d = AJUSTES_TRANSPORTE_POR_DEFECTO;
  const r = obj(f.retencion);
  const e = obj(f.excepciones);
  return {
    retencion: {
      taquilla: entero(r.taquilla, RETENCION_MIN, RETENCION_MAX, d.retencion.taquilla),
      web: entero(r.web, RETENCION_MIN, RETENCION_MAX, d.retencion.web),
      pos: entero(r.pos, RETENCION_MIN, RETENCION_MAX, d.retencion.pos),
    },
    cambioSinCostoMin: entero(f.cambioSinCostoMin, 0, CAMBIO_MAX_MIN, d.cambioSinCostoMin),
    anulacionHoras: entero(f.anulacionHoras, 0, ANULACION_MAX_H, d.anulacionHoras),
    reembolsoPct: entero(f.reembolsoPct, 0, 100, d.reembolsoPct),
    liberarAlVencer: f.liberarAlVencer !== false,
    administracionAfiliadosPct: entero(f.administracionAfiliadosPct, 0, 100, d.administracionAfiliadosPct),
    tiposVehiculo: normalizarTipos(f.tiposVehiculo),
    motivosNovedad: normalizarMotivos(f.motivosNovedad),
    excepciones: {
      documentosVehiculo: e.documentosVehiculo !== false,
      documentosConductor: e.documentosConductor !== false,
      manifiesto: e.manifiesto !== false,
      pedirPin: e.pedirPin !== false,
    },
  };
}

export type ErrorAjustesTransporte = 'retencion_invalida' | 'plazos_invalidos' | 'porcentaje_invalido' | 'tipos_invalidos' | 'motivos_invalidos' | 'booleano_invalido';

/** Validación estricta de lo que llega a la ruta (no se completa nada en silencio). */
export function validarAjustesTransporte(valor: unknown): { ok: true; ajustes: AjustesTransporte } | { ok: false; error: ErrorAjustesTransporte } {
  const f = obj(valor);
  const r = obj(f.retencion);
  if (![r.taquilla, r.web, r.pos].every((n) => esEntero(n, RETENCION_MIN, RETENCION_MAX))) return { ok: false, error: 'retencion_invalida' };
  if (!esEntero(f.cambioSinCostoMin, 0, CAMBIO_MAX_MIN) || !esEntero(f.anulacionHoras, 0, ANULACION_MAX_H)) return { ok: false, error: 'plazos_invalidos' };
  if (!esEntero(f.reembolsoPct, 0, 100) || !esEntero(f.administracionAfiliadosPct, 0, 100)) return { ok: false, error: 'porcentaje_invalido' };
  const e = obj(f.excepciones);
  const booleanos = [f.liberarAlVencer, e.documentosVehiculo, e.documentosConductor, e.manifiesto, e.pedirPin];
  if (!booleanos.every((b) => typeof b === 'boolean')) return { ok: false, error: 'booleano_invalido' };

  if (!Array.isArray(f.tiposVehiculo) || f.tiposVehiculo.length === 0) return { ok: false, error: 'tipos_invalidos' };
  const codigos = f.tiposVehiculo.map((t) => obj(t).codigo);
  if (
    !codigos.every((c) => (TIPOS_VEHICULO as readonly unknown[]).includes(c)) ||
    new Set(codigos).size !== codigos.length ||
    !f.tiposVehiculo.every((t) => typeof obj(t).activo === 'boolean')
  ) {
    return { ok: false, error: 'tipos_invalidos' };
  }

  if (!Array.isArray(f.motivosNovedad) || f.motivosNovedad.length === 0 || f.motivosNovedad.length > MAX_MOTIVOS) return { ok: false, error: 'motivos_invalidos' };
  const motivos = f.motivosNovedad.map(obj);
  const ids = motivos.map((m) => m.id);
  const motivosValidos = motivos.every(
    (m) =>
      typeof m.id === 'string' &&
      ID_MOTIVO.test(m.id) &&
      typeof m.nombre === 'string' &&
      m.nombre.length <= MAX_NOMBRE_MOTIVO &&
      // Un motivo nuevo necesita nombre; los del diseño pueden dejarlo vacío (nombre traducido).
      (m.nombre.trim() !== '' || MOTIVOS_POR_DEFECTO.some((d) => d.id === m.id)) &&
      (TIPOS_INCIDENTE as readonly unknown[]).includes(m.tipo) &&
      (GRAVEDADES as readonly unknown[]).includes(m.gravedad) &&
      typeof m.bloqueaVehiculo === 'boolean' &&
      typeof m.activo === 'boolean',
  );
  if (!motivosValidos || new Set(ids).size !== ids.length || !motivos.some((m) => m.activo === true)) return { ok: false, error: 'motivos_invalidos' };

  return { ok: true, ajustes: normalizarAjustesTransporte(f) };
}

/** Id para un motivo nuevo a partir de su nombre (sin tildes; único en la lista). */
export function idMotivoNuevo(nombre: string, existentes: readonly string[]): string {
  const base =
    nombre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30) || 'motivo';
  let id = base;
  for (let n = 2; existentes.includes(id); n += 1) id = `${base}_${n}`;
  return id;
}

/** Motivos que se ofrecen al reportar una novedad: los activos, en el orden de la lista. */
export function motivosActivos(a: Pick<AjustesTransporte, 'motivosNovedad'>): MotivoNovedad[] {
  return a.motivosNovedad.filter((m) => m.activo);
}

/** ¿La organización tiene embarcaciones activas en su lista de tipos? (decisión 5). */
export function usaEmbarcaciones(a: Pick<AjustesTransporte, 'tiposVehiculo'>): boolean {
  return a.tiposVehiculo.some((t) => t.activo && EMBARCACIONES.includes(t.codigo));
}
