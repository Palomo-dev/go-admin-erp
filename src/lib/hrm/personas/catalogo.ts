/**
 * Catálogos de la parte «personas» de Recursos humanos (fase 1): empleados,
 * ficha, registrar un cambio y alta. Sin React ni base: lo usan el servidor,
 * las pantallas y las pruebas.
 *
 * Decisiones del dueño (2026-11-15): seguridad social es un evento con fecha de
 * efecto; el grupo de datos de cada documento lo decide el SERVIDOR a partir de
 * la categoría (nunca el navegador).
 */
import type { GrupoDatos } from '@/lib/services/hrm/tipos';

/** Tipos de documento de identidad (DIAN / PILA), los mismos de `hr_people_identification`. */
export const TIPOS_DOCUMENTO = ['CC', 'CE', 'TI', 'RC', 'PA', 'PEP', 'PPT', 'NIT', 'NUIP', 'DIE'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export function esTipoDocumento(v: unknown): v is TipoDocumento {
  return typeof v === 'string' && (TIPOS_DOCUMENTO as readonly string[]).includes(v);
}

/** Número de documento sin puntos ni espacios («1.036.654.321» → «1036654321»). */
export function normalizarNumeroDocumento(v: string): string {
  return v.replace(/[.\s-]/g, '').trim();
}

/** «1036654321» → «1.036.654.321» (solo números de cédula y similares). */
export function formatearNumeroDocumento(v: string | null | undefined): string {
  if (!v) return '';
  return /^\d+$/.test(v) ? v.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : v;
}

/** Tipos de contrato (`employments.contract_type`). */
export const TIPOS_CONTRATO = ['indefinite', 'fixed_term', 'project', 'apprenticeship', 'service', 'hourly'] as const;
export type TipoContrato = (typeof TIPOS_CONTRATO)[number];

/** Estado visible del vínculo (lo calcula `fn_hr_estado_vinculo`). */
export const ESTADOS_EMPLEADO = ['activo', 'periodo_prueba', 'por_ingresar', 'suspendido', 'retirado'] as const;
export type EstadoEmpleado = (typeof ESTADOS_EMPLEADO)[number];

export const TONO_ESTADO_EMPLEADO: Record<EstadoEmpleado, 'exito' | 'informacion' | 'marca' | 'advertencia' | 'neutro'> = {
  activo: 'exito',
  periodo_prueba: 'informacion',
  por_ingresar: 'marca',
  suspendido: 'advertencia',
  retirado: 'neutro',
};

/** Subsistemas de seguridad social (campos del historial). */
export const SUBSISTEMAS = ['eps', 'afp', 'arl', 'ccf', 'cesantias'] as const;
export type Subsistema = (typeof SUBSISTEMAS)[number];

/**
 * Los cinco tipos de cambio que se registran con fecha de efecto y aprobación
 * (decisión 6). Cada tipo agrupa los campos del historial que mueve.
 */
export const TIPOS_CAMBIO = ['salario', 'cargo', 'sede', 'jornada', 'seguridad_social'] as const;
export type TipoCambio = (typeof TIPOS_CAMBIO)[number];

/** Grupo de datos de cada carpeta de documentos. */
export const CARPETAS_DOCUMENTO = [
  'identificacion',
  'contratacion',
  'seguridad_social',
  'pago',
  'certificaciones',
  'salud',
  'disciplinarios',
] as const;
export type CarpetaDocumento = (typeof CARPETAS_DOCUMENTO)[number];

interface CategoriaDocumento {
  carpeta: CarpetaDocumento;
  grupo: GrupoDatos;
  /** Se puede leer con IA (documento de identidad). */
  ia?: boolean;
}

/**
 * Categoría → carpeta y grupo de datos. El contrato lleva el salario, así que
 * va con «salario y pago»; el concepto médico solo con permiso de salud. La
 * historia clínica nunca se guarda (Resolución 1843 de 2025).
 */
export const CATEGORIAS_DOCUMENTO: Record<string, CategoriaDocumento> = {
  documento_identidad: { carpeta: 'identificacion', grupo: 'identificacion', ia: true },
  hoja_vida: { carpeta: 'contratacion', grupo: 'identificacion' },
  contrato_trabajo: { carpeta: 'contratacion', grupo: 'salario_pago' },
  otrosi: { carpeta: 'contratacion', grupo: 'salario_pago' },
  afiliacion_eps: { carpeta: 'seguridad_social', grupo: 'identificacion' },
  afiliacion_afp: { carpeta: 'seguridad_social', grupo: 'identificacion' },
  afiliacion_arl: { carpeta: 'seguridad_social', grupo: 'identificacion' },
  afiliacion_ccf: { carpeta: 'seguridad_social', grupo: 'identificacion' },
  afiliacion_cesantias: { carpeta: 'seguridad_social', grupo: 'identificacion' },
  certificado_bancario: { carpeta: 'pago', grupo: 'banco' },
  certificacion: { carpeta: 'certificaciones', grupo: 'identificacion' },
  soporte_cambio: { carpeta: 'contratacion', grupo: 'salario_pago' },
  concepto_aptitud: { carpeta: 'salud', grupo: 'salud' },
  // Soporte de una incapacidad o licencia (ADR-002 §6): grupo salud, lo enlaza `leave_requests.document_id`.
  soporte_ausencia: { carpeta: 'salud', grupo: 'salud' },
  disciplinario: { carpeta: 'disciplinarios', grupo: 'disciplinario' },
  registro_civil_beneficiario: { carpeta: 'identificacion', grupo: 'identificacion' },
};

export function categoriaDocumento(categoria: string): CategoriaDocumento | null {
  return Object.prototype.hasOwnProperty.call(CATEGORIAS_DOCUMENTO, categoria) ? CATEGORIAS_DOCUMENTO[categoria] : null;
}

export function grupoDeCategoria(categoria: string): GrupoDatos | null {
  return categoriaDocumento(categoria)?.grupo ?? null;
}

export function carpetaDeCategoria(categoria: string): CarpetaDocumento {
  return categoriaDocumento(categoria)?.carpeta ?? 'contratacion';
}

/** Afiliación que corresponde a un subsistema (soporte obligatorio de un traslado). */
export function categoriaAfiliacion(s: Subsistema): string {
  return `afiliacion_${s}`;
}

/** Parentescos de contactos y beneficiarios. */
export const PARENTESCOS = [
  'conyuge',
  'companero_permanente',
  'hijo',
  'hija',
  'padre',
  'madre',
  'hermano',
  'hermana',
  'abuelo',
  'abuela',
  'otro',
] as const;

/** Motivos de un cambio (el texto libre va en la nota). */
export const MOTIVOS_CAMBIO: Record<TipoCambio, readonly string[]> = {
  salario: ['ajuste_desempeno', 'incremento_anual', 'promocion', 'ajuste_mercado', 'correccion', 'otro'],
  cargo: ['promocion', 'reubicacion', 'reestructuracion', 'encargo', 'otro'],
  sede: ['necesidad_servicio', 'solicitud_trabajador', 'apertura_sede', 'otro'],
  jornada: ['acuerdo_trabajador', 'reduccion_ley', 'necesidad_servicio', 'otro'],
  seguridad_social: ['traslado_trabajador', 'cambio_entidad', 'correccion', 'otro'],
};
