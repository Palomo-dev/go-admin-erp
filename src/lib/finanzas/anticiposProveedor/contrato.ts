/**
 * Contrato de los anticipos a proveedores (`supplier_advances` +
 * `supplier_advance_applications`, migración 20261108120000 aplicada, y las
 * correcciones del Contador P1/P6/P7 de 20261108170000, sin aplicar): route
 * handlers de `/api/anticipos-proveedor/**`, servicio de servidor, cliente del
 * navegador y pruebas. Módulo hoja, sin React ni Supabase.
 *
 * Es el espejo del saldo a favor de clientes (`lib/finanzas/saldosAFavor/contrato.ts`):
 * mismos cuerpos de aplicar, devolver y anular, y un anticipo con proveedor en
 * vez de cliente y sin vencimiento. Toda escritura es UNA RPC transaccional:
 * - crear    → `fn_anticipo_proveedor_registrar` (naturaleza obligatoria, retenciones
 *              evaluadas, cuenta de detalle; comprobante CE + payments + saldo + asiento)
 * - evaluar  → `fn_anticipo_proveedor_evaluar_retenciones` (vista previa, no escribe)
 * - aplicar  → `fn_anticipo_proveedor_aplicar` (a una cuenta por pagar)
 * - devolver → `fn_anticipo_proveedor_devolver` (el proveedor regresa el dinero)
 * - anular   → `fn_anticipo_proveedor_anular_por_error` (solo si el desembolso NO
 *              ocurrió: motivo, soporte y fecha del ajuste; contra-asiento)
 * - conciliar → `fn_anticipos_proveedor_conciliacion` (por anticipo y por proveedor)
 */
import { z } from 'zod';
import { ERRORES_SALDO_FAVOR, estadoHttpErrorSaldoFavor, type ErrorSaldoFavor } from '@/lib/finanzas/saldosAFavor/contrato';

export const ERRORES_ANTICIPO_PROVEEDOR = [
  ...ERRORES_SALDO_FAVOR,
  'pendiente_de_activar',
  'anticipo_no_encontrado',
  'anticipo_no_disponible',
  'anticipo_usado',
  'monto_excede_anticipo',
  'proveedor_no_encontrado',
  'proveedor_distinto',
  'cuenta_no_encontrada',
  'sin_cuenta_anticipos',
  'sin_cuenta_por_pagar',
  // Correcciones del Contador (20261108170000).
  'naturaleza_obligatoria',
  'tarifa_iva_obligatoria',
  'tarifa_iva_invalida',
  'concepto_retencion_invalido',
  'concepto_retefuente_obligatorio',
  'retencion_excede_monto',
  'cuenta_anticipos_no_configurada',
  'cuenta_anticipos_no_detalle',
  'cxp_sin_causacion',
  'soporte_obligatorio',
  'anulacion_requiere_declaracion',
  'fecha_ajuste_futura',
  'fecha_ajuste_anterior_al_anticipo',
  'periodo_cerrado',
  'contra_asiento_no_creado',
  'asiento_no_encontrado',
] as const;
export type ErrorAnticipoProveedor = (typeof ERRORES_ANTICIPO_PROVEEDOR)[number];

/** Código estable a partir del mensaje de la RPC (`raise exception '<codigo>'`). */
export function codigoErrorAnticipo(mensaje: string | null | undefined): ErrorAnticipoProveedor {
  const texto = (mensaje ?? '').trim();
  if (texto.startsWith('Acceso denegado a la organización')) return 'sin_permiso';
  const primero = texto.split(/[\s:]/)[0];
  return (ERRORES_ANTICIPO_PROVEEDOR as readonly string[]).includes(primero) ? (primero as ErrorAnticipoProveedor) : 'error_desconocido';
}

export function estadoHttpErrorAnticipo(codigo: ErrorAnticipoProveedor): number {
  switch (codigo) {
    case 'pendiente_de_activar':
      return 501;
    case 'anticipo_no_encontrado':
    case 'proveedor_no_encontrado':
    case 'cuenta_no_encontrada':
      return 404;
    case 'anticipo_no_disponible':
    case 'anticipo_usado':
    case 'anulacion_requiere_declaracion':
    case 'periodo_cerrado':
      return 409;
    case 'sin_cuenta_anticipos':
    case 'sin_cuenta_por_pagar':
    case 'contra_asiento_no_creado':
    case 'asiento_no_encontrado':
      return 500;
    // Pendientes contables: la organización tiene que configurar algo antes (no es un error del servidor).
    case 'cuenta_anticipos_no_configurada':
    case 'cuenta_anticipos_no_detalle':
    case 'cxp_sin_causacion':
      return 409;
    case 'monto_excede_anticipo':
    case 'proveedor_distinto':
    case 'naturaleza_obligatoria':
    case 'tarifa_iva_obligatoria':
    case 'tarifa_iva_invalida':
    case 'concepto_retencion_invalido':
    case 'concepto_retefuente_obligatorio':
    case 'retencion_excede_monto':
    case 'soporte_obligatorio':
    case 'fecha_ajuste_futura':
    case 'fecha_ajuste_anterior_al_anticipo':
      return 422;
    default:
      return estadoHttpErrorSaldoFavor(codigo as ErrorSaldoFavor);
  }
}

/**
 * La tabla o la función todavía no existen en la base (migración sin aplicar):
 * PostgREST PGRST202 (función) o PGRST205 / 42P01 (tabla), Postgres 42883.
 * Cualquier otro error se muestra como error, nunca como «pendiente».
 */
export function esPendienteDeActivar(error: unknown): boolean {
  const e = (error ?? {}) as { code?: unknown; message?: unknown };
  if (e.code === 'PGRST202' || e.code === 'PGRST205' || e.code === '42P01' || e.code === '42883') return true;
  return typeof e.message === 'string' && /(supplier_advance|fn_anticipo_proveedor)/i.test(e.message) && /(does not exist|could not find)/i.test(e.message);
}

const UUID = z.string().uuid();
const IMPORTE = z.number().finite().positive().max(1e12);
const CLAVE = z.string().min(8).max(200);

/**
 * P1 del Contador: la naturaleza del anticipo es obligatoria y no tiene valor
 * por defecto. «Financiación»: anticipo verdadero que se amortiza; la retención
 * se practica al causar con la factura. «Pago anticipado del precio»: la
 * retención se evalúa al girar.
 */
export const NATURALEZAS_ANTICIPO = ['financiacion', 'pago_anticipado_precio'] as const;
export type NaturalezaAnticipo = (typeof NATURALEZAS_ANTICIPO)[number];

/** Lo que la evaluación de retenciones necesita, igual en la vista previa y al registrar. */
const datosRetencion = {
  naturaleza: z.enum(NATURALEZAS_ANTICIPO),
  /** IVA de la operación (0 = sin IVA). Obligatorio en «pago anticipado del precio». */
  tarifa_iva: z.number().finite().min(0).max(99.99).nullable().optional(),
  /** Concepto de retención en la fuente configurado (organization_taxes). */
  retefuente_id: UUID.nullable().optional(),
  /** Retención de ICA configurada del municipio; sin ella, reteICA queda «pendiente». */
  reteica_id: UUID.nullable().optional(),
};

const exigeTarifa = (d: { naturaleza: NaturalezaAnticipo; tarifa_iva?: number | null }) =>
  d.naturaleza !== 'pago_anticipado_precio' || (d.tarifa_iva !== null && d.tarifa_iva !== undefined);

export const crearAnticipoSchema = z
  .object({
    proveedor_id: z.number().int().positive(),
    sucursal_id: z.number().int().positive(),
    monto: IMPORTE,
    metodo: z.string().min(1).max(40),
    cuenta_bancaria: z.number().int().positive().nullable().optional(),
    referencia: z.string().max(200).nullable().optional(),
    notas: z.string().max(2000).nullable().optional(),
    clave_idempotencia: CLAVE,
    ...datosRetencion,
  })
  .strict()
  .refine(exigeTarifa, { path: ['tarifa_iva'], message: 'tarifa_iva_obligatoria' });
export type SolicitudCrearAnticipo = z.infer<typeof crearAnticipoSchema>;

export const aplicarAnticipoSchema = z
  .object({
    cuenta_id: UUID,
    monto: IMPORTE,
    clave_idempotencia: CLAVE,
  })
  .strict();
export type SolicitudAplicarAnticipo = z.infer<typeof aplicarAnticipoSchema>;

/** Vista previa de las retenciones (no escribe nada). */
export const evaluarRetencionesSchema = z
  .object({ proveedor_id: z.number().int().positive(), monto: IMPORTE, ...datosRetencion })
  .strict()
  .refine(exigeTarifa, { path: ['tarifa_iva'], message: 'tarifa_iva_obligatoria' });
export type SolicitudEvaluarRetenciones = z.infer<typeof evaluarRetencionesSchema>;

/** P7: una devolución real lleva su soporte (consignación, recibo, transferencia) en `referencia`. */
export const devolverAnticipoSchema = z
  .object({
    monto: IMPORTE,
    metodo: z.string().min(1).max(40),
    motivo: z.string().trim().min(3).max(500),
    cuenta_bancaria: z.number().int().positive().nullable().optional(),
    referencia: z.string().trim().min(3).max(200),
    clave_idempotencia: CLAVE,
  })
  .strict();
export type SolicitudDevolverAnticipo = z.infer<typeof devolverAnticipoSchema>;

const DIA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * P7: anular solo procede si se declara que el desembolso registrado NO
 * ocurrió (corrección de un error), con motivo, soporte y la fecha del ajuste
 * documentado. Si el dinero salió, se registra la devolución o se mantiene el
 * derecho frente al proveedor.
 */
export const anularAnticipoSchema = z
  .object({
    declaracion: z.literal('desembolso_no_ocurrio'),
    motivo: z.string().trim().min(3).max(500),
    soporte: z.string().trim().min(3).max(500),
    fecha_ajuste: DIA.nullable().optional(),
  })
  .strict();
export type SolicitudAnularAnticipo = z.infer<typeof anularAnticipoSchema>;

export interface ResultadoCrearAnticipo {
  anticipo_id: string;
  grupo_id: string;
  recibo: string;
  repetida: boolean;
  caja_id: number | null;
  monto: number;
  /** Lo que salió de caja o banco: monto − retención practicada. */
  girado?: number;
  retencion?: number;
  retencion_pendiente?: boolean;
}

// ─── Retenciones evaluadas (P1) ─────────────────────────────────────────────

export type ClaseRetencionAnticipo = 'retefuente' | 'reteiva' | 'reteica';
export type EstadoRetencionAnticipo = 'practicar' | 'no_aplica' | 'pendiente';

export interface RetencionEvaluada {
  clase: ClaseRetencionAnticipo;
  estado: EstadoRetencionAnticipo;
  /** Por qué no aplica o por qué queda pendiente (clave de texto estable). */
  motivo: string | null;
  concepto: string | null;
  tarifa: number | null;
  base: number | null;
  valor: number;
  cuenta: string | null;
}

export interface OpcionRetencion {
  id: string;
  nombre: string;
  tarifa: number;
}

export interface EvaluacionRetenciones {
  naturaleza: NaturalezaAnticipo;
  monto: number;
  base: number | null;
  iva: number | null;
  clases: RetencionEvaluada[];
  total: number;
  /** Lo que sale de caja o banco. */
  neto: number;
  /** Alguna clase quedó sin evaluar: pendiente contable visible. */
  pendiente: boolean;
  opciones: { retefuente: OpcionRetencion[]; reteica: OpcionRetencion[] };
}

const num = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};
const numONulo = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : num(v));
const textoONulo = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const CLASES_RETENCION: readonly ClaseRetencionAnticipo[] = ['retefuente', 'reteiva', 'reteica'];
const ESTADOS_RETENCION: readonly EstadoRetencionAnticipo[] = ['practicar', 'no_aplica', 'pendiente'];
const esNaturaleza = (v: unknown): v is NaturalezaAnticipo => v === 'financiacion' || v === 'pago_anticipado_precio';

/** jsonb de `fn_anticipo_proveedor_evaluar_retenciones` → forma tipada. */
export function aEvaluacionRetenciones(data: unknown): EvaluacionRetenciones {
  const d = (data ?? {}) as Record<string, unknown>;
  const clases = Array.isArray(d.clases) ? (d.clases as Record<string, unknown>[]) : [];
  const opciones = (d.opciones ?? {}) as Record<string, unknown>;
  const aOpciones = (v: unknown): OpcionRetencion[] =>
    (Array.isArray(v) ? (v as Record<string, unknown>[]) : []).map((o) => ({ id: String(o.id), nombre: String(o.nombre ?? ''), tarifa: num(o.tarifa) }));
  return {
    naturaleza: esNaturaleza(d.naturaleza) ? d.naturaleza : 'pago_anticipado_precio',
    monto: num(d.monto),
    base: numONulo(d.base),
    iva: numONulo(d.iva),
    clases: clases.map((c) => {
      const estado = ESTADOS_RETENCION.includes(c.estado as EstadoRetencionAnticipo) ? (c.estado as EstadoRetencionAnticipo) : 'pendiente';
      return {
        clase: CLASES_RETENCION.includes(c.clase as ClaseRetencionAnticipo) ? (c.clase as ClaseRetencionAnticipo) : 'retefuente',
        estado,
        motivo: textoONulo(c.motivo),
        concepto: textoONulo(c.concepto),
        tarifa: numONulo(c.tarifa),
        base: numONulo(c.base),
        valor: estado === 'practicar' ? num(c.valor) : 0,
        cuenta: textoONulo(c.cuenta),
      };
    }),
    total: num(d.total),
    neto: num(d.neto),
    pendiente: d.pendiente === true,
    opciones: { retefuente: aOpciones(opciones.retefuente), reteica: aOpciones(opciones.reteica) },
  };
}

// ─── Cuenta del anticipo (P6) ───────────────────────────────────────────────

/** `fn_cuenta_anticipo_proveedor_estado`: ok · sin_configurar · no_existe · fuera_de_1330 · no_es_detalle. */
export interface EstadoCuentaAnticipo {
  estado: 'ok' | 'sin_configurar' | 'no_existe' | 'fuera_de_1330' | 'no_es_detalle';
  cuenta: string | null;
  configurada: string | null;
  /** 13300501 si existe en el plan y es de detalle (sugerencia de producto; no se crea). */
  sugerida: string | null;
}

const ESTADOS_CUENTA: readonly EstadoCuentaAnticipo['estado'][] = ['ok', 'sin_configurar', 'no_existe', 'fuera_de_1330', 'no_es_detalle'];

export function aEstadoCuentaAnticipo(data: unknown): EstadoCuentaAnticipo {
  const d = (data ?? {}) as Record<string, unknown>;
  const estado = ESTADOS_CUENTA.includes(d.estado as EstadoCuentaAnticipo['estado']) ? (d.estado as EstadoCuentaAnticipo['estado']) : 'sin_configurar';
  return { estado, cuenta: textoONulo(d.cuenta), configurada: textoONulo(d.configurada), sugerida: textoONulo(d.sugerida) };
}

// ─── Conciliación por anticipo y por proveedor (P6) ─────────────────────────

export interface ConciliacionAnticipo {
  anticipoId: string;
  proveedor: string;
  nit: string | null;
  cuenta: string;
  recibo: string | null;
  naturaleza: NaturalezaAnticipo | null;
  valor: number;
  retencion: number;
  girado: number;
  aplicado: number;
  retencionDescontada: number;
  devuelto: number;
  anulado: number;
  saldo: number;
  saldoLibros: number;
  cuadra: boolean;
}

export interface ConciliacionProveedor {
  proveedor: string;
  nit: string | null;
  anticipos: number;
  saldo: number;
  saldoLibros: number;
  auxiliarNit: number;
}

export interface RespuestaConciliacion {
  anticipos: ConciliacionAnticipo[];
  proveedores: ConciliacionProveedor[];
}

export function aConciliacion(data: unknown): RespuestaConciliacion {
  const d = (data ?? {}) as Record<string, unknown>;
  const lista = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  return {
    anticipos: lista(d.anticipos).map((a) => ({
      anticipoId: String(a.anticipo_id),
      proveedor: String(a.proveedor ?? ''),
      nit: textoONulo(a.nit),
      cuenta: String(a.cuenta ?? ''),
      recibo: textoONulo(a.recibo),
      naturaleza: esNaturaleza(a.naturaleza) ? a.naturaleza : null,
      valor: num(a.valor),
      retencion: num(a.retencion),
      girado: num(a.girado),
      aplicado: num(a.aplicado),
      retencionDescontada: num(a.retencion_descontada),
      devuelto: num(a.devuelto),
      anulado: num(a.anulado),
      saldo: num(a.saldo),
      saldoLibros: num(a.saldo_libros),
      cuadra: a.cuadra === true,
    })),
    proveedores: lista(d.proveedores).map((p) => ({
      proveedor: String(p.proveedor ?? ''),
      nit: textoONulo(p.nit),
      anticipos: num(p.anticipos),
      saldo: num(p.saldo),
      saldoLibros: num(p.saldo_libros),
      auxiliarNit: num(p.auxiliar_nit),
    })),
  };
}

/** Estado vivo de un anticipo en la pantalla. */
export type EstadoAnticipo = 'disponible' | 'aplicado' | 'anulado';

/** Fila del listado «Anticipos a proveedores» (Figma `2335:140495`). */
export interface FilaAnticipoProveedor {
  id: string;
  proveedorId: string;
  proveedor: string;
  proveedorNit: string | null;
  fecha: string;
  valor: number;
  aplicado: number;
  devuelto: number;
  saldo: number;
  estado: EstadoAnticipo;
  recibo: string | null;
  sucursalId: number | null;
  notas: string | null;
  /** null en anticipos anteriores a las correcciones del Contador. */
  naturaleza?: NaturalezaAnticipo | null;
  /** Retención practicada al girar. */
  retencion?: number;
  /** Alguna retención quedó pendiente de evaluar (pendiente contable). */
  retencionPendiente?: boolean;
}

export interface RespuestaListadoAnticipos {
  /** La migración no está aplicada: la pantalla dice «pendiente de activar». */
  pendiente: boolean;
  filas: FilaAnticipoProveedor[];
  /** Cuenta de detalle configurada; null si falta o no es de detalle (nunca 1330 de respaldo). */
  cuenta: string | null;
  /** Estado de la cuenta (P6): si no es «ok», registrar se bloquea y la pantalla lo muestra como pendiente. */
  estadoCuenta?: EstadoCuentaAnticipo | null;
}

/** Estado vivo a partir de la fila de la base. */
export function estadoAnticipo(status: string, saldo: number): EstadoAnticipo {
  if (status === 'cancelled') return 'anulado';
  return saldo > 0 && status === 'active' ? 'disponible' : 'aplicado';
}

/** Qué acciones admite un anticipo (la base vuelve a validarlas). */
export function accionesAnticipo(
  f: Pick<FilaAnticipoProveedor, 'estado' | 'saldo' | 'valor' | 'aplicado' | 'devuelto'>,
  permisos: { crear: boolean; anular: boolean },
): { aplicar: boolean; devolver: boolean; anular: boolean } {
  const vivo = f.estado === 'disponible' && f.saldo > 0;
  return {
    aplicar: vivo && permisos.crear,
    devolver: vivo && permisos.anular,
    anular: vivo && permisos.anular && f.aplicado === 0 && f.devuelto === 0 && f.saldo === f.valor,
  };
}

/** Búsqueda y estado del listado, en el navegador (la lista es corta: una fila por anticipo). */
export function filtrarAnticipos(
  filas: readonly FilaAnticipoProveedor[],
  criterios: { texto?: string; estado?: EstadoAnticipo | null },
): FilaAnticipoProveedor[] {
  const texto = (criterios.texto ?? '').trim().toLocaleLowerCase('es');
  return filas.filter((f) => {
    if (criterios.estado && f.estado !== criterios.estado) return false;
    if (!texto) return true;
    return [f.proveedor, f.proveedorNit ?? '', f.recibo ?? ''].some((v) => v.toLocaleLowerCase('es').includes(texto));
  });
}

export function totalesAnticipos(filas: readonly FilaAnticipoProveedor[]): { valor: number; aplicado: number; saldo: number; proveedores: number } {
  const vivos = filas.filter((f) => f.estado !== 'anulado');
  return {
    valor: vivos.reduce((s, f) => s + f.valor, 0),
    aplicado: vivos.reduce((s, f) => s + f.aplicado, 0),
    saldo: vivos.reduce((s, f) => s + f.saldo, 0),
    proveedores: new Set(vivos.filter((f) => f.saldo > 0).map((f) => f.proveedorId)).size,
  };
}

/** Anticipos vivos con alguna retención pendiente de evaluar (pendiente contable visible). */
export function anticiposConRetencionPendiente(filas: readonly FilaAnticipoProveedor[]): number {
  return filas.filter((f) => f.estado !== 'anulado' && f.retencionPendiente === true).length;
}

/**
 * Filas del CSV de conciliación: una por anticipo y, después, una por
 * proveedor (saldo de la tabla, saldo en libros y auxiliar por NIT).
 */
export function filasCsvConciliacion(
  c: RespuestaConciliacion,
  encabezados: { anticipos: readonly string[]; proveedores: readonly string[] },
  sino: (v: boolean) => string,
): string[][] {
  const t = (v: number) => String(Math.round(v * 100) / 100);
  return [
    [...encabezados.anticipos],
    ...c.anticipos.map((a) => [
      a.proveedor, a.nit ?? '', a.recibo ?? '', a.cuenta, a.naturaleza ?? '', t(a.valor), t(a.retencion), t(a.girado), t(a.aplicado),
      t(a.retencionDescontada), t(a.devuelto), t(a.anulado), t(a.saldo), t(a.saldoLibros), sino(a.cuadra),
    ]),
    [],
    [...encabezados.proveedores],
    ...c.proveedores.map((p) => [p.proveedor, p.nit ?? '', String(p.anticipos), t(p.saldo), t(p.saldoLibros), t(p.auxiliarNit)]),
  ];
}
