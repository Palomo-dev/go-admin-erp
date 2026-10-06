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
import { PERMISO_FACTURACION } from '@/lib/stripe/contextoFacturacion';
import { capacidadesNavServidor } from '@/lib/navigation/capacidadesNav.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  const esAdmin = isOrgAdminContext(ctx);

  // Organización (auditoría 2026-10, P1-2): las pantallas de Organización
  // decidían «¿es admin?» en el navegador con `role_id === 2 || 1`, ignorando
  // `is_super_admin`, `admin.full_access` y `billing_management`. Ahora usan
  // estas tres, con el MISMO criterio que el servidor aplica en cada ruta:
  // - gestionarOrganizacion: `withOrg({ admin: true })` (admin o admin.full_access)
  //   — Información, Sucursales, Módulos;
  // - gestionarMiembros: `requireOrgAdmin` de /api/auth/invite (admin) —
  //   Miembros e Invitaciones;
  // - gestionarFacturacion: `contextoDeFacturacion` (admin o billing_management).
  //
  // Las del menú (`PaginaNav.requiere`) salen de `capacidadesNavServidor`, la
  // MISMA función que usa `seccionesVisiblesServidor` (buscador e inicio).
  const [nav, crearSucursal, gestionarOrganizacion, gestionarFacturacion, alcance] = await Promise.all([
    capacidadesNavServidor(ctx),
    hasOrgAdminOrPermission(ctx, 'branches.create'),
    hasOrgAdminOrPermission(ctx),
    hasOrgAdminOrPermission(ctx, PERMISO_FACTURACION),
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
        gestionarNotificaciones: nav.has('gestionarNotificaciones'),
        verAnaliticaWeb: nav.has('verAnaliticaWeb'),
        variasSedes: nav.has('variasSedes'),
        crearSucursal,
        gestionarOrganizacion,
        gestionarMiembros: esAdmin,
        gestionarFacturacion,
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
