/**
 * GET /api/pos/propinas/permisos — qué puede hacer la persona en Propinas,
 * resuelto en el servidor con los códigos de permiso (nunca por el nombre del
 * rol). Solo decide qué se muestra: cada función de la base lo vuelve a
 * comprobar.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { resolverPermisosPropinas } from '@/lib/pos/propinas/propinasServidor';
import { SIN_CACHE } from '@/lib/pos/propinas/respuestas';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => NextResponse.json(await resolverPermisosPropinas(ctx), { headers: SIN_CACHE }));
