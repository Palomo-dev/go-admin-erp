/**
 * Tipos y utilidades compartidas de la fase 0 de Recursos humanos.
 * Ver docs/hrm/ADR-001-modelo-fundaciones.md.
 *
 * Este módulo no toca la base: lo pueden importar el servidor y las pruebas.
 */

/** Grupos de datos sensibles (los mismos de `fn_hr_grupos_datos()`). */
export const GRUPOS_DATOS = ['identificacion', 'salario_pago', 'banco', 'salud', 'disciplinario', 'sst'] as const;
export type GrupoDatos = (typeof GRUPOS_DATOS)[number];

/** Grupos que se editan directamente; el salario va por el historial y los demás por su propio flujo. */
export const GRUPOS_EDITABLES = ['identificacion', 'banco'] as const satisfies readonly GrupoDatos[];

/** Campos del historial con fecha de efecto (`hr_employment_events.field`). */
export const CAMPOS_HISTORIAL = [
  'salario',
  'periodo_salario',
  'cargo',
  'sede',
  'area',
  'jefe',
  'jornada_horas_semana',
  'tipo_contrato',
  'fin_contrato',
  'centro_costo',
  'tipo_vinculacion',
] as const;
export type CampoHistorial = (typeof CAMPOS_HISTORIAL)[number];

/** Categorías de documento aceptadas (formato de `hr_documents.category`). */
const CATEGORIA_RE = /^[a-z][a-z0-9_]{2,40}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODIGO_PARAMETRO_RE = /^[a-z][a-z0-9_]{2,60}$/;

export const TIPOS_DOCUMENTO_PERMITIDOS = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
] as const;
export const TAMANO_MAXIMO_DOCUMENTO = 10 * 1024 * 1024;

export function esGrupoDatos(v: unknown): v is GrupoDatos {
  return typeof v === 'string' && (GRUPOS_DATOS as readonly string[]).includes(v);
}

export function esGrupoEditable(v: unknown): v is (typeof GRUPOS_EDITABLES)[number] {
  return typeof v === 'string' && (GRUPOS_EDITABLES as readonly string[]).includes(v);
}

export function esCampoHistorial(v: unknown): v is CampoHistorial {
  return typeof v === 'string' && (CAMPOS_HISTORIAL as readonly string[]).includes(v);
}

export function esUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** Fecha calendario `YYYY-MM-DD` válida (no se convierte de zona: es un `date`). */
export function esFechaPlana(v: unknown): v is string {
  if (typeof v !== 'string' || !FECHA_RE.test(v)) return false;
  const [a, m, d] = v.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

export function esCategoriaDocumento(v: unknown): v is string {
  return typeof v === 'string' && CATEGORIA_RE.test(v);
}

export function esCodigoParametro(v: unknown): v is string {
  return typeof v === 'string' && CODIGO_PARAMETRO_RE.test(v);
}

/** Extensión segura para la ruta del archivo, según el tipo MIME declarado. */
export function extensionDeTipo(mime: string): string {
  switch (mime) {
    case 'application/pdf':
      return 'pdf';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/heic':
      return 'heic';
    default:
      return 'jpg';
  }
}

/**
 * Ruta del objeto en el bucket `hr-documentos`:
 * `{organización}/{grupo}/{persona}/{uuid}.{ext}`. La misma forma que exigen
 * `fn_hr_storage_puede_subir` y `fn_hr_documento_registrar`.
 */
export function rutaDocumento(org: number, grupo: GrupoDatos, personaId: string, archivoId: string, mime: string): string {
  return `${org}/${grupo}/${personaId}/${archivoId}.${extensionDeTipo(mime)}`;
}

/** Error de dominio con su estado HTTP. Lo convierten los route handlers. */
export class HrmError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string
  ) {
    super(message ?? code);
    this.name = 'HrmError';
  }
}

interface ErrorPostgrest {
  code?: string | null;
  message?: string | null;
}

/**
 * Traduce el error de una RPC de HRM a un `HrmError`. El código lo pone la
 * función en la base (42501 sin permiso, P0002 no existe, 22023 dato inválido,
 * 23505 duplicado, 55000 estado, 23P01 vigencias cruzadas).
 */
export function errorDeRpc(error: ErrorPostgrest): HrmError {
  const msg = (error.message ?? '').trim();
  const primera = msg.split(':')[0]?.trim() || 'error';
  switch (error.code) {
    case '42501':
      return new HrmError(403, primera === 'sin_permiso' ? 'sin_permiso' : primera, msg);
    case 'P0002':
      return new HrmError(404, 'no_existe', msg);
    case '22023':
    case '22P02':
    case '22007':
    case '22008':
      return new HrmError(422, primera, msg);
    case '23505':
      return new HrmError(409, primera === 'documento_duplicado' ? 'documento_duplicado' : 'duplicado', msg);
    case '55000':
    case '23P01':
    case '40001':
      return new HrmError(409, primera, msg);
    default:
      return new HrmError(500, 'error_hrm', 'No se pudo completar la operación de RR. HH.');
  }
}

/** Datos de la petición original que viajan al registro de accesos. */
export interface ContextoPeticion {
  ip: string | null;
  userAgent: string | null;
  ruta: string | null;
}

/** IP, agente y ruta de la petición original (no del servidor que llama a la base). */
export function contextoDePeticion(req: Pick<Request, 'headers' | 'url'>): ContextoPeticion {
  const xff = req.headers.get('x-forwarded-for');
  const ip = (xff ? xff.split(',')[0]?.trim() : null) || req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip') || null;
  let ruta: string | null = null;
  try {
    ruta = new URL(req.url).pathname;
  } catch {
    ruta = null;
  }
  return {
    ip: ip && /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null,
    userAgent: req.headers.get('user-agent')?.slice(0, 500) ?? null,
    ruta,
  };
}
