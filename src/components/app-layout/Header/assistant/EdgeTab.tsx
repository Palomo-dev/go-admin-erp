'use client';

/**
 * GO Asistente — pestaña lateral para abrirlo (Figma `AssistantLauncher`
 * Variant=edge-tab 45:2223, pantalla 01 `667:34455`).
 *
 * 28 × 96 px pegada al borde derecho, solo en escritorio y solo con el panel
 * cerrado. Sustituye al cuadrado de 40 × 40 que casi no se veía. El tooltip
 * enseña el atajo (Ctrl+J / ⌘+J), igual que el botón del header.
 */

import React from 'react';
import { useTranslations } from 'next-intl';
import { Bot } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function EdgeTab({ onAbrir, atajo }: { onAbrir(): void; atajo: string }) {
  const t = useTranslations('asistente.cabecera');
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onAbrir}
            aria-label={t('abrir')}
            aria-keyshortcuts="Control+J Meta+J"
            className="fixed right-0 top-1/2 z-40 hidden h-24 w-7 -translate-y-1/2 items-center justify-center rounded-l-lg bg-brand text-fg-on-brand shadow-lg outline-none transition-colors hover:bg-brand-action focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 lg:flex"
          >
            <Bot className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {t('abrir')}
          <span className="ml-1.5 opacity-70">{atajo}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
