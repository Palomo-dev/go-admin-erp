/**
 * GET /api/crm/voice-agents/[id] — Obtiene un agente de voz.
 * PATCH /api/crm/voice-agents/[id] — Actualiza un agente de voz.
 * DELETE /api/crm/voice-agents/[id] — Elimina un agente de voz.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  getVoiceAgent,
  updateVoiceAgent,
  deleteVoiceAgent,
} from '@/lib/services/crm/voiceAgentService';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    const agent = await getVoiceAgent(id, ctx.organizationId, ctx.supabase);

    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Agente no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: agent }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Voice Agents] GET [id] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    const agent = await updateVoiceAgent(id, ctx.organizationId, body, ctx.supabase);

    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Agente no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: agent }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Voice Agents] PATCH [id] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    await deleteVoiceAgent(id, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Voice Agents] DELETE [id] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
