'use client';

import * as React from 'react';
import { MoreHorizontal, Pin, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AvatarIniciales, ConfirmDialog, EmptyState, clasesBoton } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { agenteAsignado } from '@/lib/services/chat/agentesChat';
import { cn } from '@/utils/Utils';
import type { ConversacionControl } from '../useConversacion';

/**
 * Pestaña «Notas» (Figma 91-chat-04): notas internas, fijar, eliminar y
 * «+ Nota». Escribir una nota también se puede desde el compositor («Nota
 * interna»); los dos caminos usan `c.agregarNota`.
 */
export function PestanaNotas({ c }: { c: ConversacionControl }) {
  const t = useTranslations('chatBandeja.notas');
  const { formatDateTime } = useFormatDate();
  const [escribiendo, setEscribiendo] = React.useState(false);
  const [texto, setTexto] = React.useState('');
  const [guardando, setGuardando] = React.useState(false);
  const [borrar, setBorrar] = React.useState<string | null>(null);

  const guardar = async () => {
    if (!texto.trim()) return;
    setGuardando(true);
    try {
      await c.agregarNota(texto.trim());
      setTexto('');
      setEscribiendo(false);
    } catch {
      /* aviso en el hook */
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">{t('titulo')}</h3>
        <button type="button" onClick={() => setEscribiendo(true)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
          <Plus aria-hidden="true" className="size-4" />
          {t('nueva')}
        </button>
      </div>
      <p className="text-xs text-fg-muted">{t('ayuda')}</p>

      {escribiendo ? (
        <div className="space-y-2 rounded-xl border border-dashed border-line-warning bg-warning-subtle p-3">
          <label className="sr-only" htmlFor="nota-nueva">
            {t('placeholder')}
          </label>
          <textarea
            id="nota-nueva"
            autoFocus
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={t('placeholder')}
            className="w-full resize-none rounded-md bg-transparent text-sm text-fg placeholder:text-fg-muted focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEscribiendo(false)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
              {t('cancelar')}
            </button>
            <button type="button" onClick={() => void guardar()} disabled={!texto.trim() || guardando} className={clasesBoton({ tamano: 'sm' })}>
              {t('guardar')}
            </button>
          </div>
        </div>
      ) : null}

      {c.notas.length === 0 && !escribiendo ? (
        <EmptyState compacto titulo={t('vacioTitulo')} descripcion={t('vacioDescripcion')} />
      ) : (
        <ul className="space-y-3">
          {c.notas.map((n) => {
            const autor = agenteAsignado(c.agentes, n.member_id)?.nombre ?? t('alguien');
            return (
              <li key={n.id} className={cn('rounded-xl border bg-warning-subtle p-3', n.is_pinned ? 'border-line-warning' : 'border-dashed border-line-warning')}>
                <div className="mb-1.5 flex items-center gap-2">
                  <AvatarIniciales nombre={autor} tamano="sm" className="size-7" />
                  <p className="min-w-0 flex-1 truncate text-xs text-fg-secondary">
                    {autor} · {formatDateTime(n.created_at)}
                  </p>
                  {n.is_pinned ? <Pin aria-label={t('fijada')} className="size-3.5 shrink-0 text-fg-secondary" /> : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" aria-label={t('opciones')} className="flex size-7 items-center justify-center rounded-md text-fg-secondary hover:bg-hover">
                        <MoreHorizontal aria-hidden="true" className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => void c.fijarNota(n.id, !n.is_pinned)}>{n.is_pinned ? t('desfijar') : t('fijar')}</DropdownMenuItem>
                      <DropdownMenuItem className="text-danger-text" onSelect={() => setBorrar(n.id)}>
                        {t('eliminar')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-fg">{n.note}</p>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        abierto={borrar !== null}
        onAbiertoChange={(a) => !a && setBorrar(null)}
        titulo={t('eliminarTitulo')}
        descripcion={t('eliminarDescripcion')}
        textoConfirmar={t('eliminar')}
        tono="peligro"
        onConfirmar={async () => {
          if (borrar) await c.eliminarNota(borrar);
          setBorrar(null);
        }}
      />
    </div>
  );
}
