/**
 * Consignación en dos sentidos y entre organizaciones — contrato y lógica sin
 * React ni Supabase (Figma «07 Finanzas» sección `2403:146159`, capturas
 * `docs/design/figma/89-consignacion-recibida-*.png`).
 *
 * Criterio del Contador (docs/design/CONSIGNACION-RECIBIDA-Y-ENTRE-ORGANIZACIONES.md,
 * «Ronda 2 del Contador»):
 * - El contrato separa la modalidad jurídica (intermediación/mandato, estimatorio,
 *   compra), la condición contable (agente o principal) y el tratamiento
 *   tributario (lo deriva el sistema). Nada tiene valor por defecto.
 * - La compra real no es consignación: va por la factura de compra de siempre,
 *   con una adquisición demostrada. El estimatorio no opera hasta parametrizar
 *   los arts. 438 y 455 (pendiente visible).
 * - IVA y retenciones no se eligen: se determinan por ley con los hechos.
 * «Ronda 3 del Contador»: la comisión se reconoce cuando se DEVENGA (al vender, o
 * al cumplirse una obligación posterior real que el contrato documenta, con
 * evidencia), nunca por la fecha de liquidación; las retenciones de la OPERACIÓN
 * y las de la REMUNERACIÓN se resuelven por separado con las reglas configuradas.
 *
 * La escritura es de las RPC de `20261108121000_consignaciones.sql` y
 * `20261108120500_organization_links.sql` (PROPUESTAS sin aplicar).
 */
import { z } from 'zod';

/** Consignaciones vive en Inventario (decisión del dueño); la liquidación enlaza a Finanzas. */
export const RUTA_CONSIGNACIONES_INVENTARIO = '/app/inventario/consignaciones';
export const rutaRecibida = (id: string) => `${RUTA_CONSIGNACIONES_INVENTARIO}/recibidas/${encodeURIComponent(id)}`;
export const rutaLiquidarRecibida = (id: string) => `${rutaRecibida(id)}/liquidar`;
export const rutaPorAceptar = (docId: string) => `${RUTA_CONSIGNACIONES_INVENTARIO}/por-aceptar/${encodeURIComponent(docId)}`;
/** Enlace de invitación (el token solo viaja aquí; la base guarda su hash). */
export const RUTA_VINCULAR = '/app/vincular';

export const PESTANAS_CONSIGNACION = ['entregadas', 'recibidas', 'por-aceptar'] as const;
export type PestanaConsignacion = (typeof PESTANAS_CONSIGNACION)[number];

// ─── Condiciones del contrato ────────────────────────────────────────────────

export const CONTRATOS = ['intermediacion', 'estimatorio', 'compra'] as const;
export type Contrato = (typeof CONTRATOS)[number];
export type ParteContrato = 'dueno' | 'consignatario';
export type CondicionContable = 'agente' | 'principal';
/** Valoración de la custodia en cuentas de orden; nunca se vuelve activo propio. */
export type Valoracion = 'costo_acreditado' | 'valor_convenido';
/** Cuándo se DEVENGA la remuneración (ingreso en el auxiliar de 413512). Nunca por la fecha de liquidación. */
export type Reconocimiento = 'al_vender' | 'obligacion_posterior';
export type DireccionConsignacion = 'entregada' | 'recibida';

export interface CondicionesContrato {
  /** Modalidad jurídica. null hasta que la persona elige: no hay valor por defecto. */
  contrato: Contrato | null;
  /** Condición contable. Intermediación ⇒ agente. */
  condicion: CondicionContable | null;
  /** Solo recibida: política de valoración de la custodia. */
  valoracion: Valoracion | null;
  precioModo: 'fijo' | 'minimo' | null;
  remuneracionModo: 'porcentaje' | 'precio_liquidacion' | null;
  baseComision: 'precio_pactado' | 'precio_venta' | null;
  reconocimiento: Reconocimiento | null;
  /** Si el devengo depende de una obligación posterior real: cuál (se documenta en el contrato). */
  obligacionPosterior: string | null;
  /** La remuneración es un servicio independiente con obligación de facturar (la liquidación no la sustituye). */
  facturaRemuneracion: boolean | null;
  /** Intermediación: cuándo nace la obligación con el dueño en ventas a crédito. */
  obligacionDueno: 'venta' | 'cobro' | null;
  /**
   * Ronda 4 del Contador, solo recibida en intermediación: si el contrato PACTA descontar la remuneración de lo que se
   * debe al dueño. Sin pacto (o sin saldo exigible) la remuneración queda como cuenta por cobrar al dueño.
   */
  compensacionRemuneracion: boolean | null;
  /**
   * Ronda 5 del Contador (C.Co. art. 1277), solo recibida en intermediación: el orden en que se aplica lo recaudado
   * (términos obligatorios del contrato). Si se pacta la compensación, la remuneración tiene que estar en el orden.
   */
  ordenAplicacion: ConceptoAplicacion[] | null;
  /** Ronda 5: la liquidación al dueño es por escrito: por qué medio y en cuántos días (1 a 90). */
  liquidacionEscrita: { medio: MedioLiquidacion | null; plazoDias: number | null };
  riesgos: { devoluciones: ParteContrato | null; perdidas: ParteContrato | null; gastos: ParteContrato | null };
}

/** Conceptos que el contrato ordena al aplicar lo recaudado para el dueño (los mismos de la base). */
export const CONCEPTOS_APLICACION = ['remuneracion', 'gastos_reembolsables', 'anticipos', 'derechos_frente_al_dueno'] as const;
export type ConceptoAplicacion = (typeof CONCEPTOS_APLICACION)[number];
/** Medios escritos de la liquidación al dueño. */
export const MEDIOS_LIQUIDACION = ['documento_compartido', 'correo_electronico', 'documento_fisico'] as const;
export type MedioLiquidacion = (typeof MEDIOS_LIQUIDACION)[number];

/** Órdenes de aplicación que ofrece el formulario (la base acepta cualquier orden válido y sin repetidos). */
export const ORDENES_APLICACION: Record<'remuneracion_primero' | 'gastos_primero' | 'anticipos_primero', ConceptoAplicacion[]> = {
  remuneracion_primero: ['remuneracion', 'gastos_reembolsables', 'anticipos', 'derechos_frente_al_dueno'],
  gastos_primero: ['gastos_reembolsables', 'remuneracion', 'anticipos', 'derechos_frente_al_dueno'],
  anticipos_primero: ['anticipos', 'remuneracion', 'gastos_reembolsables', 'derechos_frente_al_dueno'],
};
export type OrdenAplicacionPreset = keyof typeof ORDENES_APLICACION;

export function presetDeOrden(orden: readonly ConceptoAplicacion[] | null): OrdenAplicacionPreset | null {
  if (!orden) return null;
  const clave = (Object.keys(ORDENES_APLICACION) as OrdenAplicacionPreset[]).find((k) => ORDENES_APLICACION[k].join() === orden.join());
  return clave ?? null;
}

/** El mismo control que fn_consignacion_terminos: conceptos válidos, sin repetir y, con compensación, la remuneración. */
export function ordenAplicacionValido(orden: readonly string[] | null | undefined, compensacion: boolean | null): boolean {
  if (!orden || orden.length === 0) return false;
  if (new Set(orden).size !== orden.length) return false;
  if (!orden.every((c) => (CONCEPTOS_APLICACION as readonly string[]).includes(c))) return false;
  return compensacion !== true || orden.includes('remuneracion');
}

export const CONDICIONES_VACIAS: CondicionesContrato = {
  contrato: null,
  condicion: null,
  valoracion: null,
  precioModo: null,
  remuneracionModo: null,
  baseComision: null,
  reconocimiento: null,
  obligacionPosterior: null,
  facturaRemuneracion: null,
  obligacionDueno: null,
  compensacionRemuneracion: null,
  ordenAplicacion: null,
  liquidacionEscrita: { medio: null, plazoDias: null },
  riesgos: { devoluciones: null, perdidas: null, gastos: null },
};

export type ErrorCondicion =
  | 'contrato'
  | 'compra_real'
  | 'estimatorio_bloqueado'
  | 'condicion'
  | 'valoracion'
  | 'precio'
  | 'remuneracion'
  | 'base'
  | 'reconocimiento'
  | 'obligacion_posterior'
  | 'factura_remuneracion'
  | 'obligacion'
  | 'compensacion_remuneracion'
  | 'orden_aplicacion'
  | 'liquidacion_escrita'
  | 'riesgos';

/** Tratamiento tributario: lo deriva el sistema de la modalidad, no se elige. */
export const tratamientoTributario = (contrato: Exclude<Contrato, 'compra'>): 'mandato' | 'estimatorio_438_455' =>
  contrato === 'intermediacion' ? 'mandato' : 'estimatorio_438_455';

/**
 * Lo que falta para poder operar. Vacío = se puede enviar. El estimatorio se
 * puede elegir pero no operar: queda bloqueado hasta parametrizar los arts. 438 y 455.
 */
export function validarCondiciones(c: CondicionesContrato, direccion: DireccionConsignacion = 'recibida'): ErrorCondicion[] {
  if (!c.contrato) return ['contrato'];
  if (c.contrato === 'compra') return ['compra_real'];
  if (c.contrato === 'estimatorio') return ['estimatorio_bloqueado'];
  const errores: ErrorCondicion[] = [];
  if (c.condicion !== 'agente') errores.push('condicion');
  if (direccion === 'recibida' && !c.valoracion) errores.push('valoracion');
  if (!c.precioModo) errores.push('precio');
  if (!c.remuneracionModo) errores.push('remuneracion');
  if (c.remuneracionModo === 'porcentaje' && !c.baseComision) errores.push('base');
  if (!c.reconocimiento) errores.push('reconocimiento');
  if (c.reconocimiento === 'obligacion_posterior' && (c.obligacionPosterior ?? '').trim().length < 10) errores.push('obligacion_posterior');
  if (c.facturaRemuneracion === null) errores.push('factura_remuneracion');
  if (!c.obligacionDueno) errores.push('obligacion');
  if (direccion === 'recibida' && c.compensacionRemuneracion === null) errores.push('compensacion_remuneracion');
  if (direccion === 'recibida' && !ordenAplicacionValido(c.ordenAplicacion, c.compensacionRemuneracion)) errores.push('orden_aplicacion');
  if (direccion === 'recibida' && !liquidacionEscritaValida(c.liquidacionEscrita)) errores.push('liquidacion_escrita');
  if (!c.riesgos.devoluciones || !c.riesgos.perdidas || !c.riesgos.gastos) errores.push('riesgos');
  return errores;
}

/** Ronda 5: medio escrito elegido y plazo entero de 1 a 90 días. */
export function liquidacionEscritaValida(l: CondicionesContrato['liquidacionEscrita'] | null | undefined): boolean {
  if (!l || !l.medio || !(MEDIOS_LIQUIDACION as readonly string[]).includes(l.medio)) return false;
  return Number.isInteger(l.plazoDias) && (l.plazoDias as number) >= 1 && (l.plazoDias as number) <= 90;
}

/** Ronda 5: los términos del contrato que la nota recibida guarda (orden de aplicación y liquidación por escrito). */
export function terminosLiquidacion(c: CondicionesContrato): { orden_aplicacion: ConceptoAplicacion[]; liquidacion_escrita: { medio: MedioLiquidacion; plazo_dias: number } } | null {
  if (!c.ordenAplicacion || !c.liquidacionEscrita.medio || c.liquidacionEscrita.plazoDias === null) return null;
  return { orden_aplicacion: [...c.ordenAplicacion], liquidacion_escrita: { medio: c.liquidacionEscrita.medio, plazo_dias: c.liquidacionEscrita.plazoDias } };
}

/** Cuerpo `terminos` que esperan las RPC (claves en español, como la base). */
export function terminosDeCondiciones(
  c: CondicionesContrato,
  extra: { cuentaRecaudo?: string | null; direccion?: DireccionConsignacion } = {},
): Record<string, unknown> {
  const direccion = extra.direccion ?? 'recibida';
  return {
    contrato: c.contrato,
    condicion: c.condicion,
    ...(direccion === 'recibida' ? { valoracion: c.valoracion } : {}),
    precio_modo: c.precioModo,
    remuneracion_modo: c.remuneracionModo,
    base_comision: c.remuneracionModo === 'porcentaje' ? c.baseComision : null,
    reconocimiento: c.reconocimiento,
    ...(c.reconocimiento === 'obligacion_posterior' ? { obligacion_posterior: (c.obligacionPosterior ?? '').trim() } : {}),
    factura_remuneracion: c.facturaRemuneracion,
    obligacion_dueno: c.contrato === 'intermediacion' ? c.obligacionDueno : null,
    ...(direccion === 'recibida' && c.contrato === 'intermediacion' ? { compensacion_remuneracion: c.compensacionRemuneracion } : {}),
    ...(direccion === 'recibida' && c.contrato === 'intermediacion' ? (terminosLiquidacion(c) ?? {}) : {}),
    riesgos: c.riesgos,
    ...(extra.cuentaRecaudo ? { cuenta_recaudo: extra.cuentaRecaudo.trim() } : {}),
  };
}

const PARTE = z.enum(['dueno', 'consignatario']);
const ORDEN_APLICACION = z
  .array(z.enum(CONCEPTOS_APLICACION))
  .min(1)
  .max(CONCEPTOS_APLICACION.length)
  .refine((o) => new Set(o).size === o.length, { message: 'sin_repetidos' });
/**
 * Ronda 6 (respuesta 13): el plazo se cuenta desde el corte del período liquidado salvo que el contrato diga otra cosa;
 * la otra regla admitida (desde la fecha de la liquidación) exige citar la cláusula. Sin `plazo_desde`, el corte.
 */
export const PLAZO_DESDE_LIQUIDACION = ['corte_del_periodo', 'fecha_de_liquidacion'] as const;
export type PlazoDesdeLiquidacion = (typeof PLAZO_DESDE_LIQUIDACION)[number];
const LIQUIDACION_ESCRITA = z
  .object({
    medio: z.enum(MEDIOS_LIQUIDACION),
    plazo_dias: z.number().int().min(1).max(90),
    plazo_desde: z.enum(PLAZO_DESDE_LIQUIDACION).optional(),
    clausula: z.string().trim().min(10).max(500).optional(),
  })
  .strict()
  .refine((l) => l.plazo_desde !== 'fecha_de_liquidacion' || !!l.clausula, { message: 'clausula_obligatoria', path: ['clausula'] });

/** Validación del servidor: modalidad, condición, reconocimiento y factura de la remuneración son obligatorios (sin `.default`). */
export const terminosSchema = z
  .object({
    contrato: z.enum(CONTRATOS),
    condicion: z.enum(['agente', 'principal']),
    valoracion: z.enum(['costo_acreditado', 'valor_convenido']).optional(),
    precio_modo: z.enum(['fijo', 'minimo']),
    remuneracion_modo: z.enum(['porcentaje', 'precio_liquidacion']),
    base_comision: z.enum(['precio_pactado', 'precio_venta']).nullable().optional(),
    reconocimiento: z.enum(['al_vender', 'obligacion_posterior']),
    obligacion_posterior: z.string().trim().min(10).max(1000).optional(),
    factura_remuneracion: z.boolean(),
    obligacion_dueno: z.enum(['venta', 'cobro']).nullable().optional(),
    /** Ronda 4: obligatoria en la recibida de intermediación (la base la exige; la ruta no conoce la dirección). */
    compensacion_remuneracion: z.boolean().optional(),
    /** Ronda 5 (C.Co. art. 1277): obligatorios en la recibida de intermediación; la base los exige y los valida. */
    orden_aplicacion: ORDEN_APLICACION.optional(),
    liquidacion_escrita: LIQUIDACION_ESCRITA.optional(),
    riesgos: z.object({ devoluciones: PARTE, perdidas: PARTE, gastos: PARTE }).strict(),
    cuenta_recaudo: z.string().regex(/^281510\d{2}$/).optional(),
  })
  .strict()
  .superRefine((t, ctx) => {
    if (t.orden_aplicacion && t.compensacion_remuneracion === true && !t.orden_aplicacion.includes('remuneracion'))
      ctx.addIssue({ code: 'custom', path: ['orden_aplicacion'], message: 'remuneracion_en_el_orden' });
    if (t.remuneracion_modo === 'porcentaje' && !t.base_comision) ctx.addIssue({ code: 'custom', path: ['base_comision'], message: 'obligatoria' });
    if (t.contrato === 'intermediacion' && !t.obligacion_dueno) ctx.addIssue({ code: 'custom', path: ['obligacion_dueno'], message: 'obligatoria' });
    if (t.contrato === 'intermediacion' && t.condicion !== 'agente') ctx.addIssue({ code: 'custom', path: ['condicion'], message: 'mandato_es_agente' });
    if (t.reconocimiento === 'obligacion_posterior' && !t.obligacion_posterior)
      ctx.addIssue({ code: 'custom', path: ['obligacion_posterior'], message: 'obligatoria' });
  });
export type Terminos = z.infer<typeof terminosSchema>;

// ─── Cuerpos de las rutas ────────────────────────────────────────────────────

const CLAVE = z.string().min(8).max(160);
const CANTIDAD = z.number().finite().positive().max(1e9);
const PRECIO = z.number().finite().positive().max(1e12);

export const recibirSchema = z
  .object({
    proveedor_id: z.number().int().positive(),
    sucursal_id: z.number().int().positive(),
    comision: z.number().finite().min(0).max(100),
    terminos: terminosSchema,
    notas: z.string().max(2000).nullable().optional(),
    lineas: z
      .array(
        z
          .object({
            product_id: z.number().int().positive(),
            qty: CANTIDAD,
            precio: PRECIO,
            precio_liquidacion: PRECIO.nullable().optional(),
            costo_acreditado: PRECIO.nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
    clave_idempotencia: CLAVE,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.terminos.valoracion === undefined) ctx.addIssue({ code: 'custom', path: ['terminos', 'valoracion'], message: 'obligatoria' });
    if (v.terminos.valoracion === 'costo_acreditado')
      v.lineas.forEach((l, i) => {
        if (!l.costo_acreditado) ctx.addIssue({ code: 'custom', path: ['lineas', i, 'costo_acreditado'], message: 'obligatorio' });
      });
  });
export type SolicitudRecibir = z.infer<typeof recibirSchema>;

export const devolverSchema = z
  .object({
    lineas: z.array(z.object({ linea_id: z.string().uuid(), qty: CANTIDAD }).strict()).min(1).max(200),
    notas: z.string().max(2000).nullable().optional(),
    clave_idempotencia: CLAVE,
  })
  .strict();

/** Solo la clave de idempotencia (aceptar la liquidación que le llegó al consignante). */
export const claveSchema = z.object({ clave_idempotencia: CLAVE }).strict();

/** Los derechos frente al dueño (devoluciones de lo ya liquidado) solo se descuentan con acuerdo escrito. */
export const liquidarRecibidaSchema = z
  .object({
    hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    descontar_derechos: z.boolean().optional(),
    acuerdo: z.string().trim().max(1000).nullable().optional(),
    clave_idempotencia: CLAVE,
  })
  .strict()
  .refine((v) => !v.descontar_derechos || (v.acuerdo ?? '').trim().length >= 5, { message: 'acuerdo_obligatorio', path: ['acuerdo'] });

/** Faltante o daño: evidencia, responsable y obligación. Nada de gasto ni cuenta por pagar automáticos. */
export const novedadSchema = z
  .object({
    linea_id: z.string().uuid(),
    tipo: z.enum(['faltante', 'dano']),
    cantidad: CANTIDAD,
    responsable: z.enum(['dueno', 'consignatario', 'tercero', 'por_determinar']),
    evidencia: z.string().trim().min(5).max(2000),
    obligacion: z.string().trim().max(2000).nullable().optional(),
    clave_idempotencia: CLAVE,
  })
  .strict();

/** Reconocer la remuneración al cumplirse la obligación posterior del contrato: evidencia obligatoria. */
export const reconocerRemuneracionSchema = z.object({ evidencia: z.string().trim().min(10).max(2000), clave_idempotencia: CLAVE }).strict();

/** Conciliar una retención con su soporte (certificado): el valor que consta, nunca presumido. */
export const conciliarRetencionSchema = z.object({ valor: z.number().finite().min(0).max(1e12), soporte: z.string().trim().min(5).max(1000) }).strict();

/**
 * Ronda 4, punto 4: la retención PRACTICADA se reconoce cuando ocurre (el pagador ya la descontó), con su valor, base,
 * fecha y soporte; no espera el certificado. En la de la operación, `factura_id` es la factura del cliente que la
 * practicó (de esa liquidación) cuando hay más de una. Ronda 5 (respuesta 10): en la de la operación, `cobro_id` es el
 * pago o abono de ESA factura en que el comprador la practicó (misma fecha); el abono a la factura queda en ese momento.
 */
export const retencionPracticadaSchema = z
  .object({
    valor: z.number().finite().positive().max(1e12),
    base: z.number().finite().positive().max(1e12),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    soporte: z.string().trim().min(5).max(1000),
    factura_id: z.string().uuid().nullable().optional(),
    cobro_id: z.string().uuid().nullable().optional(),
  })
  .strict();
export type SolicitudRetencionPracticada = z.infer<typeof retencionPracticadaSchema>;

const REGLA = z.string().uuid().nullable().optional();
const REGLAS_AMBITO = z.object({ retefuente: REGLA, reteiva: REGLA, reteica: REGLA }).strict();
/** Regla de retención configurada (organization_taxes) que aplica a cada ámbito y clase. */
export const retencionesConsignacionSchema = z.object({ operacion: REGLAS_AMBITO, remuneracion: REGLAS_AMBITO }).strict();
export type ReglasRetencionConsignacion = z.infer<typeof retencionesConsignacionSchema>;

/** Anticipo al consignante (el de anticipos a proveedores) cruzado con la obligación real del mandato. */
export const cruceAnticipoSchema = z.object({ anticipo_id: z.string().uuid(), monto: PRECIO, clave_idempotencia: CLAVE }).strict();

/** Cuentas de consignación definidas por la organización (la contrapartida del grupo 94 es obligatoria). */
export const cuentasConsignacionSchema = z
  .object({
    orden: z.string().regex(/^911520(\d{2})?$/).nullable().optional(),
    contra: z.string().regex(/^94\d{2,6}$/),
    remuneracion: z.string().regex(/^413512\d{2}$/).nullable().optional(),
  })
  .strict();

export const anularLiquidacionSchema = z.object({ motivo: z.string().trim().min(5).max(500) }).strict();

/** Ronda 6 (respuesta 13): constancia de la entrega de la liquidación por escrito (fecha, medio pactado y soporte). */
export const entregaEscritaSchema = z
  .object({
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    medio: z.enum(MEDIOS_LIQUIDACION),
    soporte: z.string().trim().min(5).max(1000),
  })
  .strict();

export const aceptarNotaSchema = z
  .object({
    sucursal_id: z.number().int().positive(),
    mapeo: z
      .array(z.object({ producto_ref: z.string().min(1).max(120), product_id: z.number().int().positive(), precio: PRECIO.nullable().optional() }).strict())
      .max(200),
    cuenta_recaudo: z.string().regex(/^281510\d{2}$/).nullable().optional(),
    /** La valoración de la custodia es política de quien recibe. */
    valoracion: z.enum(['costo_acreditado', 'valor_convenido']),
    /**
     * Ronda 5: en mandato, quien recibe declara los términos del contrato que la copia del dueño no trae
     * (compensación, orden de aplicación y liquidación por escrito). Si la copia los trae, deben coincidir.
     */
    terminos_contrato: z
      .object({ compensacion_remuneracion: z.boolean(), orden_aplicacion: ORDEN_APLICACION, liquidacion_escrita: LIQUIDACION_ESCRITA })
      .strict()
      .refine((t) => !t.compensacion_remuneracion || t.orden_aplicacion.includes('remuneracion'), { message: 'remuneracion_en_el_orden', path: ['orden_aplicacion'] })
      .optional(),
    clave_idempotencia: CLAVE,
  })
  .strict();

export const responderDocumentoSchema = z
  .object({ accion: z.enum(['rechazar', 'anular']), motivo: z.string().trim().min(5).max(500) })
  .strict();

export const invitarSchema = z
  .object({
    proveedor_id: z.number().int().positive().nullable().optional(),
    cliente_id: z.string().uuid().nullable().optional(),
    correo: z.string().trim().toLowerCase().email().max(254),
    propositos: z.array(z.enum(['consignacion', 'orden_compra', 'factura'])).min(1).max(3).default(['consignacion']),
  })
  .strict()
  .refine((v) => Boolean(v.proveedor_id) !== Boolean(v.cliente_id), { message: 'tercero_obligatorio', path: ['proveedor_id'] });

export const TOKEN_RE = /^[0-9a-f]{64}$/;
export const aceptarVinculoSchema = z
  .object({
    token: z.string().regex(TOKEN_RE),
    organizacion_id: z.number().int().positive(),
    proveedor_id: z.number().int().positive().nullable().optional(),
    cliente_id: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine((v) => Boolean(v.proveedor_id) !== Boolean(v.cliente_id), { message: 'tercero_obligatorio', path: ['proveedor_id'] });

export const rechazarVinculoSchema = z.object({ token: z.string().regex(TOKEN_RE), motivo: z.string().trim().max(500).nullable().optional() }).strict();

// ─── Errores ────────────────────────────────────────────────────────────────

export const ERRORES_RECIBIDA = [
  'no_autenticado',
  'sin_permiso',
  'sin_acceso_sucursal',
  'organizacion_no_permitida',
  'datos_invalidos',
  'pendiente_de_activar',
  'clasificacion_obligatoria',
  'compra_real_usa_factura',
  'condicion_contable_obligatoria',
  'valoracion_obligatoria',
  'estimatorio_bloqueado_438_455',
  'liquidacion_mandante_pendiente',
  'terminos_invalidos',
  'obligacion_posterior_obligatoria',
  'reconocimiento_no_aplica',
  'sin_remuneracion_por_devengar',
  'soporte_obligatorio',
  'retencion_no_encontrada',
  'regla_retencion_invalida',
  'clave_idempotencia_invalida',
  'clave_idempotencia_reutilizada',
  'comision_invalida',
  'sin_lineas',
  'linea_invalida',
  'proveedor_no_encontrado',
  'sucursal_invalida',
  'producto_invalido',
  'producto_sin_seguimiento',
  'producto_con_seriales',
  'producto_con_variantes',
  'producto_propio_no_consignable',
  'producto_de_otro_consignante',
  'producto_otra_clasificacion',
  'producto_ajeno',
  'precio_liquidacion_obligatorio',
  'costo_acreditado_obligatorio',
  'stock_insuficiente',
  'excede_en_su_poder',
  'sin_cuenta_orden_consignacion',
  'sin_cuenta_contra_orden',
  'sin_cuenta_recaudo_propietario',
  'cuenta_recaudo_invalida',
  'sin_cuenta_remuneracion',
  'cuenta_orden_invalida',
  'cuenta_contra_invalida',
  'cuenta_remuneracion_invalida',
  'nota_no_encontrada',
  'liquidacion_no_encontrada',
  'liquidacion_pendiente',
  'liquidacion_no_es_la_ultima',
  'liquidacion_anulada',
  'liquidacion_aceptada_por_el_dueno',
  'sin_ventas_por_liquidar',
  'saldo_a_favor_del_consignatario',
  'venta_bajo_precio_pactado',
  'acuerdo_obligatorio',
  'evidencia_obligatoria',
  'anticipo_no_encontrado',
  'anticipo_sin_saldo',
  'excede_obligacion_con_el_dueno',
  'motivo_obligatorio',
  'documento_no_encontrado',
  'documento_no_disponible',
  'producto_sin_vincular',
  'vinculo_sin_proveedor',
  'vinculo_no_encontrado',
  'vinculo_inactivo',
  'vinculo_existente',
  'invitacion_invalida',
  'invitacion_vencida',
  'misma_organizacion',
  'tercero_obligatorio',
  'tercero_no_encontrado',
  'correo_invalido',
  'demasiadas_invitaciones',
  'transicion_invalida',
  'factura_no_encontrada',
  'factura_distinta',
  'documento_anulado',
  'asiento_no_creado',
  // Ronda 4 del Contador.
  'sin_cuenta_cobro_remuneracion',
  'retencion_no_reconocida',
  'retencion_ya_practicada',
  'fecha_anterior_a_la_venta',
  'fecha_futura',
  'periodo_cerrado',
  'factura_de_la_liquidacion_obligatoria',
  'sin_cuenta_cartera_cliente',
  'sin_cuenta_retencion_sufrida',
  'compensacion_no_pactada',
  'excede_remuneracion_por_cobrar',
  // Ronda 5 del Contador.
  'orden_aplicacion_obligatorio',
  'liquidacion_escrita_obligatoria',
  'terminos_distintos_del_documento',
  'cobro_obligatorio',
  'cobro_de_otra_factura',
  'fecha_distinta_del_cobro',
  'retencion_excede_saldo_factura',
  // Ronda 6 del Contador.
  'derechos_fuera_del_orden_de_aplicacion',
  'anticipos_fuera_del_orden_de_aplicacion',
  'liquidacion_sin_entrega_escrita',
  'entrega_ya_registrada',
  'medio_distinto_del_pactado',
  'fecha_anterior_a_la_liquidacion',
  'error_desconocido',
] as const;
export type ErrorRecibida = (typeof ERRORES_RECIBIDA)[number];

/** Bloqueos por configuración: la app deja además el pendiente contable visible. */
export const ERRORES_DE_CONFIGURACION: readonly ErrorRecibida[] = [
  'sin_cuenta_orden_consignacion',
  'sin_cuenta_contra_orden',
  'sin_cuenta_recaudo_propietario',
  'sin_cuenta_remuneracion',
  'sin_cuenta_cobro_remuneracion',
  'estimatorio_bloqueado_438_455',
];

export function codigoErrorRecibida(mensaje: string | null | undefined): ErrorRecibida {
  const texto = (mensaje ?? '').trim();
  if (texto.startsWith('Acceso denegado a la organización')) return 'sin_permiso';
  const primero = texto.split(/[\s:]/)[0];
  if (primero === 'STOCK_INSUFICIENTE') return 'stock_insuficiente';
  if (primero === 'SIN_PERMISO') return 'sin_permiso';
  return (ERRORES_RECIBIDA as readonly string[]).includes(primero) ? (primero as ErrorRecibida) : 'error_desconocido';
}

export function estadoHttpErrorRecibida(codigo: ErrorRecibida): number {
  switch (codigo) {
    case 'no_autenticado':
      return 401;
    case 'sin_permiso':
    case 'sin_acceso_sucursal':
    case 'organizacion_no_permitida':
      return 403;
    case 'nota_no_encontrada':
    case 'liquidacion_no_encontrada':
    case 'proveedor_no_encontrado':
    case 'documento_no_encontrado':
    case 'vinculo_no_encontrado':
    case 'tercero_no_encontrado':
    case 'factura_no_encontrada':
    case 'anticipo_no_encontrado':
    case 'retencion_no_encontrada':
      return 404;
    case 'pendiente_de_activar':
      return 501;
    case 'liquidacion_pendiente':
    case 'stock_insuficiente':
    case 'documento_no_disponible':
    case 'vinculo_existente':
    case 'liquidacion_no_es_la_ultima':
    case 'liquidacion_aceptada_por_el_dueno':
    case 'entrega_ya_registrada':
      return 409;
    case 'datos_invalidos':
      return 400;
    case 'error_desconocido':
    case 'asiento_no_creado':
      return 500;
    default:
      return 422;
  }
}

/** Tabla o función de las migraciones todavía sin aplicar. */
export function esPendienteRecibida(error: unknown): boolean {
  const e = (error ?? {}) as { code?: unknown; message?: unknown };
  if (e.code === 'PGRST202' || e.code === 'PGRST205' || e.code === '42P01' || e.code === '42883') return true;
  return (
    typeof e.message === 'string' &&
    /(consignment_|fn_consignacion|organization_link|organization_shared|fn_vinculo|fn_documento_compartido)/i.test(e.message) &&
    /(does not exist|could not find)/i.test(e.message)
  );
}

// ─── Lectura ────────────────────────────────────────────────────────────────

export type EstadoRecibida = 'en_consignacion' | 'por_liquidar' | 'liquidada';

export interface LineaRecibida {
  id: string;
  productoId: number;
  producto: string;
  productoConsignante: string | null;
  recibido: number;
  vendido: number;
  devuelto: number;
  /** Faltantes y daños registrados con evidencia. */
  novedades: number;
  precioPactado: number;
  precioLiquidacion: number | null;
  costoAcreditado: number | null;
  /** Valor unitario de custodia en cuentas de orden (costo acreditado o valor convenido). */
  valorCustodia: number;
  /** Vendido y no liquidado (neto de devoluciones): cantidad, venta neta y a precio pactado. */
  sinLiquidar: { cantidad: number; venta: number; pactado: number };
}

export type AmbitoRetencion = 'operacion' | 'remuneracion';
export type ClaseRetencion = 'retefuente' | 'reteiva' | 'reteica';
/**
 * Ronda 4: 'estimada' es lo que se espera que el pagador retenga (nunca se asienta); 'practicada' ya ocurrió y está
 * reconocida con su asiento, sin esperar el certificado.
 */
export type EstadoRetencion = 'estimada' | 'practicada' | 'pendiente' | 'no_aplica';

/** Retención de una liquidación: por ámbito, clase y grupo de pagadores. «valor» es null mientras esté pendiente. */
export interface RetencionLiquidacion {
  id: string;
  ambito: AmbitoRetencion;
  clase: ClaseRetencion;
  pagador: 'comprador' | 'dueno';
  grupo: 'consumidor_final' | 'sin_datos' | 'no_agente' | 'agente' | 'por_acreditar' | 'dueno';
  base: number | null;
  tarifa: number | null;
  valor: number | null;
  estado: EstadoRetencion;
  motivo: string | null;
  /** Ronda 4: la retención practicada reconocida (valor, base, fecha y soporte). */
  practicada?: { valor: number; base: number | null; fecha: string; soporte: string } | null;
  conciliado: { valor: number; soporte: string; fecha: string } | null;
}

export const ORDEN_CLASES: readonly ClaseRetencion[] = ['retefuente', 'reteiva', 'reteica'];

/** Retenciones de una liquidación separadas por ámbito, en el orden fijo de clases. */
export function retencionesPorAmbito(rs: readonly RetencionLiquidacion[]): Record<AmbitoRetencion, RetencionLiquidacion[]> {
  const orden = (r: RetencionLiquidacion) => ORDEN_CLASES.indexOf(r.clase);
  const de = (a: AmbitoRetencion) => rs.filter((r) => r.ambito === a).sort((x, y) => orden(x) - orden(y) || x.grupo.localeCompare(y.grupo));
  return { operacion: de('operacion'), remuneracion: de('remuneracion') };
}

/** Lo que falta conciliar: pendientes, estimadas y practicadas sin certificado. */
export const porConciliar = (rs: readonly RetencionLiquidacion[]): RetencionLiquidacion[] =>
  rs.filter((r) => r.estado !== 'no_aplica' && !r.conciliado);

export interface LiquidacionRecibida {
  id: string;
  estado: 'por_facturar' | 'liquidada' | 'anulada';
  desde: string | null;
  hasta: string | null;
  venta: number;
  pactado: number;
  descuentos: number;
  iva: number;
  remuneracion: number;
  dueno: number;
  porPagar: number;
  derechosDescontados: number;
  /** Remuneración de lo liquidado que aún espera la obligación posterior. */
  remuneracionPorDevengar: number;
  retenciones: RetencionLiquidacion[];
  compartida: boolean;
  creada: string;
}

export interface NotaRecibida {
  id: string;
  numero: string;
  proveedorId: number;
  consignante: string;
  sucursalId: number;
  contrato: Exclude<Contrato, 'compra'>;
  condicion: CondicionContable;
  tributario: 'mandato' | 'estimatorio_438_455';
  valoracion: Valoracion;
  precioModo: 'fijo' | 'minimo';
  remuneracionModo: 'porcentaje' | 'precio_liquidacion';
  baseComision: 'precio_pactado' | 'precio_venta';
  comisionPct: number;
  reconocimiento: Reconocimiento;
  obligacionPosterior: string | null;
  /** Remuneración vendida y aún no reconocida (espera la obligación posterior). */
  remuneracionPorReconocer: number;
  facturaRemuneracion: boolean;
  obligacionDueno: 'venta' | 'cobro' | null;
  riesgos: { devoluciones: ParteContrato; perdidas: ParteContrato; gastos: ParteContrato };
  estado: EstadoRecibida;
  vinculada: boolean;
  numeroExterno: string | null;
  cuentas: { orden: string | null; contra: string | null; recaudo: string | null; remuneracion: string | null };
  /** Devoluciones de lo ya liquidado: derecho frente al dueño (solo se descuenta con acuerdo). */
  derechosFrenteAlDueno: number;
  fecha: string;
  lineas: LineaRecibida[];
  liquidaciones: LiquidacionRecibida[];
  /** Vendido sin liquidar (neto de devoluciones), a precio pactado. */
  vendidoSinLiquidar: number;
  unidadesSinLiquidar: number;
}

export interface DocumentoPorAceptar {
  id: string;
  tipo: 'consignacion_nota' | 'consignacion_liquidacion' | 'consignacion_devolucion';
  de: { nombre: string | null; nit: string | null };
  numero: string | null;
  fecha: string;
  payload: Record<string, unknown>;
}

export interface RespuestaRecibidas {
  pendiente: boolean;
  notas: NotaRecibida[];
  porAceptar: DocumentoPorAceptar[];
}

export const enTuPoder = (l: Pick<LineaRecibida, 'recibido' | 'vendido' | 'devuelto'> & { novedades?: number }): number =>
  Math.max(0, Math.round((l.recibido - l.vendido - l.devuelto - (l.novedades ?? 0)) * 1000) / 1000);

const r2 = (n: number) => Math.round(n * 100) / 100;

/** KPIs de Recibidas (Figma R1): en tu poder a precio pactado, vendido sin liquidar, tu remuneración estimada y por pagar. */
export function kpisRecibidas(notas: readonly NotaRecibida[]): { enTuPoder: number; vendidoSinLiquidar: number; remuneracion: number; porPagar: number; notasConVentas: number } {
  let poder = 0;
  let vendido = 0;
  let remuneracion = 0;
  let porPagar = 0;
  let notasConVentas = 0;
  for (const n of notas) {
    for (const l of n.lineas) poder += enTuPoder(l) * l.precioPactado;
    if (n.vendidoSinLiquidar > 0) {
      vendido += n.vendidoSinLiquidar;
      notasConVentas += 1;
      if (n.remuneracionModo === 'porcentaje') remuneracion += (n.vendidoSinLiquidar * n.comisionPct) / 100;
    }
    for (const q of n.liquidaciones) if (q.estado !== 'anulada') porPagar += q.porPagar;
  }
  return { enTuPoder: r2(poder), vendidoSinLiquidar: r2(vendido), remuneracion: r2(remuneracion), porPagar: r2(porPagar), notasConVentas };
}

export interface LineaVistaLiquidacion {
  cantidad: number;
  venta: number;
  pactado: number;
  precioLiquidacion: number | null;
}

/**
 * Vista previa de la liquidación (la MISMA fórmula que fn_consignacion_remuneracion
 * y fn_consignacion_recibida_liquidar): lo del dueño es el precio de liquidación ×
 * cantidad, o la base (pactado o venta) menos el porcentaje; la remuneración es la
 * venta menos lo del dueño.
 */
export function vistaLiquidacion(
  lineas: readonly LineaVistaLiquidacion[],
  n: Pick<NotaRecibida, 'remuneracionModo' | 'baseComision' | 'comisionPct'>,
): { venta: number; pactado: number; dueno: number; remuneracion: number; bajoPrecio: boolean } {
  let venta = 0;
  let pactado = 0;
  let dueno = 0;
  let bajoPrecio = false;
  for (const l of lineas) {
    const valor =
      n.remuneracionModo === 'precio_liquidacion'
        ? r2(l.cantidad * (l.precioLiquidacion ?? 0))
        : r2((n.baseComision === 'precio_venta' ? l.venta : l.pactado) * (1 - n.comisionPct / 100));
    if (l.cantidad > 0 && l.venta + 1 < valor) bajoPrecio = true;
    venta += l.venta;
    pactado += l.pactado;
    dueno += valor;
  }
  return { venta: r2(venta), pactado: r2(pactado), dueno: r2(dueno), remuneracion: r2(venta - dueno), bajoPrecio };
}

export function filtrarRecibidas(notas: readonly NotaRecibida[], texto: string): NotaRecibida[] {
  const q = texto.trim().toLocaleLowerCase('es');
  if (!q) return [...notas];
  return notas.filter((n) => n.numero.toLocaleLowerCase('es').includes(q) || n.consignante.toLocaleLowerCase('es').includes(q));
}

export const BADGE_ESTADO_RECIBIDA: Readonly<Record<EstadoRecibida, string>> = {
  en_consignacion: 'en proceso',
  por_liquidar: 'pendiente',
  liquidada: 'completado',
};

/** Tipos de pendiente contable que dejan las consignaciones (bandeja de «Pendientes contables»). */
export const PENDIENTES_CONSIGNACION = [
  'consignacion_config',
  'consignacion_retencion_pendiente',
  'consignacion_retencion_por_conciliar',
  'consignacion_remuneracion_por_devengar',
  'consignacion_factura_remuneracion',
  'consignacion_obligacion_al_cobro',
  'consignacion_derecho_frente_al_dueno',
  'consignacion_devolucion_asumida',
  'consignacion_devolucion_pos',
  'consignacion_novedad',
  'consignacion_venta_bajo_precio',
  'consignacion_sin_nota',
  'consignacion_venta',
] as const;
