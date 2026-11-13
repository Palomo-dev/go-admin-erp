'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { ComposerChat, type ModoComposer } from '@/components/chat/ui/ComposerChat';
import { HiloConversacion } from './HiloConversacion';
import type { ConversacionControl } from './useConversacion';

// El diálogo de WhatsApp del CRM (plantillas aprobadas, variables, vista
// previa y envío por /api/crm/whatsapp/send) se reutiliza tal cual.
const ComposeWhatsAppDialog = dynamic(() => import('@/components/crm/whatsapp/ComposeWhatsAppDialog').then((m) => m.ComposeWhatsAppDialog), { ssr: false });

export interface AreaConversacionProps {
  c: ConversacionControl;
  /** Texto que el panel lleva al compositor («Editar» en IA). */
  insertar?: { texto: string; clave: number } | null;
  compacto?: boolean;
}

/**
 * Hilo + compositor de una conversación: lo comparten la Bandeja (escritorio
 * y móvil) y la vista completa. El envío va SIEMPRE por `c.enviar`
 * (`enviarMensajeConversacion`).
 */
export function AreaConversacion({ c, insertar, compacto = false }: AreaConversacionProps) {
  const [modo, setModo] = React.useState<ModoComposer>('responder');
  const [plantillaAbierta, setPlantillaAbierta] = React.useState(false);
  const d = c.detalle;
  React.useEffect(() => setModo('responder'), [d?.id]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {d ? (
        <HiloConversacion conversationId={d.id} notas={c.notas} agentes={c.agentes} nombreCanal={d.channel?.name ?? null} inicioConversacion={d.created_at} />
      ) : (
        <div className="min-h-0 flex-1 bg-canvas" />
      )}
      <ComposerChat
        modo={modo}
        onModoChange={setModo}
        estado={c.estadoEscritura}
        onEnviar={(envio) => c.enviar(envio)}
        onGuardarNota={c.agregarNota}
        onReabrir={() => void c.cambiarEstado('open')}
        onElegirPlantilla={() => setPlantillaAbierta(true)}
        onSugerirIA={c.sugerirIA}
        respuestasRapidas={c.respuestasRapidas}
        onUsarRespuestaRapida={c.usarRespuestaRapida}
        insertar={insertar}
        compacto={compacto}
      />
      {d && d.channel?.type === 'whatsapp' && plantillaAbierta ? (
        <ComposeWhatsAppDialog
          open={plantillaAbierta}
          onOpenChange={setPlantillaAbierta}
          customerId={d.customer_id}
          customer={d.customer ? { id: d.customer.id, full_name: d.customer.full_name, first_name: d.customer.first_name, phone: d.customer.phone } : null}
          conversationId={d.id}
          channelId={d.channel_id}
          onSent={() => {
            setPlantillaAbierta(false);
            void c.recargar();
          }}
        />
      ) : null}
    </div>
  );
}
