'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Clock, FileText, History, Maximize2, MoreHorizontal, RotateCcw, Search, User, UserCheck, UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DialogoBloquearContacto } from './DialogoBloquearContacto';
import type { ConversacionControl } from './useConversacion';

export interface MenuMasAccionesProps {
  c: ConversacionControl;
  /** En la Bandeja: «Abrir vista completa» y «Buscar en la conversación». */
  enBandeja?: boolean;
  onBuscar?: () => void;
}

/**
 * Menú «⋯ Más acciones» de la conversación (Figma 91-chat-09). «Bloquear
 * contacto» pide confirmación (Figma 93-chat-pendientes-01); ya bloqueado, el
 * mismo lugar ofrece «Desbloquear contacto» sin confirmar (no es destructivo).
 */
export function MenuMasAcciones({ c, enBandeja = false, onBuscar }: MenuMasAccionesProps) {
  const t = useTranslations('chatBandeja.mas');
  const tb = useTranslations('chatBandejaPendientes.bloqueo');
  const router = useRouter();
  const [confirmar, setConfirmar] = React.useState(false);
  const d = c.detalle;
  if (!d) return null;
  const base = `/app/chat/conversaciones/${d.id}`;
  const cerrada = d.status === 'closed' || (d.status as string) === 'archived';

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t('titulo')} title={t('titulo')} className="flex size-10 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover">
          <MoreHorizontal aria-hidden="true" className="size-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {enBandeja ? (
          <DropdownMenuItem onSelect={() => router.push(base)}>
            <Maximize2 aria-hidden="true" className="mr-2 size-4" />
            {t('vistaCompleta')}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => router.push(`/app/clientes/${d.customer_id}`)}>
          <User aria-hidden="true" className="mr-2 size-4" />
          {t('fichaCliente')}
        </DropdownMenuItem>
        {onBuscar ? (
          <DropdownMenuItem onSelect={onBuscar}>
            <Search aria-hidden="true" className="mr-2 size-4" />
            {t('buscar')}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => router.push(`${base}/actividad`)}>
          <History aria-hidden="true" className="mr-2 size-4" />
          {t('actividad')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push(`${base}/archivos`)}>
          <FileText aria-hidden="true" className="mr-2 size-4" />
          {t('archivos')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {d.status === 'open' ? (
          <DropdownMenuItem onSelect={() => void c.cambiarEstado('pending')}>
            <Clock aria-hidden="true" className="mr-2 size-4" />
            {t('pendiente')}
          </DropdownMenuItem>
        ) : null}
        {cerrada ? (
          <DropdownMenuItem onSelect={() => void c.cambiarEstado('open')}>
            <RotateCcw aria-hidden="true" className="mr-2 size-4" />
            {t('reabrir')}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => void c.cambiarEstado('closed')}>
            <Check aria-hidden="true" className="mr-2 size-4" />
            {t('cerrar')}
          </DropdownMenuItem>
        )}
        {c.bloqueo ? (
          <DropdownMenuItem onSelect={() => void c.desbloquearContacto()}>
            <UserCheck aria-hidden="true" className="mr-2 size-4" />
            {tb('menuDesbloquear')}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => setConfirmar(true)} className="text-danger-text focus:text-danger-text">
            <UserX aria-hidden="true" className="mr-2 size-4" />
            {tb('menuBloquear')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
    <DialogoBloquearContacto c={c} abierto={confirmar} onAbiertoChange={setConfirmar} />
    </>
  );
}
