'use client';

import { useTranslations } from 'next-intl';
import {
  ArrowLeftRight,
  Columns3,
  FileText,
  HandCoins,
  History,
  LogOut,
  MoreHorizontal,
  ReceiptText,
  UserRoundCog,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/kit';
import { cn } from '@/utils/Utils';

/**
 * Menú ⋯ de la mesa (Figma T5, `MenuItem` 10:239): todo lo de la mesa en un
 * solo lugar, con icono y atajo; «Liberar mesa» al final y en rojo.
 */
export interface MenuMesaProps {
  comensales: number;
  onPrecuenta: () => void;
  onPedirCuenta: () => void;
  onDividir: () => void;
  onMover: () => void;
  onCambiarMesero: () => void;
  onComensales: () => void;
  onNota: () => void;
  onHistorial: () => void;
  onLiberar: () => void;
  /** `md` 40 px con borde (cabecera de la tableta) · `sm` 32 px (cabecera de la cuenta). */
  tamano?: 'sm' | 'md';
  deshabilitado?: boolean;
  /** Abierto controlado (para el arnés y las pruebas). */
  abierto?: boolean;
  onAbiertoChange?: (abierto: boolean) => void;
}

export function MenuMesa({
  comensales,
  onPrecuenta,
  onPedirCuenta,
  onDividir,
  onMover,
  onCambiarMesero,
  onComensales,
  onNota,
  onHistorial,
  onLiberar,
  tamano = 'sm',
  deshabilitado,
  abierto,
  onAbiertoChange,
}: MenuMesaProps) {
  const t = useTranslations('posMesasFlujo.menu');
  const item = (icono: LucideIcon, etiqueta: string, onSelect: () => void, atajo?: string, peligro?: boolean) => {
    const Icono = icono;
    return (
      <DropdownMenuItem
        onSelect={onSelect}
        className={cn('flex h-9 cursor-pointer items-center gap-3 rounded-md px-3 text-sm', peligro ? 'text-danger-text focus:bg-danger-subtle focus:text-danger-text' : 'text-fg')}
      >
        <Icono aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
        <span className="flex-1">{etiqueta}</span>
        {atajo && <Kbd tecla={atajo} className="ml-4" />}
      </DropdownMenuItem>
    );
  };
  return (
    <DropdownMenu open={abierto} onOpenChange={onAbiertoChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={deshabilitado}
          aria-label={t('etiqueta')}
          title={t('etiqueta')}
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-lg text-fg-secondary transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50',
            tamano === 'md' ? 'size-10 border border-line-strong bg-surface' : 'size-8',
          )}
        >
          <MoreHorizontal aria-hidden="true" className="size-5" strokeWidth={1.5} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-72 rounded-xl border-line bg-surface p-1.5 shadow-lg">
        {item(ReceiptText, t('precuenta'), onPrecuenta, 'P')}
        {item(HandCoins, t('pedirCuenta'), onPedirCuenta)}
        {item(Columns3, t('dividir'), onDividir)}
        {item(ArrowLeftRight, t('mover'), onMover)}
        {item(UserRoundCog, t('cambiarMesero'), onCambiarMesero)}
        {item(UsersRound, t('comensales', { n: comensales }), onComensales)}
        {item(FileText, t('nota'), onNota)}
        {item(History, t('historial'), onHistorial)}
        {item(LogOut, t('liberar'), onLiberar, undefined, true)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
