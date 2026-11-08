/**
 * Consignaciones (Figma «07 Finanzas» `2335:138595` lista, `2335:139248` nueva
 * nota, `2335:139356` liquidación): mercancía PROPIA entregada a un
 * consignatario (un cliente que la vende por la organización). «No es una
 * factura. La mercancía sigue siendo tuya.»
 *
 * Contrato de `/api/consignaciones/**` y lógica de presentación (KPIs, estado,
 * en su poder, venta, comisión y neto), sin React ni Supabase. La escritura es
 * de las RPC de la migración 20261108121000 (PROPUESTA sin aplicar):
 * - entregar → `fn_consignacion_entregar` (nota + traslado del kardex a «en poder de
 *   {consignatario}», SIN asiento: la mercancía sigue en el inventario propio a costo
 *   y no cambia de cuenta; Ronda 2 del Contador, punto 8)
 * - liquidar → `fn_consignacion_liquidar`: en mandato espera al Contador
 *   (`liquidacion_mandante_pendiente`); en estimatorio, a los arts. 438 y 455.
 */
import { z } from 'zod';
import { terminosSchema } from '@/lib/inventario/consignaciones/recibidas';

/**
 * Ruta de la lista; la liquidación es `${RUTA_CONSIGNACIONES}/<nota>`. Consignaciones
 * vive en Inventario (decisión del dueño 2026-11-07); `/app/finanzas/consignaciones`
 * redirige aquí.
 */
export const RUTA_CONSIGNACIONES = '/app/inventario/consignaciones';

export const ERRORES_CONSIGNACION = [
  'no_autenticado',
  'sin_permiso',
  'sin_acceso_sucursal',
  'organizacion_no_permitida',
  'datos_invalidos',
  'pendiente_de_activar',
  'clave_idempotencia_invalida',
  'clave_idempotencia_reutilizada',
  'comision_invalida',
  'clasificacion_obligatoria',
  'compra_real_usa_factura',
  'condicion_contable_obligatoria',
  'estimatorio_bloqueado_438_455',
  'terminos_invalidos',
  'liquidacion_mandante_pendiente',
  'precio_bajo_pactado',
  'producto_ajeno',
  'sin_lineas',
  'linea_invalida',
  'cliente_no_encontrado',
  'sucursal_invalida',
  'producto_invalido',
  'producto_sin_seguimiento',
  'producto_con_seriales',
  'producto_con_variantes',
  'stock_insuficiente',
  'sin_cuenta_comisiones',
  'nota_no_encontrada',
  'liquidacion_no_encontrada',
  'liquidacion_pendiente',
  'precio_obligatorio',
  'excede_en_su_poder',
  'factura_no_encontrada',
  'factura_distinta',
  'cliente_distinto',
  'documento_anulado',
  'factura_no_emitida',
  'asiento_no_creado',
  'error_desconocido',
] as const;
export type ErrorConsignacion = (typeof ERRORES_CONSIGNACION)[number];

export function codigoErrorConsignacion(mensaje: string | null | undefined): ErrorConsignacion {
  const texto = (mensaje ?? '').trim();
  if (texto.startsWith('Acceso denegado a la organización')) return 'sin_permiso';
  const primero = texto.split(/[\s:]/)[0];
  if (primero === 'STOCK_INSUFICIENTE') return 'stock_insuficiente';
  return (ERRORES_CONSIGNACION as readonly string[]).includes(primero) ? (primero as ErrorConsignacion) : 'error_desconocido';
}

export function estadoHttpErrorConsignacion(codigo: ErrorConsignacion): number {
  switch (codigo) {
    case 'no_autenticado':
      return 401;
    case 'sin_permiso':
    case 'sin_acceso_sucursal':
    case 'organizacion_no_permitida':
      return 403;
    case 'nota_no_encontrada':
    case 'liquidacion_no_encontrada':
    case 'cliente_no_encontrado':
    case 'factura_no_encontrada':
      return 404;
    case 'pendiente_de_activar':
      return 501;
    case 'liquidacion_pendiente':
    case 'stock_insuficiente':
    case 'documento_anulado':
    case 'factura_no_emitida':
      return 409;
    case 'datos_invalidos':
      return 400;
    case 'error_desconocido':
    case 'asiento_no_creado':
    case 'sin_cuenta_comisiones':
      return 500;
    default:
      return 422;
  }
}

/** Tabla o función de la migración todavía sin aplicar. */
export function esPendienteConsignacion(error: unknown): boolean {
  const e = (error ?? {}) as { code?: unknown; message?: unknown };
  if (e.code === 'PGRST202' || e.code === 'PGRST205' || e.code === '42P01' || e.code === '42883') return true;
  return typeof e.message === 'string' && /(consignment_|fn_consignacion)/i.test(e.message) && /(does not exist|could not find)/i.test(e.message);
}

const CLAVE = z.string().min(8).max(160);
const CANTIDAD = z.number().finite().positive().max(1e9);

export const entregarSchema = z
  .object({
    cliente_id: z.string().uuid(),
    sucursal_id: z.number().int().positive(),
    comision: z.number().finite().min(0).max(100),
    // Clasificación del contrato obligatoria y sin valor por defecto (Contador 2, punto 1).
    terminos: terminosSchema,
    ubicacion: z.string().max(120).nullable().optional(),
    notas: z.string().max(2000).nullable().optional(),
    lineas: z
      .array(z.object({ product_id: z.number().int().positive(), qty: CANTIDAD, precio: z.number().finite().positive().max(1e12).nullable().optional() }).strict())
      .min(1)
      .max(200),
    clave_idempotencia: CLAVE,
  })
  .strict();
export type SolicitudEntregar = z.infer<typeof entregarSchema>;

export const liquidarSchema = z
  .object({
    lineas: z
      .array(
        z
          .object({
            linea_id: z.string().uuid(),
            vendido: z.number().finite().min(0).max(1e9),
            precio: z.number().finite().min(0).max(1e12),
            devuelto: z.number().finite().min(0).max(1e9),
          })
          .strict(),
      )
      .min(1)
      .max(200),
    desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    clave_idempotencia: CLAVE,
  })
  .strict();
export type SolicitudLiquidar = z.infer<typeof liquidarSchema>;

export const facturarSchema = z.object({ clave_idempotencia: CLAVE }).strict();

// ─── Lectura ────────────────────────────────────────────────────────────────

export type EstadoNota = 'en_consignacion' | 'por_liquidar' | 'liquidada';

export interface LineaNota {
  id: string;
  productoId: number;
  producto: string;
  entregado: number;
  vendido: number;
  devuelto: number;
  costoUnitario: number;
}

export interface LiquidacionNota {
  id: string;
  estado: 'por_facturar' | 'liquidada';
  venta: number;
  comisionPct: number;
  comision: number;
  neto: number;
  costoDevuelto: number;
  facturaId: string | null;
  facturaNumero: string | null;
  facturaSaldo: number | null;
  desde: string | null;
  hasta: string | null;
  creada: string;
}

export interface NotaConsignacion {
  id: string;
  numero: string;
  clienteId: string;
  consignatario: string;
  sucursalId: number;
  ubicacion: string | null;
  comisionPct: number;
  estado: EstadoNota;
  costoTotal: number;
  fecha: string;
  lineas: LineaNota[];
  liquidaciones: LiquidacionNota[];
}

export interface RespuestaListadoConsignaciones {
  pendiente: boolean;
  notas: NotaConsignacion[];
}

export const enSuPoder = (l: Pick<LineaNota, 'entregado' | 'vendido' | 'devuelto'>): number =>
  Math.max(0, Math.round((l.entregado - l.vendido - l.devuelto) * 1000) / 1000);

export const unidadesNota = (n: Pick<NotaConsignacion, 'lineas'>): number => n.lineas.reduce((s, l) => s + l.entregado, 0);

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * KPIs de la lista (Figma): Entregado (a costo, lo que sigue en su poder),
 * Vendido sin liquidar (venta reportada por facturar), Devuelto (a costo) y Por
 * cobrar (neto de comisión: lo por facturar más el saldo de las facturas de
 * liquidación).
 */
export function kpisConsignaciones(notas: readonly NotaConsignacion[]): { entregado: number; vendidoSinLiquidar: number; devuelto: number; porCobrar: number } {
  let entregado = 0;
  let vendidoSinLiquidar = 0;
  let devuelto = 0;
  let porCobrar = 0;
  for (const n of notas) {
    for (const l of n.lineas) {
      entregado += enSuPoder(l) * l.costoUnitario;
      devuelto += l.devuelto * l.costoUnitario;
    }
    for (const q of n.liquidaciones) {
      if (q.estado === 'por_facturar') {
        vendidoSinLiquidar += q.venta;
        porCobrar += q.neto;
      } else if (q.facturaSaldo != null) {
        porCobrar += q.facturaSaldo;
      }
    }
  }
  return { entregado: r2(entregado), vendidoSinLiquidar: r2(vendidoSinLiquidar), devuelto: r2(devuelto), porCobrar: r2(porCobrar) };
}

export interface LineaLiquidacion {
  lineaId: string;
  vendido: number;
  precio: number;
  devuelto: number;
}

export type ErrorLineaLiquidacion = 'excede' | 'precio' | null;

/** Validación de una fila de la liquidación (la base la repite). */
export function validarLineaLiquidacion(l: LineaLiquidacion, linea: Pick<LineaNota, 'entregado' | 'vendido' | 'devuelto'>): ErrorLineaLiquidacion {
  if (l.vendido < 0 || l.devuelto < 0) return 'excede';
  if (l.vendido + l.devuelto > enSuPoder(linea) + 1e-9) return 'excede';
  if (l.vendido > 0 && !(l.precio > 0)) return 'precio';
  return null;
}

/** Venta reportada, comisión (redondeo a 2 decimales como la base) y neto por cobrar. */
export function resumenLiquidacion(lineas: readonly LineaLiquidacion[], comisionPct: number): { venta: number; comision: number; neto: number } {
  const venta = r2(lineas.reduce((s, l) => s + l.vendido * l.precio, 0));
  const comision = r2((venta * comisionPct) / 100);
  return { venta, comision, neto: r2(venta - comision) };
}

/** Hay algo que liquidar: alguna fila vendida o devuelta y ninguna inválida. */
export function liquidacionValida(lineas: readonly LineaLiquidacion[], notas: ReadonlyMap<string, Pick<LineaNota, 'entregado' | 'vendido' | 'devuelto'>>): boolean {
  let alguna = false;
  for (const l of lineas) {
    const n = notas.get(l.lineaId);
    if (!n) return false;
    if (validarLineaLiquidacion(l, n)) return false;
    if (l.vendido > 0 || l.devuelto > 0) alguna = true;
  }
  return alguna;
}

/** Búsqueda de la lista: número o consignatario. */
export function filtrarNotas(notas: readonly NotaConsignacion[], texto: string, estado: EstadoNota | null): NotaConsignacion[] {
  const q = texto.trim().toLocaleLowerCase('es');
  return notas.filter((n) => (!estado || n.estado === estado) && (!q || n.numero.toLocaleLowerCase('es').includes(q) || n.consignatario.toLocaleLowerCase('es').includes(q)));
}

/** Badge del estado (SISTEMA-BADGES: en curso · pendiente · cerrado). */
export const BADGE_ESTADO_NOTA: Readonly<Record<EstadoNota, string>> = {
  en_consignacion: 'en proceso',
  por_liquidar: 'pendiente',
  liquidada: 'completado',
};
