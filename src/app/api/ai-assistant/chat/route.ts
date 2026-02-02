import { NextRequest, NextResponse } from 'next/server';
import { aiAssistantService, AssistantMessage, AssistantContext } from '@/lib/services/aiAssistantService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversationHistory, context } = body as {
      message: string;
      conversationHistory: AssistantMessage[];
      context: AssistantContext;
    };

    console.log('AI Assistant - Request received:', { message, hasContext: !!context });

    if (!message || !context) {
      return NextResponse.json(
        { error: 'Mensaje y contexto son requeridos' },
        { status: 400 }
      );
    }

    // Verificar que OPENAI_API_KEY esté configurada
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY no está configurada');
      return NextResponse.json(
        { error: 'Configuración de IA no disponible' },
        { status: 500 }
      );
    }

    const response = await aiAssistantService.sendMessage(
      message,
      conversationHistory || [],
      context
    );

    return NextResponse.json({
      content: response.content,
      action: response.action,
      usage: response.usage,
    });
  } catch (error: any) {
    console.error('Error en AI Assistant API:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Error procesando la solicitud' },
      { status: 500 }
    );
  }
}
