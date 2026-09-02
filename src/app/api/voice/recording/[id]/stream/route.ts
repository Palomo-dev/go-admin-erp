import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getRecordingUrl } from '@/lib/services/crm/recordingStorageService';

/**
 * GET /api/voice/recording/[id]/stream — Reproduce el audio de una grabación.
 *
 * Genera una URL firmada de Supabase Storage (o retorna la URL de Twilio
 * si la grabación no se pudo subir a Storage) y redirige al cliente.
 *
 * Headers de respuesta:
 * - Content-Type: audio/mpeg
 * - Content-Disposition: inline (para reproducir en el navegador, no descargar)
 *
 * Requiere sesión activa (getServerOrgContext) — solo usuarios autenticados
 * de la organización pueden acceder.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recordingId } = await params;

    if (!recordingId) {
      return NextResponse.json(
        { error: 'ID de grabación requerido' },
        { status: 400 }
      );
    }

    // Resolver contexto de organización desde la sesión del usuario
    const { organizationId, supabase } = await getServerOrgContext();

    // Obtener la URL firmada (o URL de Twilio como fallback)
    const recordingUrl = await getRecordingUrl(
      recordingId,
      organizationId,
      supabase
    );

    if (!recordingUrl) {
      return NextResponse.json(
        { error: 'Grabación no encontrada' },
        { status: 404 }
      );
    }

    // Redirigir a la URL firmada con headers de audio
    // Usamos redirect (302) para que el cliente descargue directamente desde Storage
    const response = NextResponse.redirect(recordingUrl, {
      status: 302,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': 'inline',
      },
    });

    return response;
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Voice Recording Stream] error:', message);
    return NextResponse.json(
      { error: 'Error al obtener la grabación' },
      { status: 500 }
    );
  }
}
