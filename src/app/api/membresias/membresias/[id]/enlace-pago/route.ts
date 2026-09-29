/**
 * GET /api/membresias/membresias/[id]/enlace-pago — ¿se puede enviar un enlace de pago para renovar
 * esta membresía (C5)? `{ disponible, motivo, pasarelas }`. Requiere memberships.view; otra
 * organización → 404. No crea enlaces (docs/design/MEMBRESIAS-FASE-1-2.md §12.2).
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { estadoEnlacePago } from '@/lib/services/membresias/enlacePago.server';
import { fallo, idEntero, parametros, responder } from '@/lib/services/membresias/respuestaHttp';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'GET /api/membresias/membresias/[id]/enlace-pago' });
  const id = idEntero((await parametros(routeParams)).id);
  if (!id) return fallo(404, 'membresia_no_encontrada');
  return responder(() => estadoEnlacePago(ctx, id));
});
