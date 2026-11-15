/**
 * Ayudas de los route handlers de `/api/hrm/**`: convierten `HrmError` en JSON
 * y leen los parámetros de la ruta. La organización y el actor salen siempre de
 * `withOrg` (getServerOrgContext); nunca del body ni de la query.
 */
import { NextResponse } from 'next/server';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { HrmError } from './tipos';

export const SIN_CACHE = { 'Cache-Control': 'no-store' } as const;

export function responderError(err: unknown, etiqueta: string): Response {
  if (err instanceof HrmError) {
    return NextResponse.json({ error: err.code, code: err.code }, { status: err.status, headers: SIN_CACHE });
  }
  if (err instanceof OrgContextError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode, headers: SIN_CACHE });
  }
  console.error(`[hrm] ${etiqueta}`, err instanceof Error ? err.message : err);
  return NextResponse.json({ error: 'error_hrm', code: 'error_hrm' }, { status: 500, headers: SIN_CACHE });
}

export async function parametroDeRuta(
  routeParams: { params: Promise<Record<string, string | string[] | undefined>> } | undefined,
  nombre: string
): Promise<string> {
  const p = routeParams ? await routeParams.params : {};
  const v = p?.[nombre];
  return Array.isArray(v) ? v[0] ?? '' : v ?? '';
}
