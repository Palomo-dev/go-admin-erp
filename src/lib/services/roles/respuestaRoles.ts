/**
 * Respuestas HTTP de `/api/organizacion/roles/**`: sin caché y errores con
 * `codigo` (la interfaz los traduce en `roles.errores.*`). Un rol o una persona
 * de otra organización responde 404, igual que uno inexistente.
 */
import { NextResponse } from 'next/server';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { ErrorRoles } from './erroresRoles';

export const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;

export function fallo(estado: number, codigo: string, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ error: codigo, codigo, ...extra }, { status: estado, headers: SIN_CACHE });
}

export async function responder(accion: () => Promise<unknown>): Promise<NextResponse> {
  try {
    return NextResponse.json(await accion(), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorRoles) return fallo(err.estado, err.codigo, err.extra);
    if (err instanceof OrgContextError) return fallo(err.statusCode, err.code);
    console.error('[roles] error no controlado', err instanceof Error ? err.message : err);
    return fallo(500, 'error_interno');
  }
}

/** Id entero positivo de un segmento de la ruta, o null. */
export function idEntero(valor: unknown): number | null {
  const s = typeof valor === 'string' ? valor : '';
  if (!/^\d{1,10}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n <= 2_147_483_647 ? n : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function idUuid(valor: unknown): string | null {
  return typeof valor === 'string' && UUID.test(valor) ? valor.toLowerCase() : null;
}

export async function parametros(routeParams?: {
  params: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Record<string, string | string[] | undefined>> {
  return routeParams ? await routeParams.params : {};
}
