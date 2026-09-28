/**
 * Permisos de Finanzas (facturas de venta, cartera y pagos) resueltos en el
 * servidor con el usuario y la organización de la sesión. Nunca por el nombre
 * del rol (regla dura 6). Los usa `GET /api/finanzas/permisos` para pintar la
 * interfaz; cada route handler y cada RPC los vuelve a exigir.
 */
import { hasOrgAdminOrPermission, type ServerOrgContext } from '@/lib/utils/orgContext';

export interface PermisosFinanzasServidor {
  ver: boolean;
  crear: boolean;
  anular: boolean;
  aprobar: boolean;
  posVer: boolean;
  posCrear: boolean;
  posAnular: boolean;
}

type Sujeto = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'roleId' | 'isSuperAdmin' | 'supabase'>;

export async function resolverPermisosFinanzas(ctx: Sujeto): Promise<PermisosFinanzasServidor> {
  const codigos = ['finance.view', 'finance.create', 'finance.void', 'finance.approve', 'pos.view', 'pos.create', 'pos.void'] as const;
  const [ver, crear, anular, aprobar, posVer, posCrear, posAnular] = await Promise.all(
    codigos.map((c) => hasOrgAdminOrPermission(ctx, c)),
  );
  return { ver, crear, anular, aprobar, posVer, posCrear, posAnular };
}
