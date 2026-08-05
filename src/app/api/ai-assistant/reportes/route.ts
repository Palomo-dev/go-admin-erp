import { NextRequest, NextResponse } from 'next/server';
import {
  reportAgentService,
  ReportAgentMessage,
  ReportAgentContext,
} from '@/lib/services/reportes/reportAgentService';
import type { PeriodoCierre } from '@/lib/services/reportes/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      message,
      conversationHistory,
      context,
      periodoActual,
      modulosActivos,
    } = body as {
      message: string;
      conversationHistory: ReportAgentMessage[];
      context: ReportAgentContext;
      periodoActual: PeriodoCierre;
      modulosActivos: string[];
    };

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

    const response = await reportAgentService.sendMessage(
      message,
      conversationHistory || [],
      context,
      periodoActual,
      modulosActivos,
    );

    return NextResponse.json({
      content: response.content,
      reportData: response.reportData,
      usage: response.usage,
    });
  } catch (error: any) {
    console.error('Error en Report Agent API:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Error procesando la solicitud' },
      { status: 500 },
    );
  }
}
