/**
 * /api/crm/settings/telephony/test-numbers — números de prueba internos del
 * agente de voz (Configuración › CRM › Telefonía).
 *
 *  GET    → números de prueba vigentes de la organización, con quién los agregó
 *           y `puedeEditar` (resuelto aquí, nunca en el cliente).
 *  POST   → { phone, label? } agrega un número (normalizado a E.164).
 *  DELETE → { id } lo da de baja (baja lógica: queda quién y cuándo).
 *
 * POST y DELETE exigen admin de la organización (`withOrg(..., { admin: true })`
 * → `requireOrgAdminOrPermission`). GET lo lee cualquier miembro activo (Figma
 * 1811:908572, «Sin permiso (solo lectura)»): la RLS de SELECT de
 * `crm_voice_test_numbers` ya lo permitía; la ruta solo añade `puedeEditar` con
 * el MISMO criterio de admin que exigen POST, DELETE y la base. La organización sale de la SESIÓN (regla
 * dura 5): `readOrgBody` convierte una organización ajena en el cuerpo o en la
 * query en 403 + registro. Se escribe con el cliente de la sesión, así que la
 * RLS de `crm_voice_test_numbers` vuelve a exigir admin en la base (regla 6).
 *
 * Un número de prueba solo exime del tope semanal de la Ley 2300; ver
 * `src/lib/services/crm/voiceAgent/numerosPrueba.ts`.
 */

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import {
  agregarNumeroPrueba,
  conAutoresNumerosPrueba,
  listarNumerosPrueba,
  MAX_NUMEROS_PRUEBA,
  NumeroPruebaError,
  quitarNumeroPrueba,
} from '@/lib/services/crm/voiceAgent/numerosPrueba';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errorResponse(err: unknown, contexto: string): NextResponse {
  if (err instanceof NumeroPruebaError) {
    if (err.statusCode >= 500) console.error(`[telephony/test-numbers] ${contexto}`, err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
  }
  const message = err instanceof Error ? err.message : 'Error desconocido';
  console.error(`[telephony/test-numbers] ${contexto}`, message);
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}

export const GET = withOrg(
  async (ctx, request) => {
    readOrgBody(ctx, null, { request });
    try {
      const [numeros, puedeEditar] = await Promise.all([
        listarNumerosPrueba(ctx.supabase, ctx.organizationId),
        hasOrgAdminOrPermission(ctx),
      ]);
      const data = await conAutoresNumerosPrueba(ctx.supabase, numeros);
      return NextResponse.json({ success: true, data, max: MAX_NUMEROS_PRUEBA, puedeEditar }, { headers: NO_STORE });
    } catch (err) {
      return errorResponse(err, 'GET');
    }
  }
);

export const POST = withOrg(
  async (ctx, request) => {
    const body = await readOrgBody<{ phone?: unknown; label?: unknown }>(ctx, request);
    try {
      const data = await agregarNumeroPrueba(ctx.supabase, ctx.organizationId, ctx.userId, {
        phone: body?.phone,
        label: body?.label,
      });
      return NextResponse.json({ success: true, data }, { status: 201, headers: NO_STORE });
    } catch (err) {
      return errorResponse(err, 'POST');
    }
  },
  { admin: true }
);

export const DELETE = withOrg(
  async (ctx, request) => {
    const body = await readOrgBody<{ id?: unknown }>(ctx, request);
    const id = typeof body?.id === 'string' && UUID_RE.test(body.id) ? body.id : null;
    if (!id) return NextResponse.json({ success: false, error: 'Identificador inválido' }, { status: 400 });
    try {
      await quitarNumeroPrueba(ctx.supabase, ctx.organizationId, ctx.userId, id);
      return NextResponse.json({ success: true }, { headers: NO_STORE });
    } catch (err) {
      return errorResponse(err, 'DELETE');
    }
  },
  { admin: true }
);
