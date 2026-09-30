'use client';

/**
 * GO Asistente — cabecera del panel (Figma `AsistenteCabecera` 660:16002 y
 * `AsistenteBotonCabecera` 660:15791).
 *
 * Azul GO, 64 px, robot + «GO Asistente» (H3 blanco). Botones circulares de
 * 32 px en blanco al 20 %; el activo (historial abierto, voz activada) pasa a
 * blanco sólido con el icono en Azul GO. Cada botón lleva tooltip con su
 * nombre, como pide el componente de Figma, y `aria-label` con el mismo texto.
 *
 * Vista «historial»: el título pasa a «Conversaciones» con ← para volver, y
 * desaparecen historial y voz (no aplican ahí).
 *
 * Deshabilitado (voz apagada en la organización, «Nueva» sin nada que
 * reiniciar, historial mientras responde) el círculo claro se mantiene y solo
 * se atenúa el icono. Antes el botón entero bajaba al 50 %: el blanco al 20 %
 * quedaba en un 10 % casi invisible sobre el Azul GO y la cabecera de la
 * bienvenida se veía «apagada», distinta del Figma (pantalla 02, `667:34706`).
 *
 * Mejora sobre el Figma: en móvil (hoja a pantalla completa) los botones miden
 * 40 px, el mínimo táctil del kit, y «Ampliar» no aparece (no hay a dónde).
 */

import React from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Bot, History, Maximize2, Minimize2, PanelRightClose, SquarePen, Volume2, VolumeX, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/utils/Utils';
import type { ModoPanel } from '@/lib/ai/assistant/panelUi';

export interface PanelHeaderProps {
  vista: 'chat' | 'historial';
  modo: ModoPanel;
  esMovil: boolean;
  /** Mientras responde o confirma no se cambia de hilo. */
  ocupado: boolean;
  hayConversacion: boolean;
  vozActiva: boolean;
  /** Motivo por el que la voz no está disponible (la organización no la activó). */
  vozNoDisponible: string | null;
  onNueva(): void;
  onHistorial(): void;
  onVolver(): void;
  onVoz(): void;
  onModo(modo: ModoPanel): void;
  onCerrar(): void;
}

interface BotonProps {
  etiqueta: string;
  atajo?: string;
  activo?: boolean;
  deshabilitado?: boolean;
  esMovil: boolean;
  onClick(): void;
  children: React.ReactNode;
  className?: string;
  presionado?: boolean;
}

function BotonCabecera({ etiqueta, atajo, activo, deshabilitado, esMovil, onClick, children, className, presionado }: BotonProps) {
  const boton = (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-label={etiqueta}
      aria-pressed={presionado}
      aria-keyshortcuts={atajo}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-fg-on-brand focus-visible:ring-offset-2 focus-visible:ring-offset-brand',
        esMovil ? 'h-10 w-10' : 'h-8 w-8',
        activo
          ? 'bg-surface text-brand hover:bg-surface/90'
          : 'bg-fg-on-brand/20 text-fg-on-brand hover:bg-fg-on-brand/30',
        // El puntero pasa al envoltorio para que el tooltip diga el motivo.
        'disabled:pointer-events-none disabled:text-fg-on-brand/60 disabled:hover:bg-fg-on-brand/20',
        !deshabilitado && className
      )}
    >
      {children}
    </button>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {deshabilitado ? (
          // Un botón deshabilitado no recibe el puntero: sin envoltorio, el
          // tooltip con el motivo («tu organización no activó la voz») no salía.
          <span className={cn('inline-flex shrink-0 cursor-not-allowed rounded-full', className)}>{boton}</span>
        ) : (
          boton
        )}
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {etiqueta}
        {atajo ? <span className="ml-1.5 opacity-70">{atajo}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

export default function PanelHeader({
  vista,
  modo,
  esMovil,
  ocupado,
  hayConversacion,
  vozActiva,
  vozNoDisponible,
  onNueva,
  onHistorial,
  onVolver,
  onVoz,
  onModo,
  onCerrar,
}: PanelHeaderProps) {
  const t = useTranslations('asistente.cabecera');
  const icono = 'h-4 w-4';

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-16 shrink-0 items-center gap-2 bg-brand pl-4 pr-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {vista === 'historial' ? (
            <button
              type="button"
              onClick={onVolver}
              aria-label={t('volver')}
              className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fg-on-brand outline-none hover:bg-fg-on-brand/20 focus-visible:ring-2 focus-visible:ring-fg-on-brand"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
            </button>
          ) : (
            <Bot className="h-5 w-5 shrink-0 text-fg-on-brand" strokeWidth={1.5} aria-hidden="true" />
          )}
          <h2 className="truncate text-base font-semibold leading-[22px] text-fg-on-brand">
            {vista === 'historial' ? t('conversaciones') : t('titulo')}
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <BotonCabecera etiqueta={t('nueva')} esMovil={esMovil} onClick={onNueva} deshabilitado={ocupado || (!hayConversacion && vista === 'chat')}>
            <SquarePen className={icono} strokeWidth={1.5} aria-hidden="true" />
          </BotonCabecera>

          {vista === 'chat' && (
            <>
              <BotonCabecera
                etiqueta={t('historial')}
                esMovil={esMovil}
                onClick={onHistorial}
                deshabilitado={ocupado}
                presionado={false}
              >
                <History className={icono} strokeWidth={1.5} aria-hidden="true" />
              </BotonCabecera>
              <BotonCabecera
                etiqueta={vozNoDisponible ?? (vozActiva ? t('vozActiva') : t('voz'))}
                esMovil={esMovil}
                onClick={onVoz}
                activo={vozActiva}
                presionado={vozActiva}
                deshabilitado={Boolean(vozNoDisponible)}
              >
                {vozActiva ? (
                  <Volume2 className={icono} strokeWidth={1.5} aria-hidden="true" />
                ) : (
                  <VolumeX className={icono} strokeWidth={1.5} aria-hidden="true" />
                )}
              </BotonCabecera>
            </>
          )}

          {!esMovil && (
            <BotonCabecera
              etiqueta={modo === 'ampliado' ? t('reducir') : t('ampliar')}
              esMovil={esMovil}
              onClick={() => onModo(modo === 'ampliado' ? 'acoplado' : 'ampliado')}
              presionado={modo === 'ampliado'}
              // El ampliado (720 px) solo cabe desde 1280 px; por debajo se queda acoplado.
              className="hidden xl:flex"
            >
              {modo === 'ampliado' ? (
                <Minimize2 className={icono} strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <Maximize2 className={icono} strokeWidth={1.5} aria-hidden="true" />
              )}
            </BotonCabecera>
          )}

          <BotonCabecera etiqueta={t('cerrar')} atajo="Esc" esMovil={esMovil} onClick={onCerrar}>
            {esMovil ? (
              <X className={icono} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <PanelRightClose className={icono} strokeWidth={1.5} aria-hidden="true" />
            )}
          </BotonCabecera>
        </div>
      </div>
    </TooltipProvider>
  );
}
