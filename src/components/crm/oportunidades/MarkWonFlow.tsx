'use client';

import { useEffect, useRef } from 'react';
import { toast } from '@/components/ui/use-toast';
import { useStageFlow } from './detail/useStageFlow';
import { opportunitiesService } from './opportunitiesService';
import type { Opportunity } from './types';

/**
 * «Marcar ganada» desde la lista, por el MISMO camino que el detalle, el drawer
 * y el tablero: mover a la etapa ganadora del pipeline con el PATCH del
 * servidor, y si el servidor pide la ficha de venta, abrir `ClosedWonDialog` y
 * después `WonCloseModal`.
 *
 * Antes la lista llamaba a `markAsWon`, que hacía `update({status:'won'})` a
 * pelo: la oportunidad quedaba cerrada sin moverse de etapa, sin ficha de venta
 * y saltándose el gate. Regla 7 de CLAUDE.md: no hay una segunda
 * implementación del cierre; este componente solo monta `useStageFlow`.
 *
 * Se monta cuando el usuario pulsa «ganada» en una fila y se desmonta cuando el
 * padre pone a `null` la oportunidad elegida.
 */
export function MarkWonFlow({
  opportunity,
  onFinished,
}: {
  opportunity: Opportunity;
  onFinished: () => void;
}) {
  const flow = useStageFlow(opportunity.id, opportunity.name, onFinished);
  // El arranque ocurre una sola vez por oportunidad, aunque React vuelva a
  // ejecutar el efecto (StrictMode en desarrollo lo monta dos veces).
  const arrancado = useRef<string | null>(null);

  useEffect(() => {
    if (arrancado.current === opportunity.id) return;
    arrancado.current = opportunity.id;

    let cancelado = false;
    (async () => {
      try {
        const etapaGanadora = await opportunitiesService.getWinningStage(opportunity.pipeline_id);
        if (cancelado) return;
        if (!etapaGanadora) {
          toast({
            title: 'No se puede cerrar como ganada',
            description:
              'El pipeline no tiene ninguna etapa marcada como ganadora. Configúrala en Pipeline › Etapas.',
            variant: 'destructive',
          });
          onFinished();
          return;
        }
        // `change` devuelve true si el servidor la aplicó sin más; si pide la
        // ficha de venta (`needs_won`) abre el diálogo y sigue desde ahí.
        await flow.change(etapaGanadora.id);
      } catch (e) {
        if (cancelado) return;
        toast({
          title: 'Error',
          description: e instanceof Error ? e.message : 'No se pudo cerrar la oportunidad',
          variant: 'destructive',
        });
        onFinished();
      }
    })();

    return () => {
      cancelado = true;
    };
    // `flow` cambia de identidad en cada render; el arranque lo gobierna la ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunity.id, opportunity.pipeline_id]);

  return <>{flow.dialogs}</>;
}
