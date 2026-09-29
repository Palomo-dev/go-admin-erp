/**
 * Respuestas HTTP de `/api/membresias/**`: sin caché, errores con `codigo` (la interfaz los
 * traduce en `membresias.errores.*`) y 403/404 sin revelar datos de otra organización.
 */
import { NextResponse } from 'next/server';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { ErrorMembresiasServidor } from './membresias.server';

export const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;

export function ok(datos: unknown): NextResponse {
  return NextResponse.json(datos, { headers: SIN_CACHE });
}

export function fallo(estado: number, codigo: string): NextResponse {
  return NextResponse.json({ error: codigo, codigo }, { status: estado, headers: SIN_CACHE });
}

/** Ejecuta la acción y convierte los errores conocidos en respuestas; el resto sube a `withOrg`. */
export async function responder(accion: () => Promise<unknown>): Promise<NextResponse> {
  try {
    return ok(await accion());
  } catch (err) {
    if (err instanceof ErrorMembresiasServidor) return fallo(err.estado, err.codigo);
    if (err instanceof OrgContextError) return fallo(err.statusCode, err.code);
    console.error('[membresias] error no controlado', err instanceof Error ? err.message : err);
    return fallo(500, 'error_interno');
  }
}

/** Id entero positivo de la ruta, o null. */
export function idEntero(valor: unknown): number | null {
  const s = typeof valor === 'string' ? valor : '';
  if (!/^\d{1,10}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}

export async function parametros(routeParams?: {
  params: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Record<string, string | string[] | undefined>> {
  return routeParams ? await routeParams.params : {};
}

export function entero(v: string | null): number | undefined {
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
