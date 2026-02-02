import { NextRequest, NextResponse } from 'next/server';
import { aiActionsService, AIAction } from '@/lib/services/aiActionsService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body as { action: AIAction };

    if (!action) {
      return NextResponse.json(
        { error: 'Acción requerida' },
        { status: 400 }
      );
    }

    // Verificar que la acción esté confirmada
    if (action.status !== 'confirmed') {
      return NextResponse.json(
        { error: 'La acción debe ser confirmada antes de ejecutarse' },
        { status: 400 }
      );
    }

    // Verificar permisos
    const permission = aiActionsService.canExecuteAction(action.type, action.userRole);
    if (!permission.allowed) {
      return NextResponse.json(
        { error: permission.reason || 'Sin permisos para esta acción' },
        { status: 403 }
      );
    }

    // Ejecutar la acción
    const result = await aiActionsService.executeAction(action);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error ejecutando acción:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Error procesando la solicitud' },
      { status: 500 }
    );
  }
}
