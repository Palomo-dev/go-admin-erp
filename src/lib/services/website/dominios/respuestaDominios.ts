/**
 * Respuestas HTTP comunes de `/api/sitio-web/dominios/**` (SOLO servidor): un
 * solo traductor de errores para todas las rutas, sin filtrar mensajes
 * internos de la base ni de Vercel.
 */
import { NextResponse } from 'next/server';
import { OrgContextError } from '@/lib/utils/orgContext';
import type { CodigoErrorDominio } from '@/components/sitio-web/dominios/tiposDominios';
import { ErrorDominios } from './dominiosSitioService';
import { ErrorVercel } from './vercelDominios';

export const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function jsonError(estado: number, codigo: CodigoErrorDominio, error: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error, codigo, ...extra }, { status: estado, headers: SIN_CACHE });
}

/** Id del dominio de la ruta, validado como uuid (400 si no lo es). */
export async function idDeRuta(routeParams?: { params: Promise<Record<string, string | string[] | undefined>> }): Promise<string | null> {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  return UUID_RE.test(id) ? id : null;
}

/** Traduce cualquier error de las rutas de dominios. `OrgContextError` sube a `withOrg`. */
export function respuestaDeError(ruta: string, organizationId: number, error: unknown): NextResponse {
  if (error instanceof OrgContextError) throw error;
  if (error instanceof ErrorDominios) return jsonError(error.estado, error.codigo, error.message);
  const codigoPg = (error as { code?: string } | null)?.code;
  if (codigoPg === '42501') return jsonError(403, 'sin_permiso', 'No tienes permiso para gestionar dominios.');
  const mensaje = error instanceof Error ? error.message : String((error as { message?: unknown } | null)?.message ?? error);
  if (error instanceof ErrorVercel) {
    console.error(`[api/${ruta}] Vercel`, { organizationId, estado: error.estado, codigo: error.codigo, mensaje });
    return jsonError(502, 'error_interno', 'El servidor de dominios no respondió bien. Inténtalo en unos minutos.');
  }
  console.error(`[api/${ruta}]`, { organizationId, mensaje });
  return jsonError(500, 'error_interno', 'No pudimos completar la acción con tus dominios.');
}
