/**
 * POST /api/integrations/conexiones/[id]/credenciales/revelar — { proposito } → { valor }.
 * Botón «Ver» / «Copiar» del detalle de conexión (decisión del dueño, 2026-11-07: credenciales
 * visibles y sin cifrar). Exige administración resuelta en el servidor (`withOrg({ admin: true })`:
 * rol 1/2, super admin o permiso `admin.full_access`; nunca por nombre de rol), deja auditoría en
 * `ops_audit_log` (quién, cuándo, cuál, IP) antes de responder y no se cachea.
 * Conexión de otra organización → 404 sin distinguir.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { revelarCredencial } from '@/lib/services/integrations/conexiones/conexiones.server';
import { fallo, idDeRuta, responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/conexiones/[id]/credenciales/revelar';
const esquema = z.object({ proposito: z.string().regex(/^[a-z][a-z0-9_]{1,62}$/) });

function ipDe(request: Request): string | null {
  const reenviada = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (reenviada || request.headers.get('x-real-ip') || '').slice(0, 64) || null;
}

export const POST = withOrg(async (ctx, request, routeParams) => {
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, request, { route: `POST ${RUTA}` }));
  if (!cuerpo.success) return fallo(400, 'VALIDATION', 'Credencial inválida.');
  const id = await idDeRuta(routeParams);
  if (!id) return fallo(404, 'NO_ENCONTRADA', 'Conexión no encontrada.');
  return responder(RUTA, () =>
    revelarCredencial(getServiceClient(), { organizationId: ctx.organizationId, userId: ctx.userId }, id, cuerpo.data.proposito, ipDe(request)),
  );
}, { admin: true });
