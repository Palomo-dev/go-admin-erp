// ============================================================
// Filtros de los reportes de ventas: persona, método de pago y «Contar por».
//
// Puro (lo usan la URL, el visor, el documento PDF y los tests). Las RPC
// `fn_reporte_ventas_personas`, `fn_reporte_mas_vendido` y
// `fn_reporte_items_vendidos` reciben los tres como `p_contar_por`,
// `p_persona` y `p_metodos`; la base vuelve a validarlos (`contar_por_invalido`).
//
// - Persona: uuid del usuario (cajero, vendedor o mesero según «Contar por»).
// - Métodos: códigos de `payment_methods.code` (`cash`, `card`, `nequi`…).
// - Contar por: a quién se le atribuye la venta. Cajero = quien la registró
//   (y, en lo cobrado, quien registró el pago); vendedor = el vendedor
//   asignado o, sin él, quien la registró; mesero = quien atendió la mesa.
// ============================================================

import type { OpcionesReporte } from './types';

export const CONTAR_POR = ['cajero', 'vendedor', 'mesero'] as const;
export type ContarPor = (typeof CONTAR_POR)[number];

/** Lo que usan las RPC cuando no se elige: la venta es de quien la registró. */
export const CONTAR_POR_DEFECTO: ContarPor = 'cajero';

/** Métodos de pago que se pueden elegir a la vez (la URL no crece sin tope). */
export const MAX_METODOS = 12;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METODO_RE = /^[a-z0-9_]{1,40}$/;

export function esContarPor(v: unknown): v is ContarPor {
  return typeof v === 'string' && (CONTAR_POR as readonly string[]).includes(v);
}

export function esPersona(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

export function esCodigoMetodo(v: unknown): v is string {
  return typeof v === 'string' && METODO_RE.test(v);
}

/** Persona de la URL o de un parámetro: uuid en minúsculas, o null. */
export function leerPersona(v: string | null | undefined): string | null {
  const s = v?.trim().toLowerCase() ?? '';
  return esPersona(s) ? s : null;
}

/**
 * Métodos de una lista separada por comas (o de un arreglo): solo códigos
 * válidos, sin repetir, en el orden en que llegan y como mucho `MAX_METODOS`.
 */
export function leerMetodos(v: string | readonly string[] | null | undefined): string[] {
  const crudos = typeof v === 'string' ? v.split(',') : (v ?? []);
  const vistos = new Set<string>();
  for (const c of crudos) {
    const codigo = String(c).trim();
    if (esCodigoMetodo(codigo)) vistos.add(codigo);
    if (vistos.size >= MAX_METODOS) break;
  }
  return Array.from(vistos);
}

export function leerContarPor(v: string | null | undefined): ContarPor | null {
  return esContarPor(v) ? v : null;
}

export interface ParametrosRpcVentas {
  p_contar_por: ContarPor;
  p_persona: string | null;
  p_metodos: string[] | null;
}

/** Sin persona, sin métodos y contando por cajero: lo que ve el cierre consolidado. */
export const PARAMETROS_VENTAS_POR_DEFECTO: Readonly<ParametrosRpcVentas> = Object.freeze({
  p_contar_por: CONTAR_POR_DEFECTO,
  p_persona: null,
  p_metodos: null,
});

/**
 * Parámetros de las RPC de ventas a partir de las opciones del reporte. Vuelve
 * a validar (las opciones pueden venir del asistente o de un enlace): lo que no
 * es válido se descarta, nunca viaja a la base. Sin opciones —cierre
 * consolidado, envío programado, asistente— son los valores por defecto.
 */
export function parametrosRpcVentas(opciones?: OpcionesReporte | null): ParametrosRpcVentas {
  const metodos = leerMetodos(opciones?.metodos ?? null);
  return {
    p_contar_por: leerContarPor(opciones?.contarPor ?? null) ?? CONTAR_POR_DEFECTO,
    p_persona: leerPersona(opciones?.persona ?? null),
    p_metodos: metodos.length > 0 ? metodos : null,
  };
}

/**
 * Opciones del reporte desde los parámetros del documento PDF
 * (`persona`, `metodo` separado por comas y `contar`).
 */
export function opcionesDeParametros(
  p: Readonly<Record<string, string | null | undefined>>,
): Pick<OpcionesReporte, 'persona' | 'metodos' | 'contarPor'> {
  const metodos = leerMetodos(p.metodo ?? null);
  const contarPor = leerContarPor(p.contar ?? null);
  return {
    persona: leerPersona(p.persona ?? null),
    metodos: metodos.length > 0 ? metodos : null,
    ...(contarPor ? { contarPor } : {}),
  };
}
