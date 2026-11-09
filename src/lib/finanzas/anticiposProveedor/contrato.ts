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
 * - aplicar  → `fn_anticipo_proveedor_aplicar` (a una cuenta por pagar); si la factura ya
 *              retuvo sobre la base del anticipo, solo `fn_anticipo_proveedor_aplicar_corrigiendo`
 *              con motivo y soporte (ronda 2: nada se compensa en silencio)
 * - vincular → `fn_anticipo_proveedor_vincular_factura` (antes de causar la factura: la
 *              causación no deja retener otra vez sobre la base del anticipo)
 * - devolver → `fn_anticipo_proveedor_devolver` (el dinero que regresa y un procedimiento por causa:
 *              operación anulada o resuelta, o devolución parcial; las retenciones afectadas salen del
 *              procedimiento, nunca se eligen a mano — ronda 3)
 * - exceso   → `fn_anticipo_retencion_exceso_reintegrar` (retención excesiva o indebida: se reintegra
 *              el exceso al proveedor con el cálculo y el certificado corregido)
 * - pendientes → `anticipo_pendientes` + `fn_anticipo_pendiente_resolver` (no se cierran sin
 *              resolución y soporte)
 * - equivalencia → `fn_anticipo_cuenta_equivalencia_aprobar` (cuenta fuera de 133005xx)
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
  // Ronda 2 del Contador.
  'componentes_obligatorios',
  'componentes_no_suman',
  'componente_invalido',
  'regla_ica_invalida',
  'retencion_duplicada',
  'retencion_duplicada_con_anticipo',
  'motivo_obligatorio',
  'retenciones_invalidas',
  'retencion_devolucion_invalida',
  'procedimiento_obligatorio',
  'reteica_requiere_norma',
  'factura_no_encontrada',
  'factura_no_borrador',
  'nota_obligatoria',
  'cuenta_no_valida',
  'pendiente_no_encontrado',
  'pendiente_ya_resuelto',
  'resolucion_obligatoria',
  // Ronda 3 del Contador.
  'procedimiento_invalido',
  'soporte_procedimiento_obligatorio',
  'calculo_obligatorio',
  'calculo_no_cuadra',
  'tratamiento_declaracion_obligatorio',
  'anulacion_requiere_devolucion_total',
  'sin_exceso',
  'rut_obligatorio',
  'resolucion_autorretencion_obligatoria',
  'fundamento_obligatorio',
  // Ronda 4 del Contador.
  'aiu_contrato_obligatorio',
  'aiu_contrato_invalido',
  'aiu_componentes_regimen',
  'aiu_componentes_mezclados',
  'soporte_del_hecho_obligatorio',
  'solicitud_no_prueba_el_hecho',
  'lineas_afectadas_obligatorias',
  'linea_no_encontrada',
  'linea_excede_lo_pendiente',
  'linea_iva_no_cuadra',
  'fecha_del_hecho_invalida',
  'periodo_descuento_no_es_de_libre_eleccion',
  'reteica_sin_procedimiento_municipal',
  'reteica_pruebas_incompletas',
  'retencion_ambigua',
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
    case 'factura_no_encontrada':
    case 'pendiente_no_encontrado':
      return 404;
    case 'anticipo_no_disponible':
    case 'anticipo_usado':
    case 'anulacion_requiere_declaracion':
    case 'periodo_cerrado':
    case 'retencion_duplicada':
    case 'retencion_duplicada_con_anticipo':
    case 'factura_no_borrador':
    case 'pendiente_ya_resuelto':
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
    case 'componentes_obligatorios':
    case 'componentes_no_suman':
    case 'componente_invalido':
    case 'regla_ica_invalida':
    case 'motivo_obligatorio':
    case 'retenciones_invalidas':
    case 'retencion_devolucion_invalida':
    case 'procedimiento_obligatorio':
    case 'reteica_requiere_norma':
    case 'nota_obligatoria':
    case 'cuenta_no_valida':
    case 'resolucion_obligatoria':
    case 'procedimiento_invalido':
    case 'soporte_procedimiento_obligatorio':
    case 'calculo_obligatorio':
    case 'calculo_no_cuadra':
    case 'tratamiento_declaracion_obligatorio':
    case 'anulacion_requiere_devolucion_total':
    case 'sin_exceso':
    case 'rut_obligatorio':
    case 'resolucion_autorretencion_obligatoria':
    case 'fundamento_obligatorio':
    case 'aiu_contrato_obligatorio':
    case 'aiu_contrato_invalido':
    case 'aiu_componentes_regimen':
    case 'aiu_componentes_mezclados':
    case 'soporte_del_hecho_obligatorio':
    case 'solicitud_no_prueba_el_hecho':
    case 'lineas_afectadas_obligatorias':
    case 'linea_no_encontrada':
    case 'linea_excede_lo_pendiente':
    case 'linea_iva_no_cuadra':
    case 'fecha_del_hecho_invalida':
    case 'periodo_descuento_no_es_de_libre_eleccion':
    case 'reteica_pruebas_incompletas':
    case 'retencion_ambigua':
      return 422;
    // Sin el procedimiento municipal validado, la reversión de reteICA queda bloqueada hasta registrarlo.
    case 'reteica_sin_procedimiento_municipal':
      return 409;
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
 * por defecto. «Financiación»: anticipo verdadero; la retención se evalúa cuando
 * se convierte en pago o abono del precio (queda «diferida», no «no aplica»).
 * «Pago anticipado del precio»: la retención se evalúa al girar, con la
 * composición de la operación.
 */
export const NATURALEZAS_ANTICIPO = ['financiacion', 'pago_anticipado_precio'] as const;
export type NaturalezaAnticipo = (typeof NATURALEZAS_ANTICIPO)[number];

/**
 * Tratamiento de cada componente de la operación (ronda 2, ítem 3): la base del
 * reteIVA es el IVA de los componentes gravados (en el AIU, el de la utilidad);
 * los excluidos, exentos y no sujetos no aportan IVA.
 */
export const TRATAMIENTOS_COMPONENTE = [
  'gravado',
  'exento',
  'excluido',
  'no_sujeto',
] as const;
export type TratamientoComponente = (typeof TRATAMIENTOS_COMPONENTE)[number];
/*
 * Ronda 4: el AIU ya no se elige como una línea más. Exige un contrato registrado por régimen (servicios del art. 462-1
 * E.T. o construcción de inmuebles) y validado por el Contador; mientras ese registro no tenga pantalla, el formulario
 * no ofrece líneas AIU y la base rechaza la operación sin contrato (`aiu_contrato_obligatorio`).
 */
/** Los que llevan tarifa de IVA. */
export const TRATAMIENTOS_CON_IVA: readonly TratamientoComponente[] = ['gravado'];
/** Solo una suma homogénea a esta tarifa se puede partir entre 1 + tarifa (ET art. 468). */
export const TARIFA_IVA_GENERAL = 19;

export const componenteSchema = z
  .object({
    descripcion: z.string().trim().max(200).nullable().optional(),
    tratamiento: z.enum(TRATAMIENTOS_COMPONENTE),
    base: IMPORTE,
    tarifa_iva: z.number().finite().min(0).max(99.99).nullable().optional(),
  })
  .strict();
export type ComponenteOperacion = z.infer<typeof componenteSchema>;

/** Lo que la evaluación de retenciones necesita, igual en la vista previa y al registrar. */
const datosRetencion = {
  naturaleza: z.enum(NATURALEZAS_ANTICIPO),
  /** Suma homogénea con IVA incluido: solo la tarifa general (19 %); otra composición va en `componentes`. */
  tarifa_iva: z.number().finite().min(0).max(99.99).nullable().optional(),
  /** Composición de la operación por línea y tarifa (excluidos, exentos, AIU…). */
  componentes: z.array(componenteSchema).min(1).max(50).nullable().optional(),
  /** Concepto de retención en la fuente configurado (organization_taxes). */
  retefuente_id: UUID.nullable().optional(),
  /** Regla municipal de ReteICA (reteica_reglas); sin ella, reteICA queda «pendiente». */
  reteica_id: UUID.nullable().optional(),
  /** La actividad se realiza en el municipio de la regla (territorialidad); sin confirmar, reteICA queda «pendiente». */
  ica_territorial: z.boolean().nullable().optional(),
};

const exigeTarifa = (d: { naturaleza: NaturalezaAnticipo; tarifa_iva?: number | null; componentes?: unknown[] | null }) =>
  d.naturaleza !== 'pago_anticipado_precio' || (d.tarifa_iva !== null && d.tarifa_iva !== undefined) || (d.componentes?.length ?? 0) > 0;

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
    /**
     * Ronda 2, ítem 5: si la factura ya retuvo sobre la base retenida en el anticipo (no se
     * vincularon antes de causarla), solo se aplica con la corrección documentada.
     */
    correccion: z
      .object({ motivo: z.string().trim().min(3).max(500), soporte: z.string().trim().min(3).max(500) })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();
export type SolicitudAplicarAnticipo = z.infer<typeof aplicarAnticipoSchema>;

/** Vista previa de las retenciones (no escribe nada). */
export const evaluarRetencionesSchema = z
  .object({ proveedor_id: z.number().int().positive(), monto: IMPORTE, ...datosRetencion })
  .strict()
  .refine(exigeTarifa, { path: ['tarifa_iva'], message: 'tarifa_iva_obligatoria' });
export type SolicitudEvaluarRetenciones = z.infer<typeof evaluarRetencionesSchema>;

/**
 * Rondas 3 y 4 del Contador: la devolución se registra con un PROCEDIMIENTO por causa y con el SOPORTE DEL HECHO (la
 * solicitud del proveedor sola no prueba la anulación ni la resolución). Las retenciones afectadas salen del
 * procedimiento, nunca se eligen a mano:
 * - `operacion_anulada`: se revierten todas las retenciones vigentes; dinero + retenciones = saldo.
 * - `resolucion_parcial` / `devolucion_parcial`: por las LÍNEAS afectadas de la operación; cada retención se revierte
 *   sobre lo que ella cubrió, con su base y su tarifa (no por prorrata del total).
 * El período en que se descuenta NO se elige: lo fija la regla de cada impuesto (renta e IVA, el del hecho; ICA, el del
 * procedimiento municipal validado, cuyas pruebas se exigen). La retención excesiva va por `excesoRetencionSchema`.
 */
export const CAUSAS_DEVOLUCION = ['operacion_anulada', 'resolucion_parcial', 'devolucion_parcial'] as const;
export type CausaDevolucion = (typeof CAUSAS_DEVOLUCION)[number];
/** Soporte del hecho aceptado (la «solicitud del proveedor» no está: no prueba la anulación ni la resolución). */
export const TIPOS_HECHO_DEVOLUCION = [
  'resolucion_mutuo_acuerdo',
  'resciliacion',
  'sentencia_o_laudo',
  'nota_credito_proveedor',
  'anulacion_aceptada',
  'acta_devolucion',
] as const;
export type TipoHechoDevolucion = (typeof TIPOS_HECHO_DEVOLUCION)[number];
const PERIODO = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TEXTO_SOPORTE = z.string().trim().min(3).max(500);
/** Pruebas del procedimiento municipal de ReteICA: {solicitud, certificado, <cada prueba que exige el municipio>}. */
const SOPORTES_ICA = z.record(z.string().min(1).max(80), TEXTO_SOPORTE);

export const soportesProcedimientoSchema = z
  .object({
    calculo: TEXTO_SOPORTE.nullable().optional(),
    /** Certificado de retención expedido, anulado o corregido. */
    certificado: TEXTO_SOPORTE.nullable().optional(),
    ica: SOPORTES_ICA.nullable().optional(),
  })
  .strict();

export const lineaAfectadaSchema = z
  .object({
    /** Clave de la línea de la operación ('0', '1'… o '<conversión>:0' para un abono convertido). */
    componente: z.string().min(1).max(80),
    base: z.number().finite().positive().max(1e12),
    iva: z.number().finite().min(0).max(1e12),
  })
  .strict();
export type LineaAfectada = z.infer<typeof lineaAfectadaSchema>;

export const procedimientoDevolucionSchema = z
  .object({
    causa: z.enum(CAUSAS_DEVOLUCION),
    hecho: z.object({ tipo: z.enum(TIPOS_HECHO_DEVOLUCION), documento: TEXTO_SOPORTE, fecha: FECHA }).strict(),
    lineas: z.array(lineaAfectadaSchema).max(200).nullable().optional(),
    soportes: soportesProcedimientoSchema,
    requiere_correccion: z.boolean().nullable().optional(),
  })
  .strict()
  .refine((p) => p.causa === 'operacion_anulada' || (p.lineas?.length ?? 0) > 0, { path: ['lineas'], message: 'lineas_afectadas_obligatorias' });
export type ProcedimientoDevolucion = z.infer<typeof procedimientoDevolucionSchema>;

/**
 * P7: una devolución real lleva su soporte (consignación, recibo, transferencia) en `referencia`.
 * `monto` es el dinero que regresa. `procedimiento`: null = no se pudo determinar (queda pendiente contable).
 */
export const devolverAnticipoSchema = z
  .object({
    monto: IMPORTE,
    metodo: z.string().min(1).max(40),
    motivo: z.string().trim().min(3).max(500),
    cuenta_bancaria: z.number().int().positive().nullable().optional(),
    referencia: z.string().trim().min(3).max(200),
    clave_idempotencia: CLAVE,
    procedimiento: procedimientoDevolucionSchema.nullable().optional(),
  })
  .strict();

/**
 * Retención excesiva o indebida (rondas 3 y 4): el exceso sale del cálculo correcto y se reintegra al proveedor. Exige la
 * solicitud escrita del afectado y sus pruebas, el cálculo y el certificado corregido; con reteICA, las pruebas del
 * procedimiento municipal. El período lo fija la regla del impuesto (si llega, debe coincidir).
 */
export const excesoRetencionSchema = z
  .object({
    clase: z.enum(['retefuente', 'reteiva', 'reteica']),
    base_correcta: z.number().finite().min(0).max(1e12),
    tarifa_correcta: z.number().finite().min(0).max(100),
    metodo: z.string().min(1).max(40),
    cuenta_bancaria: z.number().int().positive().nullable().optional(),
    referencia: z.string().trim().max(200).nullable().optional(),
    motivo: z.string().trim().min(3).max(500),
    soportes: z
      .object({ calculo: TEXTO_SOPORTE, certificado: TEXTO_SOPORTE, solicitud: TEXTO_SOPORTE, pruebas: TEXTO_SOPORTE, ica: SOPORTES_ICA.nullable().optional() })
      .strict(),
    periodo_descuento: PERIODO.nullable().optional(),
    requiere_correccion: z.boolean(),
    clave_idempotencia: CLAVE,
  })
  .strict()
  .refine((e) => e.clase !== 'reteica' || Object.keys(e.soportes.ica ?? {}).length > 0, { path: ['soportes', 'ica'], message: 'reteica_pruebas_incompletas' });
export type SolicitudExcesoRetencion = z.infer<typeof excesoRetencionSchema>;

/**
 * Vista previa de las retenciones que se revierten (la base vuelve a calcularlas, línea por línea y con la cobertura
 * de cada retención). Anulación: todo lo vigente. Parcial: renta e ICA sobre la base de las líneas, reteIVA sobre su IVA.
 */
export function retencionesDelProcedimiento(
  vigentes: readonly Pick<RetencionDelAnticipo, 'clase' | 'vigente' | 'tarifa'>[],
  p: { causa: CausaDevolucion; lineas?: readonly Pick<LineaAfectada, 'base' | 'iva'>[] | null },
): { clase: ClaseRetencionAnticipo; valor: number; excede: boolean }[] {
  const base = (p.lineas ?? []).reduce((s, l) => s + (l.base || 0), 0);
  const iva = (p.lineas ?? []).reduce((s, l) => s + (l.iva || 0), 0);
  return vigentes
    .filter((r) => r.vigente > 0)
    .map((r) => {
      const valor = p.causa === 'operacion_anulada' ? r.vigente : Math.round(((r.clase === 'reteiva' ? iva : base) * (r.tarifa ?? 0)) / 100);
      return { clase: r.clase, valor, excede: valor > r.vigente };
    })
    .filter((x) => x.valor > 0);
}

/** IVA de la parte devuelta de una línea: el de la línea, en proporción a su base. */
export function ivaDeLaParte(linea: Pick<ComponenteAnticipo, 'base' | 'iva'>, base: number): number {
  return linea.base > 0 ? Math.round(((linea.iva * base) / linea.base) * 100) / 100 : 0;
}

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

/** Ronda 2, ítem 5: vincular el anticipo a una factura de compra en borrador antes de causarla. */
export const vincularFacturaSchema = z.object({ factura_id: UUID, monto: IMPORTE }).strict();
export type SolicitudVincularFactura = z.infer<typeof vincularFacturaSchema>;

/** Ronda 2, ítem 9: un pendiente contable solo se cierra con resolución y soporte. */
export const resolverPendienteSchema = z
  .object({ resolucion: z.string().trim().min(10).max(2000), soporte: z.string().trim().min(3).max(500) })
  .strict();
export type SolicitudResolverPendiente = z.infer<typeof resolverPendienteSchema>;

/** Ronda 2, ítem 10: cuenta fuera de 133005xx, solo con equivalencia aprobada y nota. */
export const equivalenciaCuentaSchema = z
  .object({ cuenta: z.string().trim().regex(/^1\d{3,11}$/), nota: z.string().trim().min(10).max(1000) })
  .strict();
export type SolicitudEquivalenciaCuenta = z.infer<typeof equivalenciaCuentaSchema>;

export interface ResultadoAplicarAnticipo {
  aplicacion_id: string;
  repetida: boolean;
  monto: number;
  reduccion_cuenta: number;
  retencion_descontada: number;
  vinculada?: boolean;
  saldo_disponible: number;
  saldo_cuenta: number;
}

export interface ResultadoDevolverAnticipo {
  payment_id: string;
  repetida: boolean;
  /** Lo que baja el anticipo: dinero + retenciones identificadas. */
  monto: number;
  /** Lo que entra a caja o banco. */
  dinero: number;
  retencion_revertida: number;
  retenciones_determinadas?: boolean;
  saldo_disponible: number;
}

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
/** `diferida`: anticipo de financiación; se evalúa al convertirse en pago o abono del precio. */
export type EstadoRetencionAnticipo = 'practicar' | 'no_aplica' | 'pendiente' | 'diferida';

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
  /** En porcentaje (exacta: 0,966 % = 9,66 ‰). */
  tarifa: number;
  /** Solo reglas de ReteICA. */
  tarifaPorMil?: number | null;
  norma?: string | null;
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
const ESTADOS_RETENCION: readonly EstadoRetencionAnticipo[] = ['practicar', 'no_aplica', 'pendiente', 'diferida'];
const esNaturaleza = (v: unknown): v is NaturalezaAnticipo => v === 'financiacion' || v === 'pago_anticipado_precio';

/** jsonb de `fn_anticipo_proveedor_evaluar_retenciones` → forma tipada. */
export function aEvaluacionRetenciones(data: unknown): EvaluacionRetenciones {
  const d = (data ?? {}) as Record<string, unknown>;
  const clases = Array.isArray(d.clases) ? (d.clases as Record<string, unknown>[]) : [];
  const opciones = (d.opciones ?? {}) as Record<string, unknown>;
  const aOpciones = (v: unknown): OpcionRetencion[] =>
    (Array.isArray(v) ? (v as Record<string, unknown>[]) : []).map((o) => ({
      id: String(o.id),
      nombre: String(o.nombre ?? ''),
      tarifa: o.tarifa_por_mil !== undefined && o.tarifa_por_mil !== null ? num(o.tarifa_por_mil) / 10 : num(o.tarifa),
      tarifaPorMil: numONulo(o.tarifa_por_mil),
      norma: textoONulo(o.norma),
    }));
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

/**
 * `fn_cuenta_anticipo_proveedor_estado` (ronda 2, ítem 10): ok · sin_configurar · no_existe ·
 * no_es_detalle · fuera_de_133005 (una cuenta de detalle que no es 133005xx y no tiene
 * equivalencia aprobada).
 */
export interface EstadoCuentaAnticipo {
  estado: 'ok' | 'sin_configurar' | 'no_existe' | 'fuera_de_133005' | 'no_es_detalle';
  cuenta: string | null;
  configurada: string | null;
  /** 13300501 si existe en el plan y es de detalle (sugerencia de producto; no se crea). */
  sugerida: string | null;
  /** Nota de la equivalencia aprobada, si la cuenta está fuera de 133005xx. */
  equivalencia?: string | null;
}

const ESTADOS_CUENTA: readonly EstadoCuentaAnticipo['estado'][] = ['ok', 'sin_configurar', 'no_existe', 'fuera_de_133005', 'no_es_detalle'];

export function aEstadoCuentaAnticipo(data: unknown): EstadoCuentaAnticipo {
  const d = (data ?? {}) as Record<string, unknown>;
  const estado = ESTADOS_CUENTA.includes(d.estado as EstadoCuentaAnticipo['estado']) ? (d.estado as EstadoCuentaAnticipo['estado']) : 'sin_configurar';
  return { estado, cuenta: textoONulo(d.cuenta), configurada: textoONulo(d.configurada), sugerida: textoONulo(d.sugerida), equivalencia: textoONulo(d.equivalencia) };
}

// ─── Pendientes contables (ronda 2, ítem 9) ─────────────────────────────────

export const TIPOS_PENDIENTE_ANTICIPO = [
  'retencion_por_evaluar',
  'retencion_duplicada',
  'devolucion_retenciones_por_definir',
  'anulacion_caja_cerrada',
  'correccion_declaracion',
] as const;
export type TipoPendienteAnticipo = (typeof TIPOS_PENDIENTE_ANTICIPO)[number];

export interface PendienteAnticipo {
  id: string;
  anticipoId: string;
  proveedor: string;
  recibo: string | null;
  tipo: TipoPendienteAnticipo;
  estado: 'abierto' | 'resuelto';
  creadoEn: string;
  resueltoEn: string | null;
  resolucion: string | null;
  soporte: string | null;
  /** Periodos de retención a revisar (retención repetida). */
  periodos: string[];
}

export function aPendienteAnticipo(f: Record<string, unknown>): PendienteAnticipo {
  const detalle = (f.detalle ?? {}) as Record<string, unknown>;
  const anticipo = (f.supplier_advances ?? {}) as Record<string, unknown>;
  const proveedor = (anticipo.suppliers ?? {}) as Record<string, unknown>;
  const grupo = (anticipo.payment_groups ?? {}) as Record<string, unknown>;
  const tipo = TIPOS_PENDIENTE_ANTICIPO.includes(f.tipo as TipoPendienteAnticipo) ? (f.tipo as TipoPendienteAnticipo) : 'retencion_por_evaluar';
  return {
    id: String(f.id),
    anticipoId: String(f.advance_id),
    proveedor: String(proveedor.name ?? ''),
    recibo: textoONulo(grupo.receipt_number),
    tipo,
    estado: f.estado === 'resuelto' ? 'resuelto' : 'abierto',
    creadoEn: String(f.creado_en ?? ''),
    resueltoEn: textoONulo(f.resuelto_en),
    resolucion: textoONulo(f.resolucion),
    soporte: textoONulo(f.soporte),
    periodos: Array.isArray(detalle.periodos_a_revisar) ? [...new Set((detalle.periodos_a_revisar as unknown[]).map(String))] : [],
  };
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
  pendientesAbiertos: number;
  /** Cruzado con la obligación de un mandato de consignación (20261108121000). */
  cruzado: number;
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
      pendientesAbiertos: num(a.pendientes_abiertos),
      cruzado: num(a.cruzado),
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
  /** Retenciones practicadas al girar y lo que sigue vigente (para identificar la devuelta). */
  retenciones?: RetencionDelAnticipo[];
  /** Pendientes contables abiertos del anticipo. */
  pendientesAbiertos?: number;
  /** Cruzado con la obligación de un mandato de consignación (no es aplicación ni devolución). */
  cruzado?: number;
  /** Ronda 4: líneas de la operación (para resolver o devolver por líneas). */
  componentes?: ComponenteAnticipo[];
  /**
   * Ronda 4: pruebas que exige el procedimiento de ReteICA VALIDADO del municipio de la retención. `null`: hay reteICA
   * vigente pero el municipio no tiene procedimiento validado (la reversión queda bloqueada).
   */
  pruebasIca?: string[] | null;
}

/** Línea de la operación del anticipo (del giro o de una conversión en abono) y lo que ya se devolvió de ella. */
export interface ComponenteAnticipo {
  clave: string;
  descripcion: string;
  base: number;
  iva: number;
  devueltoBase: number;
}

export interface RetencionDelAnticipo {
  clase: ClaseRetencionAnticipo;
  concepto: string;
  /** Base y tarifa (en %) con que se practicó: de ahí salen las retenciones de un procedimiento de devolución. */
  base?: number;
  tarifa?: number;
  valor: number;
  /** Valor − lo ya revertido en devoluciones o anulación. */
  vigente: number;
}

export interface RespuestaListadoAnticipos {
  /** La migración no está aplicada: la pantalla dice «pendiente de activar». */
  pendiente: boolean;
  filas: FilaAnticipoProveedor[];
  /** Cuenta de detalle configurada; null si falta o no es de detalle (nunca 1330 de respaldo). */
  cuenta: string | null;
  /** Estado de la cuenta (P6): si no es «ok», registrar se bloquea y la pantalla lo muestra como pendiente. */
  estadoCuenta?: EstadoCuentaAnticipo | null;
  /** Pendientes contables (abiertos primero). */
  pendientes?: PendienteAnticipo[];
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
      t(a.retencionDescontada), t(a.devuelto), t(a.anulado), t(a.saldo), t(a.saldoLibros), sino(a.cuadra), String(a.pendientesAbiertos), t(a.cruzado),
    ]),
    [],
    [...encabezados.proveedores],
    ...c.proveedores.map((p) => [p.proveedor, p.nit ?? '', String(p.anticipos), t(p.saldo), t(p.saldoLibros), t(p.auxiliarNit)]),
  ];
}

/**
 * Ronda 2, ítem 11: texto de la devolución sin decir que «ingresó» lo que en realidad son
 * retenciones revertidas («$55.592 al banco y $3.908 de retenciones»).
 */
export function partesDevolucion(r: Pick<ResultadoDevolverAnticipo, 'dinero' | 'retencion_revertida'>): { dinero: number; retenciones: number } {
  return { dinero: num(r.dinero), retenciones: num(r.retencion_revertida) };
}

/** Suma de los componentes (base + IVA de los que lo llevan), para cuadrarlos contra el monto. */
export function totalComponentes(componentes: readonly Pick<ComponenteOperacion, 'tratamiento' | 'base' | 'tarifa_iva'>[]): number {
  return componentes.reduce((s, c) => {
    const iva = TRATAMIENTOS_CON_IVA.includes(c.tratamiento) ? Math.round(c.base * (c.tarifa_iva ?? 0)) / 100 : 0;
    return s + c.base + iva;
  }, 0);
}
