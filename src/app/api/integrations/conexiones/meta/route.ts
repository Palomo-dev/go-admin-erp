/**
 * /api/integrations/conexiones/meta — pasos «Activos» y «Qué se envía» del asistente de Meta
 * (diseño 85-42/43) sobre la conexión que creó el OAuth existente.
 *   GET  ?conexion=<uuid>&negocio=<id>&cuenta=<id> → portafolios, cuentas, catálogos y píxeles del
 *        token de la conexión (Graph API real) y la selección actual. Nunca el token.
 *   POST { conexion, negocio, cuenta, catalogo ('nuevo'|id), pixel ('nuevo'|id),
 *          envios: { catalogo, compras } } → guarda la elección y qué se envía.
 * Organización de la sesión (`withOrg`), administración, service role tras resolverla.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { activosMeta, guardarActivosMeta } from '@/lib/services/integrations/conexiones/metaActivos.server';
import { fallo, responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/conexiones/meta';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_META = /^[A-Za-z0-9_]{1,64}$/;

const esquema = z.object({
  conexion: z.string().uuid(),
  negocio: z.string().regex(ID_META),
  cuenta: z.string().regex(ID_META),
  catalogo: z.string().regex(ID_META),
  pixel: z.string().regex(ID_META),
  envios: z.object({ catalogo: z.boolean(), compras: z.boolean() }),
});

export const GET = withOrg(async (ctx, request) => {
  await readOrgBody(ctx, request, { route: `GET ${RUTA}` });
  const q = new URL(request.url).searchParams;
  const conexion = q.get('conexion') ?? '';
  if (!UUID.test(conexion)) return fallo(404, 'NO_ENCONTRADA', 'Conexión no encontrada.');
  const id = (v: string | null) => (v && ID_META.test(v) ? v : null);
  return responder(RUTA, () =>
    activosMeta(getServiceClient(), ctx.organizationId, conexion, { negocio: id(q.get('negocio')), cuenta: id(q.get('cuenta')) }),
  );
}, { admin: true });

export const POST = withOrg(async (ctx, request) => {
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, request, { route: `POST ${RUTA}` }));
  if (!cuerpo.success) return fallo(400, 'VALIDATION', 'Datos inválidos.');
  const { conexion, ...entrada } = cuerpo.data;
  return responder(RUTA, () => guardarActivosMeta(getServiceClient(), ctx.organizationId, conexion, entrada, ctx.organizationName || 'Mi negocio'));
}, { admin: true });
