/**
 * GET /api/me/capacidades — qué puede hacer la persona en la organización activa.
 *
 * Lo consume el shell (sidebar, selector de sucursal) para decidir qué mostrar.
 * Existe para cumplir la regla 6 de CLAUDE.md: hasta ahora el menú de
 * Notificaciones y la opción «Todas las sucursales» se decidían en el navegador
 * comparando el NOMBRE del rol («admin», «owner», «Super Admin»…). Un rol
 * personalizado con ese nombre obtenía el acceso, y uno legítimo con otro
 * nombre lo perdía.
 *
 * Aquí la organización sale de la sesión (`withOrg`), el criterio de admin es
 * `is_super_admin` o `role_id` 1/2, y el resto se pregunta por código de permiso
 * a `check_user_permission` (rol + cargo, con precedencia del cargo). Un error
 * de esa RPC cuenta como «no» (fail-closed).
 *
 * Mostrar u ocultar en la UI no es la barrera de seguridad —esa es RLS y cada
 * endpoint—, pero la UI no debe ofrecer lo que el servidor va a negar.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission, isOrgAdminContext } from '@/lib/utils/orgContext';
import { resolverAlcanceSucursal } from '@/lib/security/alcanceSucursal';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  const esAdmin = isOrgAdminContext(ctx);

  const [gestionarNotificaciones, crearSucursal, alcance] = await Promise.all([
    hasOrgAdminOrPermission(ctx, 'notifications.manage'),
    hasOrgAdminOrPermission(ctx, 'branches.create'),
    // Misma regla que branchService.getAccessibleBranches, sin el nombre del rol.
    resolverAlcanceSucursal(ctx).catch((err: unknown) => {
      console.error('[api/me/capacidades] sucursales', err instanceof Error ? err.message : err);
      return null;
    }),
  ]);

  if (!alcance) {
    return NextResponse.json({ error: 'No se pudieron leer las sucursales' }, { status: 500 });
  }
  const { permitidas, accesoTotal } = alcance;

  return NextResponse.json(
    {
      organizationId: ctx.organizationId,
      esAdmin,
      capacidades: {
        gestionarNotificaciones,
        crearSucursal,
      },
      sucursales: {
        permitidas,
        verTodas: permitidas.length > 1,
        accesoTotal,
      },
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
});
