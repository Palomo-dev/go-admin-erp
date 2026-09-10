'use client';

/**
 * GO Assistant — historial de conversaciones (§11.6).
 *
 * La F1 dejó la conversación persistida y el panel sin forma de recuperarla:
 * el hilo estaba en la base y el usuario lo veía desaparecer igual. Esta es la
 * mitad de cliente que faltaba, contra
 * `GET /api/ai-assistant/conversations` y `GET .../conversations/[id]`.
 *
 * Decisiones:
 * - **El buscador filtra en el cliente**, sobre los títulos ya cargados. Con un
 *   tope de 50 hilos no hay nada que ganar yendo al servidor por cada tecla, y
 *   sí que perder: latencia y una consulta por pulsación.
 * - **"Borrar" archiva.** El botón dice "Archivar" porque eso es exactamente lo
 *   que hace el endpoint: el hilo es la traza de por qué se propuso cada
 *   acción y no se destruye. Prometer un borrado que no ocurre sería mentir.
 * - **Se quita de la lista al archivar sin recargar**: el usuario ve el efecto
 *   inmediato, y si el servidor falla vuelve a aparecer con un aviso.
 * - Accesibilidad (§11.7): la lista es un `<ul>` navegable con teclado, cada
 *   hilo un botón con `aria-current` cuando es el que está abierto, y el estado
 *   de carga se anuncia con `aria-live="polite"`.
 *
 * El panel es quien decide qué hacer con el identificador: este componente no
 * sabe nada del hilo activo más allá de resaltarlo.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, Loader2, MessageSquare, RefreshCw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';

export interface ConversationSummary {
  id: string;
  title: string | null;
  message_count: number;
  last_message_at: string | null;
  created_at: string;
}

interface ConversationHistoryProps {
  /** Hilo abierto ahora mismo, para resaltarlo. */
  activeId?: string | null;
  /** El panel decide cómo retomarlo (cargar mensajes, cerrar el historial…). */
  onSelect(conversationId: string): void;
  /** Opcional: cerrar el historial (botón en la cabecera). */
  onClose?(): void;
  /** Cambiar este número fuerza a recargar: útil al terminar un turno. */
  refreshToken?: number;
  className?: string;
}

const SIN_TITULO = 'Conversación sin título';

/** Fecha corta y en español, relativa cuando es reciente. */
function fechaCorta(iso: string | null): string {
  if (!iso) return '';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';

  const minutos = Math.floor((Date.now() - fecha.getTime()) / 60000);
  if (minutos < 1) return 'ahora';
  if (minutos < 60) return `hace ${minutos} min`;
  if (minutos < 60 * 24) return `hace ${Math.floor(minutos / 60)} h`;
  if (minutos < 60 * 24 * 7) return `hace ${Math.floor(minutos / (60 * 24))} d`;

  return fecha.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ConversationHistory({
  activeId,
  onSelect,
  onClose,
  refreshToken = 0,
  className,
}: ConversationHistoryProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [archivando, setArchivando] = useState<string | null>(null);

  const cargar = useCallback(async (signal?: AbortSignal) => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch('/api/ai-assistant/conversations?limit=50', {
        signal,
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { conversations?: ConversationSummary[] };
      setConversations(Array.isArray(json.conversations) ? json.conversations : []);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError('No se pudo cargar el historial.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    const control = new AbortController();
    void cargar(control.signal);
    return () => control.abort();
  }, [cargar, refreshToken]);

  const archivar = useCallback(
    async (id: string) => {
      setArchivando(id);
      const previas = conversations;
      // Optimista: el usuario ve el efecto ya. Si falla, se devuelve la lista.
      setConversations((c) => c.filter((x) => x.id !== id));
      try {
        const res = await fetch(`/api/ai-assistant/conversations/${id}`, {
          method: 'DELETE',
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        setConversations(previas);
        setError('No se pudo archivar la conversación.');
      } finally {
        setArchivando(null);
      }
    },
    [conversations]
  );

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => (c.title ?? SIN_TITULO).toLowerCase().includes(q));
  }, [conversations, busqueda]);

  return (
    <section
      className={cn('flex flex-col h-full bg-white dark:bg-gray-900', className)}
      aria-label="Historial de conversaciones"
    >
      <header className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex-1">Conversaciones</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-gray-500"
          onClick={() => void cargar()}
          aria-label="Recargar historial"
        >
          <RefreshCw size={14} className={cn(cargando && 'animate-spin')} aria-hidden="true" />
        </Button>
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-gray-500"
            onClick={onClose}
            aria-label="Cerrar historial"
          >
            <X size={14} aria-hidden="true" />
          </Button>
        )}
      </header>

      <div className="px-3 py-2 flex-shrink-0">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en el historial"
            aria-label="Buscar en el historial"
            className="w-full pl-8 pr-2 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2" aria-live="polite" aria-busy={cargando}>
        {cargando && conversations.length === 0 && (
          <p className="flex items-center gap-2 px-2 py-3 text-sm text-gray-500">
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            Cargando historial…
          </p>
        )}

        {error && (
          <p className="px-2 py-2 text-sm text-amber-700 dark:text-amber-400" role="status">
            {error}
          </p>
        )}

        {!cargando && !error && filtradas.length === 0 && (
          <p className="px-2 py-3 text-sm text-gray-500">
            {conversations.length === 0
              ? 'Todavía no hay conversaciones guardadas.'
              : 'Ningún hilo coincide con la búsqueda.'}
          </p>
        )}

        <ul className="space-y-0.5">
          {filtradas.map((c) => {
            const activa = c.id === activeId;
            return (
              <li key={c.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  aria-current={activa ? 'true' : undefined}
                  className={cn(
                    'w-full text-left rounded-md px-2 py-2 pr-9 transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                    activa
                      ? 'bg-blue-50 dark:bg-blue-900/30'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  )}
                >
                  <span className="flex items-start gap-2">
                    <MessageSquare
                      size={14}
                      className="mt-0.5 flex-shrink-0 text-gray-400"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-gray-900 dark:text-gray-100">
                        {c.title ?? SIN_TITULO}
                      </span>
                      <span className="block text-[11px] text-gray-500">
                        {fechaCorta(c.last_message_at ?? c.created_at)}
                        {c.message_count > 0 && ` · ${c.message_count} mensajes`}
                      </span>
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void archivar(c.id)}
                  disabled={archivando === c.id}
                  aria-label={`Archivar "${c.title ?? SIN_TITULO}"`}
                  className={cn(
                    'absolute right-1.5 top-1.5 p-1.5 rounded text-gray-400',
                    'hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700',
                    'opacity-0 group-hover:opacity-100 focus:opacity-100',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                    'disabled:opacity-50'
                  )}
                >
                  {archivando === c.id ? (
                    <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Archive size={13} aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
