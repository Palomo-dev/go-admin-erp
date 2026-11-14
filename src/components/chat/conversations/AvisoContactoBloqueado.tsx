'use client';

import * as React from 'react';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clasesBoton } from '@/components/kit';

export interface AvisoContactoBloqueadoProps {
  nombre: string;
  onDesbloquear: () => Promise<unknown> | void;
}

/**
 * Lugar del compositor cuando el contacto está bloqueado (Figma
 * 93-chat-pendientes-02): «Bloqueaste a {nombre}» con la consecuencia y
 * «Desbloquear». No se puede escribir a un contacto bloqueado.
 */
export function AvisoContactoBloqueado({ nombre, onDesbloquear }: AvisoContactoBloqueadoProps) {
  const t = useTranslations('chatBandejaPendientes.bloqueo');
  const [ocupado, setOcupado] = React.useState(false);
  return (
    <div role="status" className="flex shrink-0 items-center gap-3 border-t border-line bg-surface px-4 py-3 sm:px-6">
      <Info aria-hidden="true" className="size-5 shrink-0 text-fg-secondary" strokeWidth={1.5} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">{t('avisoTitulo', { nombre })}</p>
        <p className="text-sm text-fg-secondary">{t('avisoDescripcion')}</p>
      </div>
      <button
        type="button"
        disabled={ocupado}
        aria-busy={ocupado || undefined}
        onClick={async () => {
          setOcupado(true);
          try {
            await onDesbloquear();
          } finally {
            setOcupado(false);
          }
        }}
        className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'shrink-0' })}
      >
        {t('desbloquear')}
      </button>
    </div>
  );
}
