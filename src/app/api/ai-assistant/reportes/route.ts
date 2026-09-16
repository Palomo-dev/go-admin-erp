import { NextRequest, NextResponse } from 'next/server';
import {
  reportAgentService,
  ReportAgentMessage,
  ReportAgentContext,
} from '@/lib/services/reportes/reportAgentService';
import type { PeriodoCierre } from '@/lib/services/reportes/types';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { getServerOrgContext, OrgContextError, type ServerOrgContext } from '@/lib/utils/orgContext';

import { readOrgBody } from '@/lib/security/organizationBody';

/**
 * F0-SEC r4 (qa r3 §2, regla dura 6): la lista blanca de reportes que el
 * asistente puede ejecutar sale del SERVIDOR (`organization_modules` vía
 * `moduleManagementService.getActiveModules`, con el cliente de sesión). Si el
 * body trae `modulosActivos`, solo puede RESTRINGIR (intersección), nunca
 * ampliar: un miembro sin `hrm` en su plan no ejecuta `hrm-nomina` por
 * declararlo. Sin `modulosActivos` en el body se usan todos los activos.
 */
async function resolveModulosActivos(ctx: ServerOrgContext, fromBody: unknown): Promise<string[]> {
  const activos = (await moduleManagementService.getActiveModules(ctx.organizationId, ctx.supabase)).map((m) => m.code);
  if (!Array.isArray(fromBody)) return activos;
  const pedidos = new Set(fromBody.filter((c): c is string => typeof c === 'string'));
  const interseccion = activos.filter((code) => pedidos.has(code));
  const fueraDelPlan = Array.from(pedidos).filter((code) => !activos.includes(code));
  if (fueraDelPlan.length > 0) {
    console.warn('[Reportes IA] modulosActivos del body fuera del plan de la organización; se ignoran', {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      fueraDelPlan,
    });
  }
  return interseccion;
}

export async function POST(request: NextRequest) {
  // Seguridad (F0, C-A): sesión + org activa; el contexto se fuerza a la org de sesión.
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
  }

  try {
    const body = await readOrgBody(ctx, request);
    const {
      message,
      conversationHistory,
      periodoActual,
      modulosActivos: modulosDelBody,
    } = body as {
      message: string;
      conversationHistory: ReportAgentMessage[];
      context: ReportAgentContext;
      periodoActual: PeriodoCierre;
      modulosActivos?: unknown;
    };
    // F0-SEC r4 (qa r3 §3): `context.organizationId` anidado también pasa por
    // la regla dura 5: una organización ajena → 403 FOREIGN_ORGANIZATION y
    // registro, en vez de sobrescribirse en silencio.
    const claimedContext = readOrgBody<Partial<ReportAgentContext> | undefined>(ctx, body.context as Partial<ReportAgentContext> | undefined);
    const context = {
      ...(claimedContext ?? {}),
      organizationId: ctx.organizationId,
      // El rol que ve el prompt es el de la sesión, no el que declare el cliente
      // (solo es texto para el modelo: los permisos no salen de aquí).
      userRole: ctx.roleName || 'miembro',
    } as ReportAgentContext;

    if (!message || !claimedContext || !periodoActual) {
      return NextResponse.json(
        { error: 'message, context y periodoActual son requeridos' },
        { status: 400 },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'Configuración de IA no disponible' },
        { status: 500 },
      );
    }

    const modulosActivos = await resolveModulosActivos(ctx, modulosDelBody);

    // F0-SEC r3 (tester r2, fallo 3): el reporte se ejecuta con el cliente de
    // SESIÓN del usuario (`ctx.supabase`), nunca con el cliente browser (sin
    // sesión en servidor → `anon`) ni con service role (las `fn_reporte_*`
    // rechazan al service role: la guarda de pertenencia exige `auth.uid()`).
    const response = await reportAgentService.sendMessage(
      message,
      conversationHistory || [],
      context,
      periodoActual,
      modulosActivos,
      ctx.supabase,
    );

    return NextResponse.json({
      content: response.content,
      reportData: response.reportData,
      usage: response.usage,
    });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error en Report Agent API:', message);
    return NextResponse.json(
      { error: message || 'Error procesando la solicitud' },
      { status: 500 },
    );
  }
}
