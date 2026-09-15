'use client';

/**
 * Cabecera de página del CRM (F12): título, una frase, botón de actualizar
 * (solo icono, con `aria-label`), un botón secundario y LA acción principal
 * en `blue-600` (brief §1: una sola acción evidente). Los refs de los botones
 * se exponen para que las hojas devuelvan el foco a quien las abrió.
 */

import type { ReactNode, RefObject } from 'react';
import { RefreshCw, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';

interface Action {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}

interface Props {
  title: string;
  description: ReactNode;
  refreshing: boolean;
  onRefresh: () => void;
  secondary?: Action;
  primary: Action;
}

export function CrmPageHeader({ title, description, refreshing, onRefresh, secondary, primary }: Props) {
  const PrimaryIcon = primary.icon;
  const SecondaryIcon = secondary?.icon;
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="icon" aria-label="Actualizar lista" disabled={refreshing} onClick={onRefresh}>
          <RefreshCw className={cn('h-4 w-4', refreshing && 'motion-safe:animate-spin')} aria-hidden="true" />
        </Button>
        {secondary && SecondaryIcon && (
          <Button ref={secondary.buttonRef} type="button" variant="outline" onClick={secondary.onClick}>
            <SecondaryIcon className="mr-1.5 h-4 w-4" aria-hidden="true" /> {secondary.label}
          </Button>
        )}
        <Button ref={primary.buttonRef} type="button" className="bg-blue-600 text-white hover:bg-blue-700" onClick={primary.onClick}>
          <PrimaryIcon className="mr-1.5 h-4 w-4" aria-hidden="true" /> {primary.label}
        </Button>
      </div>
    </header>
  );
}
