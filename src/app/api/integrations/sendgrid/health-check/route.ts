// ============================================================
// POST /api/integrations/sendgrid/health-check
// Verifica que las credenciales de SendGrid sean válidas
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { sendgridService } from '@/lib/services/integrations/sendgrid/sendgridService';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();

    // Modo 1: Validar por connectionId (conexión ya guardada)
    if (body.connectionId) {
      const result = await sendgridService.healthCheck(body.connectionId);
      return NextResponse.json({
        valid: result.ok,
        message: result.message,
        scopes: result.scopes,
      });
    }

    // Modo 2: Validar API Key directamente (antes de guardar)
    if (body.api_key) {
      const verification = await sendgridService.verifyApiKey(body.api_key);
      return NextResponse.json({
        valid: verification.valid,
        message: verification.valid
          ? `API Key válida: ${verification.scopes.length} permisos (${verification.hasMailSend ? 'Mail Send ✓' : '⚠️ Sin Mail Send'})`
          : 'API Key inválida o expirada',
        scopes: verification.scopes,
        hasMailSend: verification.hasMailSend,
      });
    }

    return NextResponse.json(
      { error: 'Se requiere connectionId o api_key' },
      { status: 400 }
    );
  } catch (err) {
    console.error('[API SendGrid Health] Error:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
