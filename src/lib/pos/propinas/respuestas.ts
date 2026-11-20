/**
 * Respuestas de `/api/pos/propinas/**`: errores con su código (que la
 * pantalla traduce) y el permiso de lectura resuelto en el servidor.
 */
import { NextResponse } from 'next/server';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { PropinaError, estadoHttpDe, errorPropina } from './errores';

export const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export function respuestaErrorPropinas(err: unknown, ruta: string, organizationId: number): NextResponse {
  const e = err instanceof PropinaError ? err : errorPropina(err);
  const estado = estadoHttpDe(e.codigo);
  if (estado >= 500) console.error(`[${ruta}]`, { organizationId, message: e.message });
  return NextResponse.json({ error: e.codigo, codigo: e.codigo }, { status: estado, headers: SIN_CACHE });
}

/** Ver Propinas: `pos.view` o `pos.propinas.liquidar` (o administración). */
export async function puedeVerPropinas(ctx: Pick<ServerOrgContext, 'organizationId' | 'userId' | 'roleId' | 'isSuperAdmin' | 'supabase'>): Promise<boolean> {
  const [ver, liquidar] = await Promise.all([hasOrgAdminOrPermission(ctx, 'pos.view'), hasOrgAdminOrPermission(ctx, 'pos.propinas.liquidar')]);
  return ver || liquidar;
}

export function sinPermiso(): NextResponse {
  return NextResponse.json({ error: 'SIN_PERMISO', codigo: 'SIN_PERMISO' }, { status: 403, headers: SIN_CACHE });
}

export function consultaDe(req: Request): Record<string, string> {
  return Object.fromEntries(new URL(req.url).searchParams.entries());
}
