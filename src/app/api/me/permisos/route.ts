/**
 * GET /api/me/permisos — permisos efectivos de la persona en la organización
 * activa, agrupados por módulo y con nombres legibles (Perfil › Organización y
 * roles, Figma 346:21440).
 *
 *  - La organización sale de la sesión (`withOrg`), nunca de la query ni del
 *    body. Sin sesión: 401; sin pertenencia activa: 403 (lo responde `withOrg`).
 *  - Los permisos los resuelve la base con `get_user_permission_codes`
 *    (rol + cargo, con precedencia del cargo), para el usuario de la SESIÓN.
 *  - «Acceso total» es el mismo criterio de admin que usan las rutas
 *    (`isOrgAdminContext`: super admin o rol 1/2 por id), nunca el nombre del
 *    rol (regla 6). Con él, `hasOrgAdminOrPermission` dice «sí» a todo, así que
 *    la lista no puede decir otra cosa.
 *  - Un error de lectura es 500: nunca se devuelve una lista vacía que parezca
 *    «no tienes permisos».
 */
import { NextResponse } from 'next/server';
import { withOrg, isOrgAdminContext } from '@/lib/utils/orgContext';
import { agruparPermisos, type FilaPermiso, type RespuestaPermisos } from '@/lib/organizacion/permisosEfectivos';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  const accesoTotal = isOrgAdminContext(ctx);

  const [catalogo, codigos] = await Promise.all([
    ctx.supabase.from('permissions').select('code, name, description, module').order('module').order('code'),
    accesoTotal
      ? Promise.resolve({ data: null, error: null })
      : ctx.supabase.rpc('get_user_permission_codes', {
          p_user_id: ctx.userId,
          p_organization_id: ctx.organizationId,
        }),
  ]);

  if (catalogo.error || codigos.error) {
    console.error('[api/me/permisos]', catalogo.error?.message ?? codigos.error?.message);
    return NextResponse.json({ error: 'No se pudieron leer los permisos' }, { status: 500 });
  }

  const efectivos = accesoTotal ? ('todos' as const) : new Set<string>((codigos.data as string[] | null) ?? []);
  const grupos = agruparPermisos((catalogo.data ?? []) as FilaPermiso[], efectivos);
  const cuerpo: RespuestaPermisos = {
    organizationId: ctx.organizationId,
    accesoTotal,
    total: grupos.reduce((n, g) => n + g.permitidos.length, 0),
    grupos,
  };
  return NextResponse.json(cuerpo, { headers: { 'Cache-Control': 'private, no-store' } });
});
