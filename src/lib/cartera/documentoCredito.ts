/**
 * Venta a crédito o con saldo pendiente: exige el documento del cliente (instrucción del Contador,
 * 2026-11-25). «Un fiado a consumidor final no se puede cobrar ni reportar bien.»
 *
 * La regla la impone la base (`fn_credito_sin_documento`, migración 20261126011000): si al guardar
 * queda saldo por cobrar (> $1) y el adquiriente es consumidor final o un cliente sin documento,
 * rechaza con `documento_requerido_credito`. Este módulo es lo que la pantalla necesita para
 * adelantarse y para reaccionar al rechazo: abrir «Editar datos de facturación» de la persona (pedir
 * el documento), o decir qué cambiar. Las ventas de contado no pasan por aquí.
 *
 * Módulo puro: sin React ni Supabase.
 */
import type { FacturarA } from '@/lib/clientes/facturarA';

/** Código estable del rechazo (mensaje de la excepción de la base). */
export const CODIGO_DOCUMENTO_CREDITO = 'documento_requerido_credito' as const;

/** Saldo por debajo de esto es redondeo, no crédito (la misma tolerancia de la base). */
export const TOLERANCIA_SALDO_CREDITO = 1;

/** NIT con que la DIAN identifica al consumidor final. */
export const NIT_CONSUMIDOR_FINAL = '222222222222';

/** ¿Este número sirve como documento del adquiriente? (no vacío y distinto del consumidor final) */
export function documentoValido(numero: string | null | undefined, nitConsumidorFinal: string = NIT_CONSUMIDOR_FINAL): boolean {
  const n = (numero ?? '').trim();
  return n !== '' && n !== NIT_CONSUMIDOR_FINAL && n !== nitConsumidorFinal.trim();
}

/** ¿El error (de una RPC, de PostgREST o de una ruta propia) es el rechazo por falta de documento? */
export function esErrorDocumentoCredito(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === 'string') return error.trim().startsWith(CODIGO_DOCUMENTO_CREDITO);
  if (typeof error !== 'object') return false;
  const e = error as { message?: unknown; codigo?: unknown; code?: unknown };
  for (const v of [e.codigo, e.message]) {
    if (typeof v === 'string' && v.trim().split(/[\s:]/)[0] === CODIGO_DOCUMENTO_CREDITO) return true;
  }
  return false;
}

/**
 * Qué hacer cuando la venta deja saldo:
 *  - `ninguna`: el adquiriente tiene documento (o no hay saldo); se guarda como siempre.
 *  - `pedir_documento`: la persona no tiene documento → abrir «Editar datos de facturación».
 *  - `cambiar_facturar_a`: la persona tiene documento pero se escogió «Consumidor final».
 *  - `elegir_cliente`: no hay cliente en la venta.
 */
export type AccionDocumentoCredito = 'ninguna' | 'pedir_documento' | 'cambiar_facturar_a' | 'elegir_cliente';

export interface EntradaDocumentoCredito {
  /** Lo que queda por cobrar al guardar. */
  saldo: number;
  /** La persona del carrito o de la factura (null = sin cliente). */
  personaId: string | null | undefined;
  /** «Facturar a» escogido (null = la de siempre: la persona). */
  facturarA: FacturarA | null | undefined;
  /** ¿La ficha de la persona tiene documento? */
  personaTieneDocumento: boolean;
}

export function accionDocumentoCredito({ saldo, personaId, facturarA, personaTieneDocumento }: EntradaDocumentoCredito): AccionDocumentoCredito {
  if (!(Number(saldo) > TOLERANCIA_SALDO_CREDITO)) return 'ninguna';
  if (!personaId) return 'elegir_cliente';
  if (facturarA?.modo === 'empresa' && facturarA.empresaId) return 'ninguna';
  if (facturarA?.modo === 'consumidor_final' && personaTieneDocumento) return 'cambiar_facturar_a';
  return personaTieneDocumento ? 'ninguna' : 'pedir_documento';
}

/**
 * Tras el rechazo de la base (sin saber el saldo exacto): la misma decisión, con saldo > 0.
 * `cambiar_facturar_a` solo si de verdad la persona ya tiene documento; si no, se pide.
 */
export function accionAnteRechazoCredito(entrada: Omit<EntradaDocumentoCredito, 'saldo'>): Exclude<AccionDocumentoCredito, 'ninguna'> {
  const accion = accionDocumentoCredito({ ...entrada, saldo: TOLERANCIA_SALDO_CREDITO + 1 });
  // El servidor rechazó: si aquí parece que no hace falta nada, la ficha cambió por detrás → pedir.
  return accion === 'ninguna' ? 'pedir_documento' : accion;
}
