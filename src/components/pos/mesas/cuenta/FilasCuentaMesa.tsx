'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, ClipboardList, UsersRound } from 'lucide-react';
import { inicialesDe } from '@/components/kit';
import { cn } from '@/utils/Utils';
import type { NotaMesa } from './cuentaMesaLogica';

/**
 * Filas fijas de la cuenta de la mesa (Figma `CartPanel Variant=mesa`, D2–D6):
 * el cliente («CF Consumidor final ›», abre el selector del POS) y la nota de
 * la mesa («4 comensales · Entradas primero · Cumpleaños» con la alergia en rojo).
 */
const FILA =
  'flex h-12 w-full items-center gap-3 rounded-lg border border-line bg-surface px-3 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60';

export interface FilaClienteMesaProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Nombre del cliente; sin cliente, «Consumidor final». */
  nombre: string | null;
}

export const FilaClienteMesa = forwardRef<HTMLButtonElement, FilaClienteMesaProps>(function FilaClienteMesa(
  { nombre, className, ...props },
  ref,
) {
  const t = useTranslations('posMesasFlujo.cuenta');
  const texto = nombre ?? t('consumidorFinal');
  return (
    <button ref={ref} type="button" {...props} className={cn(FILA, className)} aria-label={t('cambiarCliente', { nombre: texto })}>
      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-action text-xs font-semibold text-fg-on-brand">
        {nombre ? inicialesDe(nombre) : t('consumidorFinalIniciales')}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{texto}</span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
    </button>
  );
});

export interface FilaNotaMesaProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  nota: NotaMesa;
  comensales: number;
  /** Alergias por comensal sacadas de las líneas («Maní (C2)»). */
  alergiasLineas?: string[];
}

export const FilaNotaMesa = forwardRef<HTMLButtonElement, FilaNotaMesaProps>(function FilaNotaMesa(
  { nota, comensales, alergiasLineas = [], className, ...props },
  ref,
) {
  const t = useTranslations('posMesasFlujo.cuenta');
  const partes = [
    t('comensales', { n: comensales }),
    nota.instrucciones.trim() || null,
    nota.notaCliente.trim() || null,
  ].filter(Boolean);
  const alergias = [...nota.alergias, ...alergiasLineas];
  return (
    <button ref={ref} type="button" {...props} className={cn(FILA, 'h-10', className)} aria-label={t('editarNotaMesa')}>
      <ClipboardList aria-hidden="true" className="size-4 shrink-0 text-brand" strokeWidth={1.5} />
      <span className="min-w-0 flex-1 truncate text-sm text-fg">{partes.join(' · ')}</span>
      {alergias.length > 0 && (
        <span className="inline-flex h-6 max-w-[45%] shrink-0 items-center truncate rounded-full border border-line-danger bg-danger-subtle px-2 text-xs font-semibold text-danger-text">
          {alergias.join(', ')}
        </span>
      )}
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
    </button>
  );
});

export interface CampoClienteMesaProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  nombre: string | null;
  placeholder: string;
}

/** Campo «Cliente (opcional)» del diálogo de abrir la mesa (Figma D1, `CustomerPicker Layout=field`). */
export const CampoClienteMesa = forwardRef<HTMLButtonElement, CampoClienteMesaProps>(function CampoClienteMesa(
  { nombre, placeholder, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className={cn(
        'flex h-10 w-full items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        className,
      )}
    >
      <UsersRound aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
      <span className={cn('min-w-0 flex-1 truncate', nombre ? 'text-fg' : 'text-fg-muted')}>{nombre ?? placeholder}</span>
      <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
    </button>
  );
});
