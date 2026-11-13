'use client';

import * as React from 'react';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Etiqueta } from '../useConversacion';

export interface EtiquetasConversacionProps {
  actuales: readonly Etiqueta[];
  disponibles: readonly Etiqueta[];
  onAgregar: (id: string) => void;
  onQuitar: (id: string) => void;
  /** Texto del botón de agregar («Etiqueta» o «Agregar»). */
  textoAgregar?: string;
}

/** Etiquetas de la conversación: chips con «×» y «+ Etiqueta» (Figma 91-chat-01/02). */
export function EtiquetasConversacion({ actuales, disponibles, onAgregar, onQuitar, textoAgregar }: EtiquetasConversacionProps) {
  const t = useTranslations('chatBandeja.etiquetas');
  const libres = disponibles.filter((d) => !actuales.some((a) => a.id === d.id));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actuales.map((e) => (
        <span key={e.id} className="inline-flex h-7 items-center gap-1 rounded-full bg-brand-tint pl-3 pr-1.5 text-xs font-medium text-brand-deep">
          {e.name}
          <button
            type="button"
            onClick={() => onQuitar(e.id)}
            aria-label={t('quitar', { nombre: e.name })}
            className="flex size-5 items-center justify-center rounded-full hover:bg-brand-tint-hover"
          >
            <X aria-hidden="true" className="size-3" />
          </button>
        </span>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium text-fg hover:bg-hover">
            <Plus aria-hidden="true" className="size-3.5" />
            {textoAgregar ?? t('agregar')}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
          {libres.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-fg-muted">{disponibles.length === 0 ? t('sinEtiquetas') : t('todasPuestas')}</p>
          ) : (
            libres.map((e) => (
              <DropdownMenuItem key={e.id} onSelect={() => onAgregar(e.id)}>
                <span aria-hidden="true" className="mr-2 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
                {e.name}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
