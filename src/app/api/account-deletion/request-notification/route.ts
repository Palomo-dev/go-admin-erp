import { NextRequest, NextResponse } from 'next/server';
import { sendDeletionRequestNotification } from '@/lib/services/accountDeletionService';

/**
 * POST /api/account-deletion/request-notification
 * 
 * Envía el correo de confirmación cuando un usuario solicita eliminar su cuenta.
 * 
 * Se llama desde EliminarCuentaSection.tsx después de marcar pending_deletion.
 * El correo incluye el texto legal proporcionado por el departamento legal.
 * 
 * Body:
 *   - email: string (requerido)
 *   - userName: string (opcional)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, userName } = body;
    
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Email es requerido' },
        { status: 400 }
      );
    }
    
    console.log(`[Account Deletion] Enviando notificación de solicitud a ${email}`);
    
    await sendDeletionRequestNotification(email, userName || '');
    
    return NextResponse.json({
      success: true,
      message: 'Correo de confirmación enviado',
    });
    
  } catch (error: unknown) {
    console.error('[Account Deletion] Error enviando notificación:', error);
    const message = error instanceof Error ? error.message : 'Error interno';
    
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
