import { NextRequest, NextResponse } from 'next/server';
import { aiAssistantService, AssistantContext } from '@/lib/services/aiAssistantService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { context } = body as { context: AssistantContext };

    if (!context) {
      return NextResponse.json(
        { error: 'Contexto es requerido' },
        { status: 400 }
      );
    }

    const suggestions = await aiAssistantService.generateQuickSuggestions(context);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Error obteniendo sugerencias:', error);
    return NextResponse.json(
      { suggestions: [
        '¿Cómo puedo crear un nuevo producto?',
        '¿Cómo genero un reporte de ventas?',
        '¿Cómo registro un nuevo cliente?',
      ]},
      { status: 200 }
    );
  }
}
