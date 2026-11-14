/**
 * POST /api/chat/ai/lab-test — «Probar» del Laboratorio de IA del chat
 * (`/app/chat/ia/laboratorio`, Figma 93-chat-pendientes 04 y 05).
 *
 * - La organización sale de la sesión (`getServerOrgContext`). Si el body trae
 *   otra organización: 403 y se registra (`readOrgBody`).
 * - Permiso resuelto en el servidor: el mismo que configurar la IA del chat
 *   (`admin.full_access`), porque la prueba gasta créditos de la organización.
 * - La generación es la real (`probarEnLaboratorio`, núcleo compartido con
 *   `ai-auto-response`). No envía nada a ningún cliente ni crea conversaciones.
 * - Créditos: saldo antes, cobro después con `chargeAiCredits`; si el
 *   proveedor falla, no se cobra (502 `proveedor`). Sin saldo: 402 `sin_creditos`.
 *
 * Antes armaba su propio prompt con `OpenAIService` y cobraba con
 * `consumeAICredits`: una segunda implementación que no se parecía a lo que
 * respondía la IA real, y fuera del punto único de cobro.
 */
import { NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, readOrgBody, requireOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { ErrorLaboratorio, PERMISO_LABORATORIO_IA, probarEnLaboratorio, pruebaLaboratorioSchema } from '@/lib/services/chat/laboratorioIa.server';
import { logError } from '@/lib/utils/errorMessage';

const RUTA = 'POST /api/chat/ai/lab-test';

export async function POST(request: Request) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: Record<string, unknown> = await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgAdminOrPermission(ctx, PERMISO_LABORATORIO_IA);
    const parsed = pruebaLaboratorioSchema.safeParse(sinClavesDeOrganizacion(body));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const data = await probarEnLaboratorio(ctx, parsed.data);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: err.statusCode });
    }
    if (err instanceof ErrorLaboratorio) {
      return NextResponse.json({ success: false, error: err.message, code: err.codigo }, { status: err.statusCode });
    }
    logError(`[${RUTA}]`, err);
    return NextResponse.json({ success: false, error: 'No se pudo completar la prueba' }, { status: 500 });
  }
}
