/**
 * GET /api/crm/voice-agents/conocimiento — «Qué sabe el agente» (Figma CRM
 * 1804:905093): los fragmentos de Chat › Base de conocimiento que van a las
 * llamadas, los que no caben en el tope, los `solo-chat` excluidos y la línea
 * de silencio (segundos efectivos del entorno).
 *
 * Lectura: basta con ser miembro activo, igual que `GET /api/crm/voice-agents`.
 * La organización sale de la sesión; se lee con el cliente del usuario (RLS de
 * `knowledge_fragments` por membresía) y con el filtro explícito de la
 * organización. El criterio es el del runtime (`seleccionarConocimientoVoz`).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { leerFragmentosVoz } from '@/lib/services/crm/voiceAgent/agentRuntime';
import { conocimientoParaEditor } from '@/lib/services/crm/voiceAgent/conocimientoEditor';
import { FRASE_AVISO_SILENCIO, tiemposSilencioDeEntorno } from '@/lib/services/crm/voiceAgent/inactividad';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    const filas = await leerFragmentosVoz(ctx.supabase, ctx.organizationId);
    const silencio = tiemposSilencioDeEntorno();
    return NextResponse.json(
      {
        success: true,
        data: {
          ...conocimientoParaEditor(filas),
          silencio: { aviso_s: Math.round(silencio.avisoMs / 1000), cierre_s: Math.round(silencio.cierreMs / 1000), frase: FRASE_AVISO_SILENCIO },
        },
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('[voice-agents/conocimiento]', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'No se pudo leer la base de conocimiento' }, { status: 500 });
  }
});
