/**
 * GET /api/pos/cocina/permisos — qué puede hacer el usuario en Comandas
 * (`operar`, `gestionar`), resuelto en el servidor con la sesión. La pantalla
 * lo usa para el estado «sin permiso» y para ocultar acciones; cada acción la
 * vuelve a comprobar su ruta y la base.
 */
import { NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { puedeCocina } from '@/lib/pos/cocina/permisosCocina';
import { SIN_CACHE, respuestaOrgError } from '@/lib/pos/cocina/rutaRpcCocina';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = await getServerOrgContext(request);
    const [operar, gestionar] = await Promise.all([puedeCocina(ctx, 'operar'), puedeCocina(ctx, 'gestionar')]);
    return NextResponse.json({ operar: operar || gestionar, gestionar }, { headers: SIN_CACHE });
  } catch (err) {
    const r = respuestaOrgError(err);
    if (r) return r;
    throw err;
  }
}
