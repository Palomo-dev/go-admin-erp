import { NextRequest, NextResponse } from 'next/server';
import {
  reportAgentService,
  ReportAgentMessage,
  ReportAgentContext,
} from '@/lib/services/reportes/reportAgentService';
import type { PeriodoCierre } from '@/lib/services/reportes/types';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';

import { readOrgBody } from '@/lib/security/organizationBody';
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
      modulosActivos,
    } = body as {
      message: string;
      conversationHistory: ReportAgentMessage[];
      context: ReportAgentContext;
      periodoActual: PeriodoCierre;
      modulosActivos: string[];
    };
    const context = {
      ...(body.context as ReportAgentContext),
      organizationId: ctx.organizationId,
    } as ReportAgentContext;

    if (!message || !context || !periodoActual || !modulosActivos) {
      return NextResponse.json(
        { error: 'message, context, periodoActual y modulosActivos son requeridos' },
        { status: 400 },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'Configuración de IA no disponible' },
        { status: 500 },
      );
    }

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
