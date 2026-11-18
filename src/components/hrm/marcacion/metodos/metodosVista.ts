/**
 * Lógica pura de «Métodos por sede» (Figma 20.27), de la «Nueva excepción
 * temporal» (20.27.11) y del letrero (20.27.10). Sin React ni red: la prueban
 * `__tests__/metodosVista.test.ts`.
 *
 * Lo que se guarda y lo que valida de verdad está en la base
 * (`fn_hr_metodos_sede_guardar`, `fn_hr_excepcion_solicitar`); aquí solo se
 * arma el formulario, se cuenta lo que cambió y se traduce cada error a su campo.
 */
import {
  METODOS_M0,
  METODOS_SEDE,
  RADIO_MAX,
  RADIO_MIN,
  cambiosMetodos,
  cuerpoMetodos,
  esMetodoM0,
  validarExcepcion,
  type ConfigMetodo,
  type ConfigSede,
  type ErrorExcepcion,
  type ErrorMetodos,
  type MetodoM0,
  type MetodoSede,
} from '@/lib/hrm/marcacion/metodos';

// ─── Respuestas de la API ────────────────────────────────────────────────────

export interface MetodoApi {
  activo: boolean;
  reglas: Record<string, unknown>;
  configurado?: boolean;
}

export interface SedeMetodos {
  id: number;
  nombre: string;
  direccion: string | null;
  con_ubicacion: boolean;
}

/** `GET /api/hrm/marcacion/metodos?sede=` (`fn_hr_metodos_sede_leer`). */
export interface RespuestaMetodos {
  sede: SedeMetodos;
  sedes: { id: number; nombre: string }[];
  puede_gestionar: boolean;
  metodos: Partial<Record<string, MetodoApi>>;
  etiquetas: { id: string; nombre: string }[];
  pantallas: { id: string; nombre: string }[];
  personas: number;
  personas_remoto: number;
  /** M1: kioscos y lectores de la sede, PIN y carnés entregados, foto de evidencia. */
  kioscos?: { id: string; nombre: string; tipo: string }[];
  credenciales?: { pines: number; carnes: number };
  foto?: { dias: number; letrero_puesto: boolean; letrero_puesto_at: string | null; autorizadas: number };
}

export type EstadoExcepcionApi = 'pendiente' | 'aprobada' | 'rechazada' | 'anulada' | 'revocada';

/** Fila de `GET /api/hrm/marcacion/excepciones` (`fn_hr_excepciones`). */
export interface ExcepcionApi {
  id: string;
  employment_id: string;
  nombre: string;
  cargo?: string | null;
  area?: string | null;
  sede?: string | null;
  branch_id: number | null;
  metodo: string;
  motivo: string;
  desde: string;
  hasta: string;
  estado: EstadoExcepcionApi;
  vigente: boolean;
  aprobado_por: string | null;
  aprobado_en: string | null;
}

// ─── Formulario de la sede ───────────────────────────────────────────────────

export interface FormMetodos {
  celular: { activo: boolean; radio: number | null; computador: boolean };
  qr: { activo: boolean; exigirUbicacion: boolean };
  nfc: { activo: boolean };
}

/** Lo que dice la base (con sus valores por defecto) → estado del formulario. */
export function formularioDesde(metodos: Partial<Record<string, MetodoApi>> | null | undefined): FormMetodos {
  const cel = metodos?.celular_ubicacion;
  const qr = metodos?.qr;
  const nfc = metodos?.nfc_etiqueta;
  const radio = Number(cel?.reglas?.radio_m ?? 150);
  return {
    celular: {
      activo: cel?.activo ?? true,
      radio: Number.isFinite(radio) ? radio : 150,
      computador: cel?.reglas?.permitir_computador !== false,
    },
    qr: { activo: qr?.activo ?? true, exigirUbicacion: qr?.reglas?.exigir_ubicacion === true },
    nfc: { activo: nfc?.activo ?? true },
  };
}

/** Formulario → `ConfigSede` (la forma que entienden `cuerpoMetodos` y `cambiosMetodos`). */
export function configDe(f: FormMetodos): ConfigSede {
  return {
    // Un radio vacío viaja como 0 para que la validación lo rechace (nunca el 150 por defecto).
    celular_ubicacion: { activo: f.celular.activo, reglas: { radio_m: f.celular.radio ?? 0, permitir_computador: f.celular.computador } },
    qr: { activo: f.qr.activo, reglas: { exigir_ubicacion: f.qr.exigirUbicacion } },
    nfc_etiqueta: { activo: f.nfc.activo, reglas: {} },
  };
}

/** Cuántos métodos cambiaron respecto a lo guardado (barra «Cambios sin guardar»). */
export function cambiosFormulario(base: FormMetodos, actual: FormMetodos): number {
  return cambiosMetodos(configDe(base), configDe(actual));
}

/** Cuerpo del `PUT` o el error que lo impide. */
export function cuerpoGuardar(f: FormMetodos): { ok: true; metodos: Record<MetodoM0, ConfigMetodo> } | { ok: false; error: ErrorMetodos } {
  return cuerpoMetodos(configDe(f));
}

export function radioValido(radio: number | null): boolean {
  return radio !== null && Number.isInteger(radio) && radio >= RADIO_MIN && radio <= RADIO_MAX;
}

/** Ocho métodos en la Figma: los tres de M0, PIN, rostro, huella, remoto y la marca manual. */
export const TOTAL_METODOS = 8;

/**
 * «6 de 8 métodos activos». PIN, rostro y huella no funcionan en M0 (cuentan como
 * apagados); el trabajo remoto cuenta si alguien de la sede lo tiene; la marca
 * manual siempre está activa.
 */
export function contadorMetodos(f: FormMetodos, personasRemoto: number): { activos: number; total: number } {
  const m0 = [f.celular.activo, f.qr.activo, f.nfc.activo].filter(Boolean).length;
  return { activos: m0 + (personasRemoto > 0 ? 1 : 0) + 1, total: TOTAL_METODOS };
}

export type ClaveErrorGuardar = 'sin_metodos' | 'radio_invalido' | 'metodo_no_disponible' | 'sin_permiso' | 'sede_requerida' | 'generico';

/** Código de error de la API al guardar → clave de texto (`errores.guardar.*`). */
export function claveErrorGuardar(codigo: string): ClaveErrorGuardar {
  switch (codigo) {
    case 'sin_metodos':
    case 'radio_invalido':
    case 'metodo_no_disponible':
    case 'sin_permiso':
    case 'sede_requerida':
      return codigo;
    default:
      return 'generico';
  }
}

// ─── Destinos ────────────────────────────────────────────────────────────────

/** «Abrir pantalla del QR»: la primera pantalla activa de la sede; sin pantallas, null (hay que agregarla). */
export function rutaPantallaQr(pantallas: readonly { id: string }[]): string | null {
  const p = pantallas[0];
  return p ? `/marcacion/pantalla/${encodeURIComponent(p.id)}` : null;
}

export function rutaLetrero(sedeId: number): string {
  return `/marcacion/letrero?sede=${sedeId}`;
}

/** URL de la vista Dispositivos con el diálogo de agregar abierto, conservando el resto de la consulta. */
export function urlAgregarDispositivo(ruta: string, consulta: string, tipo: 'pantalla_qr' | 'etiqueta_nfc'): string {
  const q = new URLSearchParams(consulta);
  q.set('vista', 'dispositivos');
  q.set('agregar', tipo);
  return `${ruta}?${q.toString()}`;
}

/** URL de «En vivo» (la vista por defecto de la pestaña Marcación). */
export function urlEnVivo(ruta: string, consulta: string): string {
  const q = new URLSearchParams(consulta);
  q.delete('vista');
  q.delete('agregar');
  const s = q.toString();
  return s ? `${ruta}?${s}` : ruta;
}

// ─── Excepciones temporales ──────────────────────────────────────────────────

export type EstadoExcepcion = 'vigente' | 'programada' | 'vencida' | 'pendiente' | 'rechazada' | 'revocada' | 'anulada';

/** Estado que se muestra: una aprobada puede estar vigente, por empezar o vencida. */
export function estadoExcepcion(e: Pick<ExcepcionApi, 'estado' | 'vigente' | 'desde' | 'hasta'>, hoy: string): EstadoExcepcion {
  if (e.estado !== 'aprobada') return e.estado;
  if (e.vigente) return 'vigente';
  if (e.hasta < hoy) return 'vencida';
  if (e.desde > hoy) return 'programada';
  return 'vigente';
}

/** Se revoca lo pendiente o lo aprobado que no ha vencido. */
export function puedeRevocar(e: Pick<ExcepcionApi, 'estado' | 'vigente' | 'desde' | 'hasta'>, hoy: string): boolean {
  const s = estadoExcepcion(e, hoy);
  return s === 'pendiente' || s === 'vigente' || s === 'programada';
}

/** Solo las de personas de la sede (la API devuelve las de toda la organización). */
export function excepcionesDeSede<T extends Pick<ExcepcionApi, 'branch_id'>>(lista: readonly T[], sedeId: number | null): T[] {
  return sedeId === null ? [...lista] : lista.filter((e) => e.branch_id === sedeId);
}

/** «1 vigente · 1 pendiente» (resumen móvil de la tarjeta). */
export function resumenExcepciones(lista: readonly Pick<ExcepcionApi, 'estado' | 'vigente' | 'desde' | 'hasta'>[], hoy: string): { vigentes: number; pendientes: number } {
  let vigentes = 0;
  let pendientes = 0;
  for (const e of lista) {
    const s = estadoExcepcion(e, hoy);
    if (s === 'vigente') vigentes++;
    else if (s === 'pendiente') pendientes++;
  }
  return { vigentes, pendientes };
}

/** Métodos que se pueden habilitar con una excepción: solo los de M0 funcionan hoy. */
export const METODOS_EXCEPCION: readonly { metodo: MetodoSede; disponible: boolean }[] = METODOS_SEDE.map((metodo) => ({
  metodo,
  disponible: esMetodoM0(metodo),
}));

export type CampoExcepcion = 'persona' | 'metodo' | 'desde' | 'hasta' | 'motivo';

const CAMPO_ERROR: Record<ErrorExcepcion, CampoExcepcion> = {
  persona: 'persona',
  metodo: 'metodo',
  fechas: 'hasta',
  tope: 'hasta',
  pasado: 'hasta',
  motivo: 'motivo',
};

/** Validación local (la misma que el servidor) → campo y clave de texto (`excepcion.errores.*`). */
export function errorLocalExcepcion(
  e: { vinculoId: string; metodo: string; desde: string; hasta: string; motivo: string },
  hoy: string
): { campo: CampoExcepcion; clave: ErrorExcepcion } | null {
  if (e.metodo && !esMetodoM0(e.metodo)) return { campo: 'metodo', clave: 'metodo' };
  const error = validarExcepcion(e, hoy);
  return error ? { campo: CAMPO_ERROR[error], clave: error } : null;
}

export type ClaveErrorExcepcion =
  | ErrorExcepcion
  | 'noPropio'
  | 'personaNoExiste'
  | 'vigencia'
  | 'sinPermiso'
  | 'generico';

/** Código de error del servidor → campo (si lo hay) y clave de texto (`excepcion.errores.*`). */
export function errorServidorExcepcion(codigo: string): { campo: CampoExcepcion | null; clave: ClaveErrorExcepcion } {
  switch (codigo) {
    case 'no_propio':
      return { campo: 'persona', clave: 'noPropio' };
    case 'no_existe':
      return { campo: 'persona', clave: 'personaNoExiste' };
    case 'excepcion_persona':
      return { campo: 'persona', clave: 'persona' };
    case 'metodo_invalido':
    case 'excepcion_metodo':
      return { campo: 'metodo', clave: 'metodo' };
    case 'excepcion_fechas':
      return { campo: 'hasta', clave: 'fechas' };
    case 'excepcion_tope':
      return { campo: 'hasta', clave: 'tope' };
    case 'excepcion_pasado':
      return { campo: 'hasta', clave: 'pasado' };
    case 'vigencia_invalida':
      return { campo: 'hasta', clave: 'vigencia' };
    case 'motivo_requerido':
    case 'excepcion_motivo':
      return { campo: 'motivo', clave: 'motivo' };
    case 'sin_permiso':
      return { campo: null, clave: 'sinPermiso' };
    default:
      return { campo: null, clave: 'generico' };
  }
}

// ─── Letrero ─────────────────────────────────────────────────────────────────

/** Métodos que se muestran en el letrero: los de M0 activos en la sede, en su orden. */
export function metodosLetrero(metodos: Partial<Record<string, MetodoApi>> | null | undefined): MetodoM0[] {
  const f = formularioDesde(metodos);
  const activo: Record<MetodoM0, boolean> = { celular_ubicacion: f.celular.activo, qr: f.qr.activo, nfc_etiqueta: f.nfc.activo };
  return METODOS_M0.filter((m) => activo[m]);
}
