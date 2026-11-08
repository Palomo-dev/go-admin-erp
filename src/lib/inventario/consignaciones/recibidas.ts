/**
 * Consignación en dos sentidos y entre organizaciones — contrato y lógica sin
 * React ni Supabase (Figma «07 Finanzas» sección `2403:146159`, capturas
 * `docs/design/figma/89-consignacion-recibida-*.png`).
 *
 * Criterio del Contador (docs/design/CONSIGNACION-RECIBIDA-Y-ENTRE-ORGANIZACIONES.md,
 * «Correcciones del Contador 2»):
 * - La clasificación del contrato es OBLIGATORIA y no tiene valor por defecto:
 *   intermediación (mandato), estimatorio o compra real. La compra real no es
 *   consignación: va por la factura de compra de siempre.
 * - IVA y retenciones no se eligen: se determinan por ley con los hechos de cada
 *   liquidación; lo no parametrizado queda como pendiente contable visible.
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

export interface CondicionesContrato {
  /** null hasta que la persona elige: no hay valor por defecto. */
  contrato: Contrato | null;
  precioModo: 'fijo' | 'minimo' | null;
  remuneracionModo: 'porcentaje' | 'precio_liquidacion' | null;
  baseComision: 'precio_pactado' | 'precio_venta' | null;
  /** Intermediación: cuándo nace la obligación con el dueño en ventas a crédito. */
  obligacionDueno: 'venta' | 'cobro' | null;
  riesgos: { devoluciones: ParteContrato | null; perdidas: ParteContrato | null; gastos: ParteContrato | null };
  /** Estimatorio: quién factura al público. En intermediación factura el mandatario. */
  factura: 'consignatario' | 'consignante' | null;
}

export const CONDICIONES_VACIAS: CondicionesContrato = {
  contrato: null,
  precioModo: null,
  remuneracionModo: null,
  baseComision: null,
  obligacionDueno: null,
  riesgos: { devoluciones: null, perdidas: null, gastos: null },
  factura: null,
};

export type ErrorCondicion =
  | 'contrato'
  | 'compra_real'
  | 'precio'
  | 'remuneracion'
  | 'base'
  | 'obligacion'
  | 'riesgos';

/** Lo que falta para poder operar. Vacío = se puede enviar. */
export function validarCondiciones(c: CondicionesContrato): ErrorCondicion[] {
  if (!c.contrato) return ['contrato'];
  if (c.contrato === 'compra') return ['compra_real'];
  const errores: ErrorCondicion[] = [];
  if (!c.precioModo) errores.push('precio');
  if (!c.remuneracionModo) errores.push('remuneracion');
  if (c.remuneracionModo === 'porcentaje' && !c.baseComision) errores.push('base');
  if (c.contrato === 'intermediacion' && !c.obligacionDueno) errores.push('obligacion');
  if (!c.riesgos.devoluciones || !c.riesgos.perdidas || !c.riesgos.gastos) errores.push('riesgos');
  return errores;
}

/** Cuerpo `terminos` que esperan las RPC (claves en español, como la base). */
export function terminosDeCondiciones(c: CondicionesContrato, extra: { cuentaRecaudo?: string | null } = {}): Record<string, unknown> {
  return {
    contrato: c.contrato,
    precio_modo: c.precioModo,
    remuneracion_modo: c.remuneracionModo,
    base_comision: c.remuneracionModo === 'porcentaje' ? c.baseComision : null,
    obligacion_dueno: c.contrato === 'intermediacion' ? c.obligacionDueno : null,
    riesgos: c.riesgos,
    factura: c.contrato === 'intermediacion' ? 'consignatario' : (c.factura ?? 'consignatario'),
    ...(extra.cuentaRecaudo ? { cuenta_recaudo: extra.cuentaRecaudo.trim() } : {}),
  };
}

const PARTE = z.enum(['dueno', 'consignatario']);

/** Validación del servidor: la clasificación es obligatoria (sin `.default`). */
export const terminosSchema = z
  .object({
    contrato: z.enum(CONTRATOS),
    precio_modo: z.enum(['fijo', 'minimo']),
    remuneracion_modo: z.enum(['porcentaje', 'precio_liquidacion']),
    base_comision: z.enum(['precio_pactado', 'precio_venta']).nullable().optional(),
    obligacion_dueno: z.enum(['venta', 'cobro']).nullable().optional(),
    riesgos: z.object({ devoluciones: PARTE, perdidas: PARTE, gastos: PARTE }).strict(),
    factura: z.enum(['consignatario', 'consignante']).optional(),
    cuenta_recaudo: z.string().regex(/^281510\d{2}$/).optional(),
  })
  .strict()
  .superRefine((t, ctx) => {
    if (t.remuneracion_modo === 'porcentaje' && !t.base_comision) ctx.addIssue({ code: 'custom', path: ['base_comision'], message: 'obligatoria' });
    if (t.contrato === 'intermediacion' && !t.obligacion_dueno) ctx.addIssue({ code: 'custom', path: ['obligacion_dueno'], message: 'obligatoria' });
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
      .array(z.object({ product_id: z.number().int().positive(), qty: CANTIDAD, precio: PRECIO, precio_liquidacion: PRECIO.nullable().optional() }).strict())
      .min(1)
      .max(200),
    clave_idempotencia: CLAVE,
  })
  .strict();
export type SolicitudRecibir = z.infer<typeof recibirSchema>;

export const devolverSchema = z
  .object({
    lineas: z.array(z.object({ linea_id: z.string().uuid(), qty: CANTIDAD }).strict()).min(1).max(200),
    notas: z.string().max(2000).nullable().optional(),
    clave_idempotencia: CLAVE,
  })
  .strict();

export const liquidarRecibidaSchema = z
  .object({
    hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    clave_idempotencia: CLAVE,
  })
  .strict();

export const anularLiquidacionSchema = z.object({ motivo: z.string().trim().min(5).max(500) }).strict();

export const aceptarNotaSchema = z
  .object({
    sucursal_id: z.number().int().positive(),
    mapeo: z
      .array(z.object({ producto_ref: z.string().min(1).max(120), product_id: z.number().int().positive(), precio: PRECIO.nullable().optional() }).strict())
      .max(200),
    cuenta_recaudo: z.string().regex(/^281510\d{2}$/).nullable().optional(),
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
  'terminos_invalidos',
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
  'precio_liquidacion_obligatorio',
  'stock_insuficiente',
  'excede_en_su_poder',
  'sin_cuenta_orden_consignacion',
  'sin_cuenta_contra_orden',
  'sin_cuenta_recaudo_propietario',
  'cuenta_recaudo_invalida',
  'sin_cuenta_remuneracion',
  'sin_cuenta_costo',
  'nota_no_encontrada',
  'liquidacion_no_encontrada',
  'liquidacion_pendiente',
  'liquidacion_no_es_la_ultima',
  'liquidacion_anulada',
  'liquidacion_aceptada_por_el_dueno',
  'anular_factura_compra_primero',
  'sin_ventas_por_liquidar',
  'saldo_a_favor_del_consignatario',
  'venta_bajo_precio_pactado',
  'devolucion_estimatorio_pendiente',
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
  'proveedor_distinto',
  'documento_anulado',
  'factura_compra_no_creada',
  'asiento_no_creado',
  'error_desconocido',
] as const;
export type ErrorRecibida = (typeof ERRORES_RECIBIDA)[number];

/** Bloqueos por configuración: la app deja además el pendiente contable visible. */
export const ERRORES_DE_CONFIGURACION: readonly ErrorRecibida[] = [
  'sin_cuenta_orden_consignacion',
  'sin_cuenta_contra_orden',
  'sin_cuenta_recaudo_propietario',
  'sin_cuenta_remuneracion',
  'sin_cuenta_costo',
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
      return 404;
    case 'pendiente_de_activar':
      return 501;
    case 'liquidacion_pendiente':
    case 'stock_insuficiente':
    case 'documento_no_disponible':
    case 'vinculo_existente':
    case 'liquidacion_no_es_la_ultima':
    case 'liquidacion_aceptada_por_el_dueno':
    case 'anular_factura_compra_primero':
      return 409;
    case 'datos_invalidos':
      return 400;
    case 'error_desconocido':
    case 'asiento_no_creado':
    case 'factura_compra_no_creada':
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
  precioPactado: number;
  precioLiquidacion: number | null;
  /** Vendido y no liquidado (neto de devoluciones): cantidad, venta neta y a precio pactado. */
  sinLiquidar: { cantidad: number; venta: number; pactado: number };
}

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
  facturaCompraId: string | null;
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
  precioModo: 'fijo' | 'minimo';
  remuneracionModo: 'porcentaje' | 'precio_liquidacion';
  baseComision: 'precio_pactado' | 'precio_venta';
  comisionPct: number;
  obligacionDueno: 'venta' | 'cobro' | null;
  riesgos: { devoluciones: ParteContrato; perdidas: ParteContrato; gastos: ParteContrato };
  factura: 'consignatario' | 'consignante';
  estado: EstadoRecibida;
  vinculada: boolean;
  numeroExterno: string | null;
  cuentas: { orden: string | null; contra: string | null; recaudo: string | null; remuneracion: string | null; costo: string | null };
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

export const enTuPoder = (l: Pick<LineaRecibida, 'recibido' | 'vendido' | 'devuelto'>): number =>
  Math.max(0, Math.round((l.recibido - l.vendido - l.devuelto) * 1000) / 1000);

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
 * Vista previa de la liquidación (la MISMA fórmula que fn_consignacion_recibida_liquidar):
 * lo del dueño es el precio de liquidación × cantidad, o la base (pactado o venta)
 * menos el porcentaje; la remuneración es la venta menos lo del dueño.
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
  'consignacion_impuestos_por_determinar',
  'consignacion_base_iva_estimatorio',
  'consignacion_obligacion_al_cobro',
  'consignacion_devolucion_liquidada',
  'consignacion_devolucion_pos',
  'consignacion_sin_nota',
  'consignacion_venta',
] as const;
