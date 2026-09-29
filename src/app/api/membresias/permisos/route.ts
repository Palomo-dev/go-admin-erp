/** GET /api/membresias/permisos — qué puede hacer la sesión en el módulo (resuelto en el servidor). */
import { withOrg } from '@/lib/utils/orgContext';
import { permisosMembresias } from '@/lib/services/membresias/membresias.server';
import { responder } from '@/lib/services/membresias/respuestaHttp';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => responder(() => permisosMembresias(ctx)));
