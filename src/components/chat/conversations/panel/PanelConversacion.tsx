'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { TabBar, idPanel, idPestana } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { PestanaCliente } from './PestanaCliente';
import { PestanaAcciones } from './PestanaAcciones';
import { PestanaNotas } from './PestanaNotas';
import { PestanaIA } from './PestanaIA';
import type { ConversacionControl } from '../useConversacion';

export type PestanaPanel = 'cliente' | 'acciones' | 'notas' | 'ia';

export interface PanelConversacionProps {
  c: ConversacionControl;
  organizationId: number | null | undefined;
  /** Lleva un texto al compositor («Editar» en la pestaña IA). */
  onEditarRespuesta: (texto: string) => void;
  /** Id único del panel en la página (bandeja, vista completa, hoja móvil). */
  id: string;
  pestanaInicial?: PestanaPanel;
  /** Hoja móvil: «Abrir ficha del cliente» en Acciones. */
  movil?: boolean;
  className?: string;
}

/**
 * Panel de la conversación con pestañas Cliente · Acciones · Notas · IA
 * (Figma 91-chat-01…04, 91-chat-10, 91-chat-16/17). El MISMO componente en la
 * Bandeja, la vista completa y la hoja «Detalles» del móvil.
 */
export function PanelConversacion({ c, organizationId, onEditarRespuesta, id, pestanaInicial = 'cliente', movil = false, className }: PanelConversacionProps) {
  const t = useTranslations('chatBandeja.panel');
  const [pestana, setPestana] = React.useState<PestanaPanel>(pestanaInicial);
  React.useEffect(() => setPestana(pestanaInicial), [pestanaInicial]);

  const pestanas = [
    { valor: 'cliente' as const, etiqueta: t('cliente') },
    { valor: 'acciones' as const, etiqueta: t('acciones') },
    { valor: 'notas' as const, etiqueta: t('notas'), contador: c.notas.length || undefined },
    { valor: 'ia' as const, etiqueta: t('ia') },
  ];

  return (
    <div className={cn('flex min-h-0 flex-col bg-surface', className)}>
      <TabBar id={id} pestanas={pestanas} valor={pestana} onValorChange={setPestana} etiqueta={t('etiqueta')} tamano="sm" className="shrink-0 px-4" />
      <div role="tabpanel" id={idPanel(id, pestana)} aria-labelledby={idPestana(id, pestana)} className="min-h-0 flex-1 overflow-y-auto">
        {pestana === 'cliente' && <PestanaCliente c={c} organizationId={organizationId} />}
        {pestana === 'acciones' && <PestanaAcciones c={c} conFicha={movil} />}
        {pestana === 'notas' && <PestanaNotas c={c} />}
        {pestana === 'ia' && <PestanaIA c={c} onEditar={onEditarRespuesta} />}
      </div>
    </div>
  );
}
