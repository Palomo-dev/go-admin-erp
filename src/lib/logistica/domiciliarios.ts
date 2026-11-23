/**
 * Domiciliarios (logística Fase 1): alta rápida, estado y carga del día. Puro.
 *
 * Un domiciliario es una fila de `driver_credentials` (migración 20261123145040). Puede ser
 * EXTERNO —sin contrato en Recursos humanos: nombre, celular y documento propios, sin licencia— o
 * empleado (`employment_id`; el disparador completa organización y usuario). El esquema de alta es
 * el mismo en la pantalla y en la ruta del servidor.
 */
import { z } from 'zod';
import { toPlainDate } from '@/lib/utils/dateCore';
import { ESTADOS_CON_PAQUETE, ESTADOS_EN_RUTA } from './misEnvios';

/** CHECK de `driver_credentials.vehicle_type`. */
export const TIPOS_VEHICULO = ['motorcycle', 'bicycle', 'car', 'van', 'on_foot', 'other'] as const;
export type TipoVehiculo = (typeof TIPOS_VEHICULO)[number];

/** Documentos que se piden en el alta (Colombia, Fase 1). */
export const TIPOS_DOCUMENTO = ['CC', 'CE', 'PPT', 'PA', 'TI'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

const texto = (max: number) => z.string().trim().max(max);

export const altaDomiciliarioSchema = z
  .object({
    nombre: texto(120).min(3),
    celular: texto(30).refine((v) => v.replace(/\D/g, '').length >= 7, { message: 'celular' }),
    tipoDocumento: z.enum(TIPOS_DOCUMENTO),
    /** Obligatorio para el externo; el empleado ya está identificado en Recursos humanos. */
    documento: texto(30).regex(/^([0-9A-Za-z.\- ]{4,30})?$/),
    branchId: z.number().int().positive(),
    tipoVehiculo: z.enum(TIPOS_VEHICULO).nullable().optional(),
    cobraContraentrega: z.boolean().default(true),
    /** Empleado de Recursos humanos («Traer desde Recursos humanos»). */
    employmentId: z.string().uuid().nullable().optional(),
    /** Externo con cuenta en GO Admin (para «Mis envíos»): un miembro activo de la organización. */
    userId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine((a) => !!a.employmentId || a.documento.replace(/[.\s-]/g, '').length >= 4, { path: ['documento'], message: 'documento' });
export type AltaDomiciliario = z.infer<typeof altaDomiciliarioSchema>;

/** Documento sin puntos ni espacios: 1.020.456.789 → 1020456789. */
export function normalizarDocumento(v: string): string {
  return v.replace(/[.\s-]/g, '').toUpperCase();
}

/** Lo que se escribe en `driver_credentials` (la organización la pone el servidor, de la sesión). */
export function filaAlta(a: AltaDomiciliario, organizationId: number) {
  return {
    organization_id: organizationId,
    branch_id: a.branchId,
    full_name: a.nombre.trim().replace(/\s+/g, ' '),
    phone: a.celular.trim(),
    document_type: normalizarDocumento(a.documento) ? a.tipoDocumento : null,
    document_number: normalizarDocumento(a.documento) || null,
    vehicle_type: a.tipoVehiculo ?? null,
    employment_id: a.employmentId ?? null,
    // Con empleo el disparador pone el usuario del empleado; sin empleo, el elegido (o ninguno).
    user_id: a.employmentId ? null : a.userId ?? null,
    is_active: true,
    metadata: { cobra_contraentrega: a.cobraContraentrega, origen_alta: 'logistica' },
  };
}

/** Errores de la base que la pantalla traduce (índices únicos y disparador). */
export function codigoErrorAlta(error: { code?: string | null; message?: string | null } | null | undefined): 'duplicado' | 'empleo_ajeno' | 'error' {
  const m = error?.message ?? '';
  if (error?.code === '23505') return 'duplicado';
  if (m.includes('EMPLEO_DE_OTRA_ORGANIZACION')) return 'empleo_ajeno';
  return 'error';
}

// ── Estado y carga del día ──────────────────────────────────────────────────

export type EstadoDomiciliario = 'libre' | 'en_ruta' | 'fuera_de_turno' | 'inactivo';

export interface EnvioDeCarga {
  status: string;
  delivered_at?: string | null;
  cod_status?: string | null;
  cod_collected_amount?: number | string | null;
}

export interface CargaDelDia {
  asignados: number;
  enCamino: number;
  entregadosHoy: number;
  novedades: number;
  /** Contraentrega cobrada y aún sin cuadrar. */
  porCuadrar: number;
}

export function cargaDelDia(envios: readonly EnvioDeCarga[], hoy: string, zona: string): CargaDelDia {
  let asignados = 0;
  let enCamino = 0;
  let entregadosHoy = 0;
  let novedades = 0;
  let porCuadrar = 0;
  for (const e of envios) {
    if (ESTADOS_EN_RUTA.includes(e.status)) asignados += 1;
    if (ESTADOS_CON_PAQUETE.includes(e.status)) enCamino += 1;
    if (e.status === 'failed_attempt') novedades += 1;
    if (e.status === 'delivered' && e.delivered_at && toPlainDate(new Date(e.delivered_at), zona) === hoy) entregadosHoy += 1;
    if (e.cod_status === 'collected') porCuadrar += Math.round((Number(e.cod_collected_amount) || 0) * 100);
  }
  return { asignados, enCamino, entregadosHoy, novedades, porCuadrar: porCuadrar / 100 };
}

/**
 * Estado del domiciliario:
 * - inactivo: `is_active = false`;
 * - en ruta: lleva al menos un paquete encima;
 * - fuera de turno: cerró la jornada hoy en «Mis envíos» (`metadata.fin_jornada_at`) y no lleva nada;
 * - libre: lo demás.
 */
export function estadoDomiciliario(
  d: { is_active?: boolean | null; metadata?: Record<string, unknown> | null },
  carga: Pick<CargaDelDia, 'enCamino'>,
  hoy: string,
  zona: string,
): EstadoDomiciliario {
  if (d.is_active === false) return 'inactivo';
  if (carga.enCamino > 0) return 'en_ruta';
  const fin = typeof d.metadata?.fin_jornada_at === 'string' ? new Date(d.metadata.fin_jornada_at) : null;
  if (fin && !isNaN(fin.getTime()) && toPlainDate(fin, zona) === hoy) return 'fuera_de_turno';
  return 'libre';
}

/** Tono del `StatusBadge` de cada estado. */
export const TONO_ESTADO_DOMICILIARIO: Readonly<Record<EstadoDomiciliario, 'exito' | 'informacion' | 'neutro' | 'advertencia'>> = {
  libre: 'exito',
  en_ruta: 'informacion',
  fuera_de_turno: 'neutro',
  inactivo: 'advertencia',
};

/** ¿Cobra contraentrega? (default sí: la mayoría de los domicilios propios cobran). */
export function cobraContraentrega(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.cobra_contraentrega !== false;
}

/** Nombre visible: el propio (externo) o el del perfil del empleado. */
export function nombreDomiciliario(d: {
  full_name?: string | null;
  employee?: { first_name?: string | null; last_name?: string | null } | null;
}): string {
  const propio = (d.full_name ?? '').trim();
  if (propio) return propio;
  return [d.employee?.first_name, d.employee?.last_name].map((s) => (s ?? '').trim()).filter(Boolean).join(' ');
}
