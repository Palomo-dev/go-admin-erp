/**
 * Respuestas HTTP de `/api/integrations/conexiones/**` y `/api/integrations/desarrolladores/**`:
 * sin caché, errores con `codigo` y un mensaje para la UI. Nunca un secreto ni el detalle interno.
 */
import { NextResponse } from 'next/server';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { ConexionError } from './conexiones.server';

export const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;
const FORMA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function fallo(estado: number, codigo: string, mensaje: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: mensaje, codigo, ...extra }, { status: estado, headers: SIN_CACHE });
}

/** Ejecuta la acción; `ConexionError` → su estado; `OrgContextError` sube a `withOrg`. */
export async function responder(etiqueta: string, accion: () => Promise<unknown>): Promise<NextResponse> {
  try {
    return NextResponse.json(await accion(), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    if (err instanceof ConexionError) return fallo(err.status, err.codigo, err.message, err.extra);
    console.error(`[${etiqueta}] error no controlado:`, err instanceof Error ? err.message : err);
    return fallo(500, 'INTERNAL', 'Error interno del servidor.');
  }
}

/** Id (uuid) de la ruta o null. */
export async function idDeRuta(routeParams?: { params: Promise<Record<string, string | string[] | undefined>> }): Promise<string | null> {
  const p = routeParams ? await routeParams.params : {};
  const id = typeof p.id === 'string' ? p.id : '';
  return FORMA_UUID.test(id) ? id : null;
}
