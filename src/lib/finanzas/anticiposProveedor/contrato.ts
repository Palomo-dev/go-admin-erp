/**
 * Contrato de los anticipos a proveedores (`supplier_advances` +
 * `supplier_advance_applications`, migración 20261108120000, PROPUESTA sin
 * aplicar): route handlers de `/api/anticipos-proveedor/**`, servicio de
 * servidor, cliente del navegador y pruebas. Módulo hoja, sin React ni Supabase.
 *
 * Es el espejo del saldo a favor de clientes (`lib/finanzas/saldosAFavor/contrato.ts`):
 * mismos cuerpos de aplicar, devolver y anular, y un anticipo con proveedor en
 * vez de cliente y sin vencimiento. Toda escritura es UNA RPC transaccional:
 * - crear    → `fn_anticipo_proveedor_crear` (comprobante CE + payments + saldo + asiento)
 * - aplicar  → `fn_anticipo_proveedor_aplicar` (a una cuenta por pagar)
 * - devolver → `fn_anticipo_proveedor_devolver` (el proveedor regresa el dinero)
 * - anular   → `fn_anticipo_proveedor_anular` (sin usar: contra-asiento)
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
      return 409;
    case 'sin_cuenta_anticipos':
    case 'sin_cuenta_por_pagar':
      return 500;
    case 'monto_excede_anticipo':
    case 'proveedor_distinto':
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
  })
  .strict();
export type SolicitudCrearAnticipo = z.infer<typeof crearAnticipoSchema>;

export const aplicarAnticipoSchema = z
  .object({
    cuenta_id: UUID,
    monto: IMPORTE,
    clave_idempotencia: CLAVE,
  })
  .strict();
export type SolicitudAplicarAnticipo = z.infer<typeof aplicarAnticipoSchema>;

export const devolverAnticipoSchema = z
  .object({
    monto: IMPORTE,
    metodo: z.string().min(1).max(40),
    motivo: z.string().trim().min(3).max(500),
    cuenta_bancaria: z.number().int().positive().nullable().optional(),
    referencia: z.string().max(200).nullable().optional(),
    clave_idempotencia: CLAVE,
  })
  .strict();
export type SolicitudDevolverAnticipo = z.infer<typeof devolverAnticipoSchema>;

export const anularAnticipoSchema = z.object({ motivo: z.string().trim().min(3).max(500) }).strict();

export interface ResultadoCrearAnticipo {
  anticipo_id: string;
  grupo_id: string;
  recibo: string;
  repetida: boolean;
  caja_id: number | null;
  monto: number;
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
}

export interface RespuestaListadoAnticipos {
  /** La migración no está aplicada: la pantalla dice «pendiente de activar». */
  pendiente: boolean;
  filas: FilaAnticipoProveedor[];
  /** Cuenta del anticipo de la organización (1330 o la configurada); null si no se resolvió. */
  cuenta: string | null;
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
