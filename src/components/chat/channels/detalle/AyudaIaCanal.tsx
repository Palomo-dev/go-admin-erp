'use client';

/**
 * «Ayuda de la IA» del detalle de un canal (Figma 91-chat-22): qué hace la IA
 * cuando entra un mensaje por este canal. Guarda la página con
 * `chatChannelsService.updateAIMode`; el modelo y el tono se ajustan en
 * Configuración › Chat › IA del chat.
 */
import Link from 'next/link';
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Settings } from 'lucide-react';
import { Tarjeta } from '@/components/kit';
import { cn } from '@/utils/Utils';
import type { AIMode } from '@/lib/services/chatChannelsService';
import { rutaSeccion } from '@/components/configuracion/config/configSectionsRegistry';
import { MODOS_IA } from '../canalesLogica';

export interface AyudaIaCanalProps {
  modo: AIMode;
  onCambiar: (modo: AIMode) => void;
  guardando?: boolean;
  /** Sin el enlace a la configuración del modelo (p. ej. dentro de un formulario). */
  sinEnlace?: boolean;
}

export function AyudaIaCanal({ modo, onCambiar, guardando, sinEnlace }: AyudaIaCanalProps) {
  const t = useTranslations('chatModulo.canales');
  const id = useId();
  return (
    <Tarjeta titulo={t('detalleCanal.ayudaIa.titulo')} descripcion={t('detalleCanal.ayudaIa.descripcion')}>
      <div role="radiogroup" aria-labelledby={`${id}-t`} aria-busy={guardando} className="flex flex-col gap-2">
        <span id={`${id}-t`} className="sr-only">
          {t('detalleCanal.ayudaIa.titulo')}
        </span>
        {MODOS_IA.map((m) => {
          const activo = m === modo;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={activo}
              disabled={guardando}
              onClick={() => !activo && onCambiar(m)}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-wait',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                activo ? 'border-brand bg-brand-tint' : 'border-line bg-surface hover:bg-hover',
              )}
            >
              <span
                aria-hidden="true"
                className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border', activo ? 'border-brand' : 'border-line-strong')}
              >
                {activo && <span className="size-2 rounded-full bg-brand" />}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-semibold text-fg">{t(`modosTitulo.${m}`)}</span>
                <span className="text-[13px] leading-5 text-fg-secondary">{t(`modosDescripcion.${m}`)}</span>
              </span>
            </button>
          );
        })}
        {!sinEnlace && (
          <Link
            href={rutaSeccion('chat.ia')}
            className="mt-1 inline-flex items-center gap-2 self-start rounded-lg px-2 py-1.5 text-[13px] font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Settings aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('detalleCanal.ayudaIa.ajustar')}
          </Link>
        )}
      </div>
    </Tarjeta>
  );
}
