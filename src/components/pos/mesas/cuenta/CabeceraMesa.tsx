'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Clock } from 'lucide-react';
import { AvatarIniciales, KbdButton } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { textoDuracion } from './cuentaMesaLogica';

/**
 * Cabecera de la mesa en tableta (Figma T2–T7 y S1–S8): volver al plano, mesa
 * y zona, estado, `TiempoTranscurrido` (rojo pasado el umbral, S7), mesero y
 * comensales, «Pre-cuenta» y el menú ⋯ de la mesa.
 *
 * En celular (< lg, Figma M2b) la «←», el título y el chip de estado suben al
 * `MobileHeader` del shell (`CabeceraMovilMesa`): aquí se ocultan, y el resto
 * —tiempo, mesero y comensales, «Pre-cuenta» y «⋯»— queda justo debajo, igual
 * que hoy. El título sigue como `<h1>` para lectores de pantalla.
 */
export interface CabeceraMesaProps {
  mesa: string;
  zona: string | null;
  /** Estado de la cuenta: «Ocupada», «Por cobrar»… */
  estado: string;
  tonoEstado?: 'marca' | 'advertencia' | 'neutro';
  minutos: number | null;
  critico?: boolean;
  mesero: string | null;
  comensales: number;
  onVolver: () => void;
  onPrecuenta?: () => void;
  menu?: ReactNode;
  className?: string;
}

export function CabeceraMesa({
  mesa,
  zona,
  estado,
  tonoEstado = 'marca',
  minutos,
  critico,
  mesero,
  comensales,
  onVolver,
  onPrecuenta,
  menu,
  className,
}: CabeceraMesaProps) {
  const t = useTranslations('posMesasFlujo.cabecera');
  return (
    <header className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-4 py-2 lg:min-h-16 lg:py-3', className)}>
      {/* Celular: «←», título y estado van en el MobileHeader (una sola barra). */}
      <button
        type="button"
        onClick={onVolver}
        aria-label={t('volver')}
        title={t('volver')}
        className="hidden size-9 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:inline-flex"
      >
        <ArrowLeft aria-hidden="true" className="size-5" strokeWidth={1.5} />
      </button>
      <h1 className="sr-only text-xl font-semibold text-fg lg:not-sr-only">{zona ? t('mesaZona', { mesa, zona }) : mesa}</h1>
      <span
        className={cn(
          'hidden h-6 items-center gap-1.5 rounded-full border px-2 text-xs font-semibold lg:inline-flex',
          tonoEstado === 'advertencia'
            ? 'border-line-warning bg-warning-subtle text-warning-text'
            : tonoEstado === 'neutro'
              ? 'border-line bg-subtle text-fg-secondary'
              : 'border-line-brand bg-brand-tint text-brand-deep',
        )}
      >
        <span
          aria-hidden="true"
          className={cn('size-1.5 rounded-full', tonoEstado === 'advertencia' ? 'bg-warning' : tonoEstado === 'neutro' ? 'bg-fg-muted' : 'bg-brand')}
        />
        {estado}
      </span>
      {minutos != null && (
        <span
          className={cn(
            'inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium tabular-nums',
            critico ? 'bg-danger-subtle text-danger-text' : 'bg-subtle text-fg-secondary',
          )}
          title={t('abierta')}
        >
          <Clock aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
          {textoDuracion(minutos)}
        </span>
      )}
      {mesero && <AvatarIniciales nombre={mesero} tamano="sm" className="lg:ml-1" />}
      <span className="text-sm text-fg-secondary">
        {mesero ? t('meseroComensales', { mesero, n: comensales }) : t('comensales', { n: comensales })}
      </span>
      {/* En tableta empuja las acciones a la derecha; en celular van seguidas (M2b). */}
      <span className="hidden flex-1 lg:block" />
      {/* «Pre-cuenta» y «⋯» saltan de línea juntos. */}
      <span className="flex items-center gap-3">
        {onPrecuenta && (
          <KbdButton variante="secundario" tamano="md" onClick={onPrecuenta}>
            {t('precuenta')}
          </KbdButton>
        )}
        {menu}
      </span>
    </header>
  );
}
