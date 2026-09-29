import { addPlainDays } from '@/lib/utils/dateCore';
import { sumarPeriodosPlano, type UnidadDuracion } from '@/lib/services/membresias/vigencia';
import type {
  MembresiaEntrada as PayloadMembresia,
  MembresiaFormularioServidor,
  TipoServicioProducto,
} from '@/lib/services/productoService';

export type { PayloadMembresia, MembresiaFormularioServidor };

/**
 * Tipo de servicio y «Configuración de membresía» del formulario único de
 * producto (docs/design/MEMBRESIAS-FASE-1-2.md §1.5, Figma A1 978:605773 y
 * A2 980:1146). Sin React: lo prueban los tests y lo usa `formularioProducto`.
 *
 * El plan de la membresía se guarda en la misma operación que el producto
 * (`fn_producto_guardar` → `payload.membresia`); el precio es SIEMPRE el del
 * producto (product_prices), nunca el del plan.
 */

export type TipoServicio = TipoServicioProducto;

/** Orden de las tarjetas «¿Qué tipo de servicio es?». Solo «membership» tiene configuración en esta fase. */
export const TIPOS_SERVICIO: readonly TipoServicio[] = ['standard', 'membership', 'session_pack', 'class', 'course', 'appointment'];

export const esTipoServicio = (v: unknown): v is TipoServicio =>
  typeof v === 'string' && (TIPOS_SERVICIO as readonly string[]).includes(v);

export type CobroMembresia = 'prepaid' | 'on_credit';

/**
 * `automatic`: 7 días antes del vencimiento la tarea horaria deja la renovación pendiente para
 * cobrarla con un clic; nunca cobra ni factura sola (docs/design/MEMBRESIAS-FASE-1-2.md §12).
 */
export type RenovacionMembresia = 'manual' | 'automatic';

export const UNIDADES_DURACION: readonly UnidadDuracion[] = ['day', 'week', 'month', 'year'];

/** Días ISO (1 = lunes … 7 = domingo), como los compara el check-in (`extract(isodow …)`). */
export const DIAS_SEMANA: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

export interface MembresiaForm {
  duration_unit: UnidadDuracion;
  duration_value: number | null;
  billing_mode: CobroMembresia;
  renewal_mode: RenovacionMembresia;
  grace_days: number | null;
  requires_activation: boolean;
  /** Días para entrar por primera vez; si no entra, se activa sola. Vacío = sin ventana. */
  activation_window_days: number | null;
  freeze_allowed: boolean;
  freeze_max_times: number | null;
  freeze_max_days: number | null;
  /** Vacío = todas las sedes de la organización. */
  allowed_branch_ids: number[];
  /** `todo` = sin restricción de horario (access_schedule null). */
  horario: 'todo' | 'franja';
  dias: number[];
  /** HH:mm; en «franja», ambos o ninguno. */
  desde: string;
  hasta: string;
  daily_checkin_limit: number | null;
}

/** Plan por defecto (el mismo que crea la base sin configuración: 1 mes, por adelantado — P2). */
export function membresiaFormInicial(): MembresiaForm {
  return {
    duration_unit: 'month',
    duration_value: 1,
    billing_mode: 'prepaid',
    renewal_mode: 'manual',
    grace_days: 0,
    requires_activation: false,
    activation_window_days: null,
    freeze_allowed: false,
    freeze_max_times: null,
    freeze_max_days: null,
    allowed_branch_ids: [],
    horario: 'todo',
    dias: [...DIAS_SEMANA],
    desde: '',
    hasta: '',
    daily_checkin_limit: null,
  };
}

const entero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** «5:00» o «05:00:00» → «05:00»; lo demás, tal cual (la validación lo marca). */
export function normalizarHora(v: unknown): string {
  if (typeof v !== 'string') return '';
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(v.trim());
  if (!m) return v.trim();
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export function membresiaDesdeServidor(m: MembresiaFormularioServidor | null | undefined): MembresiaForm {
  const base = membresiaFormInicial();
  if (!m) return base;
  const unidad = UNIDADES_DURACION.includes(m.duration_unit as UnidadDuracion) ? (m.duration_unit as UnidadDuracion) : base.duration_unit;
  const horario = m.access_schedule && typeof m.access_schedule === 'object' ? m.access_schedule : null;
  const dias = Array.isArray(horario?.dias)
    ? Array.from(new Set((horario?.dias as unknown[]).map(Number).filter((d) => DIAS_SEMANA.includes(d)))).sort((a, b) => a - b)
    : [];
  return {
    duration_unit: unidad,
    duration_value: entero(m.duration_value) ?? 1,
    billing_mode: m.billing_mode === 'on_credit' ? 'on_credit' : 'prepaid',
    renewal_mode: m.renewal_mode === 'automatic' ? 'automatic' : 'manual',
    grace_days: entero(m.grace_days) ?? 0,
    requires_activation: m.requires_activation === true,
    activation_window_days: entero(m.activation_window_days),
    freeze_allowed: m.freeze_allowed === true,
    freeze_max_times: entero(m.freeze_max_times),
    freeze_max_days: entero(m.freeze_max_days),
    allowed_branch_ids: Array.isArray(m.allowed_branch_ids) ? m.allowed_branch_ids.map(Number).filter((n) => Number.isFinite(n)) : [],
    horario: horario ? 'franja' : 'todo',
    dias: horario && dias.length > 0 ? dias : [...DIAS_SEMANA],
    desde: horario ? normalizarHora(horario.desde) : '',
    hasta: horario ? normalizarHora(horario.hasta) : '',
    daily_checkin_limit: entero(m.daily_checkin_limit),
  };
}

// ── Validación ─────────────────────────────────────────────────────────────

/** Códigos de validación de la sección (claves de `productoForm.errores`). */
export type CodigoValidacionMembresia =
  | 'membresia_duracion_invalida'
  | 'membresia_gracia_invalida'
  | 'membresia_ventana_invalida'
  | 'membresia_tope_invalido'
  | 'membresia_horario_dias'
  | 'membresia_horario_invalido';

export type CampoMembresia =
  | 'membresia_duracion'
  | 'membresia_cobro'
  | 'membresia_gracia'
  | 'membresia_activacion'
  | 'membresia_congelamiento'
  | 'membresia_sedes'
  | 'membresia_horario'
  | 'membresia_entradas';

const negativo = (v: number | null) => v !== null && (v < 0 || !Number.isInteger(v));

export function validarMembresia(m: MembresiaForm): Partial<Record<CampoMembresia, CodigoValidacionMembresia>> {
  const err: Partial<Record<CampoMembresia, CodigoValidacionMembresia>> = {};
  if (m.duration_value === null || m.duration_value < 1 || !Number.isInteger(m.duration_value)) {
    err.membresia_duracion = 'membresia_duracion_invalida';
  }
  if (negativo(m.grace_days)) err.membresia_gracia = 'membresia_gracia_invalida';
  if (
    m.requires_activation &&
    m.activation_window_days !== null &&
    (m.activation_window_days < 1 || !Number.isInteger(m.activation_window_days))
  ) {
    err.membresia_activacion = 'membresia_ventana_invalida';
  }
  if (m.freeze_allowed && (negativo(m.freeze_max_times) || negativo(m.freeze_max_days))) {
    err.membresia_congelamiento = 'membresia_tope_invalido';
  }
  if (negativo(m.daily_checkin_limit)) err.membresia_entradas = 'membresia_tope_invalido';
  if (m.horario === 'franja') {
    if (m.dias.length === 0) {
      err.membresia_horario = 'membresia_horario_dias';
    } else {
      const d = m.desde.trim();
      const h = m.hasta.trim();
      // Ambas horas o ninguna (solo días); el check-in compara «between desde and hasta»: sin cruzar medianoche.
      if ((d || h) && (!HORA.test(d) || !HORA.test(h) || d >= h)) err.membresia_horario = 'membresia_horario_invalido';
    }
  }
  return err;
}

// ── Payload de fn_producto_guardar ─────────────────────────────────────────

export function horarioPayload(m: MembresiaForm): PayloadMembresia['access_schedule'] {
  if (m.horario !== 'franja') return null;
  const dias = Array.from(new Set(m.dias)).sort((a, b) => a - b);
  const d = m.desde.trim();
  const h = m.hasta.trim();
  return { dias, ...(d && h ? { desde: d, hasta: h } : {}) };
}

export function payloadMembresia(m: MembresiaForm): PayloadMembresia {
  return {
    duration_unit: m.duration_unit,
    duration_value: Math.max(1, Math.trunc(m.duration_value ?? 1)),
    billing_mode: m.billing_mode,
    renewal_mode: m.renewal_mode === 'automatic' ? 'automatic' : 'manual',
    grace_days: Math.max(0, Math.trunc(m.grace_days ?? 0)),
    requires_activation: m.requires_activation,
    activation_window_days: m.requires_activation ? m.activation_window_days : null,
    freeze_allowed: m.freeze_allowed,
    freeze_max_times: m.freeze_allowed ? m.freeze_max_times : null,
    freeze_max_days: m.freeze_allowed ? m.freeze_max_days : null,
    allowed_branch_ids: Array.from(new Set(m.allowed_branch_ids)),
    access_schedule: horarioPayload(m),
    daily_checkin_limit: m.daily_checkin_limit,
  };
}

// ── Preselección desde la URL ──────────────────────────────────────────────

const SERVICIO_POR_PARAMETRO: Record<string, TipoServicio> = {
  estandar: 'standard',
  standard: 'standard',
  membresia: 'membership',
  membership: 'membership',
  paquete: 'session_pack',
  session_pack: 'session_pack',
  clase: 'class',
  class: 'class',
  curso: 'course',
  course: 'course',
  cita: 'appointment',
  appointment: 'appointment',
};

/**
 * `/app/inventario/productos/nuevo?tipo=servicio&servicio=membresia` (botón «Nuevo plan» de
 * Membresías) preselecciona Servicio › Membresía. `servicio` sin `tipo` también implica servicio.
 */
export function preseleccionDesdeUrl(search: string): { product_type: 'service'; service_type: TipoServicio } | null {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const tipo = (q.get('tipo') ?? '').trim().toLowerCase();
  const servicio = SERVICIO_POR_PARAMETRO[(q.get('servicio') ?? '').trim().toLowerCase()];
  const esServicio = tipo === 'servicio' || tipo === 'service' || !!servicio;
  if (!esServicio) return null;
  return { product_type: 'service', service_type: servicio ?? 'standard' };
}

// ── Ayudas de pantalla ─────────────────────────────────────────────────────

export type PresetDuracion = '1d' | '1w' | '1m' | '3m' | '6m' | '1y';

export const PRESETS_DURACION: readonly { id: PresetDuracion; unidad: UnidadDuracion; valor: number }[] = [
  { id: '1d', unidad: 'day', valor: 1 },
  { id: '1w', unidad: 'week', valor: 1 },
  { id: '1m', unidad: 'month', valor: 1 },
  { id: '3m', unidad: 'month', valor: 3 },
  { id: '6m', unidad: 'month', valor: 6 },
  { id: '1y', unidad: 'year', valor: 1 },
];

/** Nombre del día ISO (1 = lunes) en el idioma: «lun», «Mon»… (`largo`: «lunes»). */
export function nombreDiaIso(iso: number, locale: string, largo = false): string {
  // 2026-09-28 fue lunes: + (iso − 1) da el día buscado; mediodía UTC para no correr el día.
  const fecha = new Date(Date.UTC(2026, 8, 27 + iso, 12));
  try {
    return new Intl.DateTimeFormat(locale, { weekday: largo ? 'long' : 'short', timeZone: 'UTC' }).format(fecha).replace(/\.$/, '');
  } catch {
    return String(iso);
  }
}

/** Chip activo de «Duración»; null = «Personalizada». */
export function presetDe(m: Pick<MembresiaForm, 'duration_unit' | 'duration_value'>): PresetDuracion | null {
  return PRESETS_DURACION.find((p) => p.unidad === m.duration_unit && p.valor === m.duration_value)?.id ?? null;
}

/**
 * Ejemplo «pagada hoy, vence el …» con la regla de la base: N periodos desde el día D
 * terminan el día D + N·unidad − 1 (1 mes pagado el 28 sep vence el 27 oct). Días calendario
 * de la organización (YYYY-MM-DD); se pintan con formatPlainDate.
 */
export function ultimoDiaEjemplo(hoy: string, unidad: UnidadDuracion, valor: number | null): string | null {
  if (valor === null || valor < 1 || !Number.isInteger(valor)) return null;
  return addPlainDays(sumarPeriodosPlano(hoy, unidad, valor), -1);
}
