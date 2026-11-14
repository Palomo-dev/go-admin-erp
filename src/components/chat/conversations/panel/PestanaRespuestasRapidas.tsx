'use client';

import * as React from 'react';
import { ChevronRight, Send, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState, SearchInput, clasesBoton } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { filtrarRespuestasRapidas } from './respuestasRapidasLogica';
import type { ConversacionControl } from '../useConversacion';

/**
 * Pestaña «Rápidas» de la vista completa: las respuestas rápidas de la
 * organización con buscador (título, contenido, atajo y etiquetas), etiquetas,
 * «Usada N veces» y «Usar», que la lleva al compositor y cuenta el uso. Es el
 * panel que tenía la conversación antes del rediseño.
 */
export function PestanaRespuestasRapidas({ c, onUsar }: { c: ConversacionControl; onUsar: (texto: string) => void }) {
  const t = useTranslations('chatBandeja.rapidas');
  const [busqueda, setBusqueda] = React.useState('');
  const [abierta, setAbierta] = React.useState<string | null>(null);
  const visibles = filtrarRespuestasRapidas(c.respuestasRapidas, busqueda);
  const bloqueada = c.estadoEscritura !== 'normal' || !!c.bloqueo;

  return (
    <div className="space-y-3 p-4">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold text-fg">
        <Zap aria-hidden="true" className="size-5 text-warning" strokeWidth={1.5} />
        {t('titulo')}
        {c.respuestasRapidas.length > 0 ? <span className="rounded-full bg-subtle px-2 text-xs font-medium leading-5 text-fg-secondary">{c.respuestasRapidas.length}</span> : null}
      </h3>
      <SearchInput value={busqueda} onChange={setBusqueda} placeholder={t('buscar')} atajo={false} />
      {visibles.length === 0 ? (
        busqueda ? (
          <EmptyState compacto variante="search" termino={busqueda} titulo={t('sinResultados')} onLimpiarFiltros={() => setBusqueda('')} />
        ) : (
          <EmptyState compacto icono={Zap} titulo={t('vacio')} descripcion={t('vacioAyuda')} />
        )
      ) : (
        <ul className="space-y-3">
          {visibles.map((r) => {
            const expandida = abierta === r.id;
            return (
              <li key={r.id} className={cn('rounded-xl border bg-surface', expandida ? 'border-line-brand' : 'border-line')}>
                <button
                  type="button"
                  onClick={() => setAbierta(expandida ? null : r.id)}
                  aria-expanded={expandida}
                  className="flex w-full items-start gap-2 rounded-xl p-3 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-medium text-fg">{r.title}</span>
                      {r.shortcut ? <span className="shrink-0 rounded border border-line px-1 text-xs leading-[18px] text-fg-secondary">/{r.shortcut}</span> : null}
                    </span>
                    <span className={cn('mt-1 block whitespace-pre-wrap text-[13px] leading-[18px] text-fg-secondary', !expandida && 'line-clamp-2')}>{r.content}</span>
                    {r.tags && r.tags.length > 0 ? (
                      <span className="mt-2 flex flex-wrap gap-1">
                        {r.tags.slice(0, 3).map((e) => (
                          <span key={e} className="rounded-full bg-subtle px-2 py-0.5 text-xs text-fg-secondary">
                            {e}
                          </span>
                        ))}
                        {r.tags.length > 3 ? <span className="self-center text-xs text-fg-muted">+{r.tags.length - 3}</span> : null}
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0 text-fg-muted transition-transform', expandida && 'rotate-90')} strokeWidth={1.5} />
                </button>
                {expandida ? (
                  <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
                    <span className="text-[13px] text-fg-muted">{t('usos', { n: r.usage_count ?? 0 })}</span>
                    <button
                      type="button"
                      disabled={bloqueada}
                      onClick={() => {
                        onUsar(r.content);
                        c.usarRespuestaRapida(r.id);
                      }}
                      className={clasesBoton({ tamano: 'sm' })}
                    >
                      <Send aria-hidden="true" className="size-3.5" />
                      {t('usar')}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
