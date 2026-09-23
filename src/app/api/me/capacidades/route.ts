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

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  const esAdmin = isOrgAdminContext(ctx);

  const [gestionarNotificaciones, crearSucursal, sucursales, asignaciones] = await Promise.all([
    hasOrgAdminOrPermission(ctx, 'notifications.manage'),
    hasOrgAdminOrPermission(ctx, 'branches.create'),
    ctx.supabase
      .from('branches')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true),
    ctx.memberId && !esAdmin
      ? ctx.supabase.from('member_branches').select('branch_id').eq('organization_member_id', ctx.memberId)
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (sucursales.error) {
    console.error('[api/me/capacidades] sucursales', sucursales.error.message);
    return NextResponse.json({ error: 'No se pudieron leer las sucursales' }, { status: 500 });
  }

  const todas = (sucursales.data ?? []).map((b) => b.id as number);
  const asignadas = (asignaciones.data ?? []).map((a) => a.branch_id as number);
  // Misma regla que branchService.getAccessibleBranches, sin el nombre del rol:
  // el admin ve todas; el resto, las asignadas, y si no tiene ninguna asignada,
  // todas (fail-open de UX que coincide con la RLS vigente).
  const permitidas = esAdmin || asignadas.length === 0 ? todas : todas.filter((id) => asignadas.includes(id));

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
      },
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
});
