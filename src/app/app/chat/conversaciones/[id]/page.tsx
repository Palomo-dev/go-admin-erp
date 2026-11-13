'use client';

/**
 * Chat › conversación completa (Figma 91-chat-10): cabecera con pestañas
 * Conversación · Actividad · Archivos, hilo + compositor y el panel Cliente ·
 * Acciones · Notas · IA. Usa EXACTAMENTE las mismas piezas y el mismo hook que
 * la Bandeja (`useConversacion`, `AreaConversacion`, `PanelConversacion`):
 * el envío ya no se guarda por fuera de la API de WhatsApp.
 */
import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useEsEscritorio } from '@/components/kit';
import { useConversacion } from '@/components/chat/conversations/useConversacion';
import { CabeceraConversacion } from '@/components/chat/conversations/CabeceraConversacion';
import { AreaConversacion } from '@/components/chat/conversations/AreaConversacion';
import { PanelConversacion } from '@/components/chat/conversations/panel/PanelConversacion';
import { TiraDetalles } from '@/components/chat/conversations/HojaDetalles';

export default function ConversacionCompletaPage() {
  const params = useParams();
  const conversationId = String(params?.id ?? '');
  const { organization } = useOrganization();
  const organizationId = organization?.id as number | undefined;
  const esEscritorio = useEsEscritorio();
  const c = useConversacion(organizationId, conversationId);
  const [insertar, setInsertar] = useState<{ texto: string; clave: number } | null>(null);
  const editarRespuesta = (texto: string) => setInsertar({ texto, clave: Date.now() });

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <CabeceraConversacion c={c} seccion="conversacion" conversationId={conversationId} />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TiraDetalles c={c} organizationId={organizationId} onEditarRespuesta={editarRespuesta} className="lg:hidden" />
          <AreaConversacion c={c} insertar={insertar} compacto={!esEscritorio} />
        </div>
        <aside className="hidden w-[340px] shrink-0 border-l border-line lg:flex xl:w-[360px]">
          <PanelConversacion id="panel-conversacion" c={c} organizationId={organizationId} onEditarRespuesta={editarRespuesta} className="w-full" />
        </aside>
      </div>
    </div>
  );
}
