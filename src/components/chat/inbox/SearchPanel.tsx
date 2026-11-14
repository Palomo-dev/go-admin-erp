'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronUp, Loader2, Search, X } from 'lucide-react';
import { EmptyState, clasesBoton } from '@/components/kit';
import { Kbd } from '@/components/kit/Kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';
import type { Conversation } from '@/lib/services/conversationsService';
import { escaparLike, indiceCiclico, tramosResaltados } from '@/components/chat/conversations/id/comunLogica';
import { useMomentoCorto } from '@/components/chat/conversations/id/useMomentoCorto';

interface SearchResult {
  id: string;
  content: string;
  created_at: string;
  direction: 'inbound' | 'outbound';
  role: 'customer' | 'agent' | 'ai' | 'system';
}

interface SearchPanelProps {
  conversation: Conversation | null;
  /** Ir al mensaje (la Bandeja cierra la hoja y lo centra en el hilo). */
  onScrollToMessage?: (messageId: string) => void;
}

const MINIMO = 2;
const ROLES = ['customer', 'agent', 'ai', 'system'] as const;
const TONO_ROL: Record<string, string> = {
  agent: 'bg-brand-tint text-brand',
  ai: 'bg-info-subtle text-info-text',
  customer: 'bg-subtle text-fg-secondary',
  system: 'bg-subtle text-fg-secondary',
};

/**
 * Buscador del hilo («Buscar en la conversación» del menú «Más acciones»).
 * ↑/↓ mueven la selección sin salir; Enter o clic van al mensaje. El texto
 * del mensaje lo escribe el cliente: se resalta con React, nunca con HTML.
 */
export default function SearchPanel({ conversation, onScrollToMessage }: SearchPanelProps) {
  const t = useTranslations('chatHilo.buscar');
  const momento = useMomentoCorto();
  const idLista = useId();
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const consulta = useRef(0);

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(id);
  }, []);

  const conversationId = conversation?.id;
  const searchMessages = useCallback(
    async (query: string) => {
      if (!conversationId) return;
      const n = ++consulta.current;
      try {
        setLoading(true);
        setError(false);
        const { data, error: fallo } = await supabase
          .from('messages')
          .select('id, content, created_at, direction, role')
          .eq('conversation_id', conversationId)
          .ilike('content', `%${escaparLike(query)}%`)
          // En el orden del hilo (Figma 94-chat-recuperado-06): 1/3 es el más antiguo.
          .order('created_at', { ascending: true })
          .limit(100);
        if (fallo) throw fallo;
        // Solo cuenta la última búsqueda: una respuesta lenta no pisa a la nueva.
        if (n !== consulta.current) return;
        setResults((data ?? []) as SearchResult[]);
        setCurrentIndex(0);
      } catch (e) {
        if (n !== consulta.current) return;
        console.error('Error buscando mensajes:', e);
        setResults([]);
        setError(true);
      } finally {
        if (n === consulta.current) setLoading(false);
      }
    },
    [conversationId],
  );

  useEffect(() => {
    const q = searchTerm.trim();
    if (q.length < MINIMO) {
      consulta.current += 1;
      setResults([]);
      setLoading(false);
      setError(false);
      return;
    }
    const id = setTimeout(() => void searchMessages(q), 300);
    return () => clearTimeout(id);
  }, [searchTerm, searchMessages]);

  // La opción activa siempre a la vista.
  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>(`[data-indice="${currentIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [currentIndex]);

  const mover = (paso: 1 | -1) => setCurrentIndex((i) => indiceCiclico(i, results.length, paso));
  const ir = (indice: number) => {
    const r = results[indice];
    if (!r) return;
    setCurrentIndex(indice);
    onScrollToMessage?.(r.id);
  };

  const alTeclear = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      mover(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      mover(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      ir(currentIndex);
    }
  };

  const termino = searchTerm.trim();
  const rol = (r: string) => ((ROLES as readonly string[]).includes(r) ? t(`roles.${r}`) : r);
  const idOpcion = (i: number) => `${idLista}-opcion-${i}`;

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="space-y-3 border-b border-line p-4">
        <p className="text-base font-semibold text-fg">{t('titulo')}</p>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" strokeWidth={1.5} />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={idLista}
            aria-activedescendant={results.length > 0 ? idOpcion(currentIndex) : undefined}
            aria-autocomplete="list"
            aria-label={t('etiqueta')}
            placeholder={t('placeholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={alTeclear}
            className="h-10 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-24 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-search-cancel-button]:hidden"
          />
          {searchTerm ? (
            <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {loading ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin text-fg-muted" />
              ) : results.length > 0 ? (
                <span className="text-xs tabular-nums text-fg-muted">{t('posicion', { actual: currentIndex + 1, total: results.length })}</span>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  inputRef.current?.focus();
                }}
                aria-label={t('limpiar')}
                className="flex size-7 items-center justify-center rounded-md text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </button>
            </div>
          ) : null}
        </div>

        {results.length > 0 ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-fg-secondary">{t('resultados', { n: results.length })}</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => mover(-1)} aria-label={t('anterior')} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                <ChevronUp aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </button>
              <button type="button" onClick={() => mover(1)} aria-label={t('siguiente')} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                <ChevronDown aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        ) : null}
        <p className="sr-only" role="status" aria-live="polite">
          {!loading && termino.length >= MINIMO ? t('resultados', { n: results.length }) : ''}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {termino.length < MINIMO ? (
          <EmptyState compacto icono={Search} titulo={t('etiqueta')} descripcion={t('minimo', { n: MINIMO })} />
        ) : loading && results.length === 0 ? (
          <div className="space-y-2 p-1" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2 rounded-lg p-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : error ? (
          <EmptyState compacto variante="error" titulo={t('error')} onReintentar={() => void searchMessages(termino)} />
        ) : results.length === 0 ? (
          <EmptyState compacto variante="search" titulo={t('sinResultados', { termino })} />
        ) : (
          <ul ref={listaRef} id={idLista} role="listbox" aria-label={t('lista')} className="space-y-1">
            {results.map((r, i) => {
              const activo = i === currentIndex;
              const cuando = momento(r.created_at);
              return (
                <li
                  key={r.id}
                  id={idOpcion(i)}
                  role="option"
                  aria-selected={activo}
                  data-indice={i}
                  onClick={() => ir(i)}
                  className={cn(
                    'cursor-pointer rounded-lg border p-3 transition-colors',
                    activo ? 'border-line-brand bg-brand-tint' : 'border-transparent hover:bg-hover',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', TONO_ROL[r.role] ?? TONO_ROL.system)}>{rol(r.role)}</span>
                    <time dateTime={r.created_at} title={cuando.largo} className="text-xs tabular-nums text-fg-muted">
                      {cuando.corto}
                    </time>
                  </div>
                  <p className="line-clamp-2 text-[13px] leading-5 text-fg-secondary">
                    {tramosResaltados(r.content ?? '', termino).map((tr, k) =>
                      tr.marcado ? (
                        <mark key={k} className="rounded bg-warning-subtle px-0.5 text-fg">
                          {tr.texto}
                        </mark>
                      ) : (
                        <React.Fragment key={k}>{tr.texto}</React.Fragment>
                      ),
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-line p-3">
        <div className="flex items-center justify-center gap-4 text-xs text-fg-muted">
          <span className="flex items-center gap-1">
            <Kbd tecla="↑" />
            <Kbd tecla="↓" />
            {t('navegar')}
          </span>
          <span className="flex items-center gap-1">
            <Kbd tecla="Enter" />
            {t('ir')}
          </span>
        </div>
      </div>
    </div>
  );
}
