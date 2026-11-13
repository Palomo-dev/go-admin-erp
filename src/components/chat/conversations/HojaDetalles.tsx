'use client';

import * as React from 'react';
import { User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { StatusBadge, clasesBoton } from '@/components/kit';
import { TONO_PRIORIDAD, type PrioridadChat } from '@/components/chat/ui/ConversacionFila';
import { PanelConversacion } from './panel/PanelConversacion';
import { TONO_ESTADO } from './CabeceraHilo';
import type { ConversacionControl } from './useConversacion';

/**
 * Tira de estado + botón «Detalles» y la hoja inferior con las 4 pestañas
 * (Figma 91-chat-15/16/17). En el celular y en pantallas sin panel derecho.
 */
export function TiraDetalles({
  c,
  organizationId,
  onEditarRespuesta,
  className,
}: {
  c: ConversacionControl;
  organizationId: number | null | undefined;
  onEditarRespuesta: (texto: string) => void;
  className?: string;
}) {
  const t = useTranslations('chatBandeja.detalles');
  const te = useTranslations('chatUi.estado');
  const tp = useTranslations('chatUi.prioridad');
  const [abierta, setAbierta] = React.useState(false);
  const d = c.detalle;
  if (!d) return null;
  const estado = (d.status ?? 'open') as keyof typeof TONO_ESTADO;
  const prioridad = (d.priority ?? 'normal') as PrioridadChat;

  return (
    <>
      <div className={`flex shrink-0 items-center gap-2 border-b border-line bg-surface px-4 py-2 ${className ?? ''}`}>
        <StatusBadge estado={estado} etiqueta={te(estado)} tono={TONO_ESTADO[estado] ?? 'neutro'} apariencia="contorno" />
        {prioridad !== 'normal' ? <StatusBadge estado={prioridad} etiqueta={tp(prioridad)} tono={TONO_PRIORIDAD[prioridad]} apariencia="contorno" /> : null}
        <button type="button" onClick={() => setAbierta(true)} className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'ml-auto' })}>
          <User aria-hidden="true" className="size-4" />
          {t('boton')}
        </button>
      </div>
      <Sheet open={abierta} onOpenChange={setAbierta}>
        <SheetContent
          side="bottom"
          hideCloseButton
          aria-describedby={undefined}
          className="flex h-[80dvh] flex-col gap-0 rounded-t-2xl border-line bg-surface p-0 pb-[env(safe-area-inset-bottom)]"
        >
          <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line-strong" />
          <SheetTitle className="sr-only">{t('titulo')}</SheetTitle>
          <PanelConversacion
            id="detalles-movil"
            c={c}
            organizationId={organizationId}
            movil
            pestanaInicial="acciones"
            onEditarRespuesta={(texto) => {
              setAbierta(false);
              onEditarRespuesta(texto);
            }}
            className="min-h-0 flex-1"
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
