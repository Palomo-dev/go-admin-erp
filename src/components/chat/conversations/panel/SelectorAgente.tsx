'use client';

import * as React from 'react';
import { Check, ChevronDown, UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AvatarIniciales } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { agenteAsignado, filtrarAgentes, type AgenteChat } from '@/lib/services/chat/agentesChat';

export interface SelectorAgenteProps {
  agentes: readonly AgenteChat[];
  /** `conversations.assigned_member_id`. */
  asignado: number | null | undefined;
  onAsignar: (memberId: number | null) => Promise<unknown> | void;
  /** `cabecera`: botón compacto (hilo); `campo`: ancho completo (pestaña Acciones). */
  variante?: 'cabecera' | 'campo';
  deshabilitado?: boolean;
  className?: string;
}

/**
 * «Asignado a» (Figma 91-chat-02): nombre y avatar de la persona, buscador,
 * conversaciones abiertas de cada una y «Quitar asignación». La lista viene
 * del servidor: solo personas con acceso al Chat.
 */
export function SelectorAgente({ agentes, asignado, onAsignar, variante = 'campo', deshabilitado, className }: SelectorAgenteProps) {
  const t = useTranslations('chatBandeja.asignacion');
  const [abierto, setAbierto] = React.useState(false);
  const [busqueda, setBusqueda] = React.useState('');
  const actual = agenteAsignado(agentes, asignado);
  const lista = filtrarAgentes(agentes, busqueda);
  // Asignado a alguien que ya no tiene acceso al Chat (o aún cargando la lista).
  const nombreActual = actual ? (actual.esYo ? t('tu', { nombre: actual.nombre }) : actual.nombre) : asignado != null ? t('otraPersona') : t('sinAsignar');

  const elegir = async (memberId: number | null) => {
    setAbierto(false);
    setBusqueda('');
    await onAsignar(memberId);
  };

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={deshabilitado}
          aria-label={t('cambiar', { nombre: nombreActual })}
          className={cn(
            'flex min-w-0 items-center gap-2 rounded-lg border border-line bg-surface text-left text-sm text-fg hover:bg-hover disabled:opacity-60',
            variante === 'cabecera' ? 'h-10 max-w-[200px] px-2' : 'h-11 w-full px-3',
            className,
          )}
        >
          {actual ? (
            <AvatarIniciales nombre={actual.nombre} src={actual.avatarUrl} tamano="sm" className="size-7" />
          ) : (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-subtle text-fg-muted">
              <UserX aria-hidden="true" className="size-3.5" />
            </span>
          )}
          <span className={cn('min-w-0 flex-1 truncate font-medium', !actual && 'text-fg-secondary')}>{nombreActual}</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-b border-line p-2">
          <label className="sr-only" htmlFor="buscar-agente">
            {t('buscar')}
          </label>
          <input
            id="buscar-agente"
            autoFocus
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={t('buscar')}
            className="h-9 w-full rounded-md border border-line bg-surface px-3 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
        </div>
        <ul role="listbox" aria-label={t('titulo')} className="max-h-72 overflow-y-auto py-1">
          {lista.length === 0 ? (
            <li className="px-3 py-3 text-sm text-fg-muted">{t('sinResultados')}</li>
          ) : (
            lista.map((a) => {
              const sel = actual?.memberId === a.memberId;
              return (
                <li key={a.memberId} role="option" aria-selected={sel}>
                  <button
                    type="button"
                    onClick={() => void elegir(a.memberId)}
                    className={cn('flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-hover', sel && 'bg-brand-tint')}
                  >
                    <AvatarIniciales nombre={a.nombre} src={a.avatarUrl} tamano="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{a.esYo ? t('tu', { nombre: a.nombre }) : a.nombre}</span>
                      <span className="block truncate text-xs text-fg-secondary">
                        {a.cargo ? t('cargoAbiertas', { cargo: a.cargo, n: a.abiertas }) : t('abiertas', { n: a.abiertas })}
                      </span>
                    </span>
                    {sel ? <Check aria-hidden="true" className="size-4 shrink-0 text-brand" /> : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        {asignado != null ? (
          <div className="border-t border-line p-1">
            <button type="button" onClick={() => void elegir(null)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-fg-secondary hover:bg-hover">
              {t('quitar')}
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
