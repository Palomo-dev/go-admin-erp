'use client';

/**
 * GO Asistente — historial de conversaciones (§11.6; Figma `AsistenteHistorial`
 * 664:16540 + `AsistenteHistorialFila` 664:16539, pantalla 10 `668:38333`).
 *
 * Es una vista del propio panel: la cabecera («Conversaciones» con ← para
 * volver) la pinta `PanelHeader`; aquí van el buscador, los grupos por fecha y
 * las filas.
 *
 * Decisiones:
 * - **Los grupos (Hoy, Ayer, Esta semana, Anteriores) se calculan en la zona
 *   horaria de la organización**, no en la del navegador ni en UTC: a las
 *   20:00 en Bogotá ya es mañana en UTC (el bug del «día corrido»).
 * - **El buscador filtra en el cliente**, sobre los títulos ya cargados. Con un
 *   tope de 50 hilos no hay nada que ganar yendo al servidor por cada tecla.
 * - **"Borrar" archiva.** El botón dice «Archivar» porque eso es lo que hace el
 *   endpoint: el hilo es la traza de por qué se propuso cada acción.
 * - **Se quita de la lista al archivar sin recargar**; si el servidor falla,
 *   vuelve a aparecer con un aviso.
 * - Accesibilidad: cada grupo es una lista con su encabezado, cada hilo un
 *   botón con `aria-current` cuando es el abierto, «Archivar» aparece también
 *   con el foco (no solo con el ratón) y la carga se anuncia con `aria-live`.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Archive, Loader2, Search } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { agruparPorFecha, type GrupoFecha } from '@/lib/ai/assistant/panelUi';

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
  /** Cambiar este número fuerza a recargar: útil al terminar un turno. */
  refreshToken?: number;
  className?: string;
}

/** «9:42», «lunes» o «12 sep»: lo que ayuda a reconocer el hilo en su grupo. */
function cuando(iso: string, grupo: GrupoFecha, zona: string, locale: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  try {
    const opciones: Intl.DateTimeFormatOptions =
      grupo === 'hoy' || grupo === 'ayer'
        ? { hour: 'numeric', minute: '2-digit' }
        : grupo === 'semana'
          ? { weekday: 'long' }
          : { day: 'numeric', month: 'short' };
    return new Intl.DateTimeFormat(locale, { ...opciones, timeZone: zona }).format(fecha);
  } catch {
    return '';
  }
}

export default function ConversationHistory({ activeId, onSelect, refreshToken = 0, className }: ConversationHistoryProps) {
  const t = useTranslations('asistente.historial');
  const locale = useLocale();
  const { timezone } = useOrgTimezone();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [archivando, setArchivando] = useState<string | null>(null);

  const cargar = useCallback(
    async (signal?: AbortSignal) => {
      setCargando(true);
      setError(null);
      try {
        const res = await fetch('/api/ai-assistant/conversations?limit=50', { signal, credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { conversations?: ConversationSummary[] };
        setConversations(Array.isArray(json.conversations) ? json.conversations : []);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError(t('errorCarga'));
      } finally {
        setCargando(false);
      }
    },
    [t]
  );

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
        const res = await fetch(`/api/ai-assistant/conversations/${id}`, { method: 'DELETE', credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        setConversations(previas);
        setError(t('errorArchivar'));
      } finally {
        setArchivando(null);
      }
    },
    [conversations, t]
  );

  const grupos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtradas = q ? conversations.filter((c) => (c.title ?? t('sinTitulo')).toLowerCase().includes(q)) : conversations;
    return agruparPorFecha(filtradas, (c) => c.last_message_at ?? c.created_at, timezone);
  }, [conversations, busqueda, timezone, t]);

  const total = grupos.reduce((n, g) => n + g.elementos.length, 0);

  return (
    <section className={cn('flex h-full flex-col bg-surface', className)} aria-label={t('etiqueta')}>
      <div className="shrink-0 px-4 pb-2 pt-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" strokeWidth={1.5} aria-hidden="true" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={t('buscar')}
            aria-label={t('buscar')}
            className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-fg outline-none placeholder:text-fg-muted focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/30"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4" aria-live="polite" aria-busy={cargando}>
        {cargando && conversations.length === 0 && (
          <p className="flex items-center gap-2 py-3 text-sm text-fg-secondary">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
            {t('cargando')}
          </p>
        )}

        {error && (
          <p className="flex flex-wrap items-center gap-2 py-2 text-sm text-warning-text" role="status">
            {error}
            <button type="button" onClick={() => void cargar()} className="rounded text-link underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand">
              {t('reintentar')}
            </button>
          </p>
        )}

        {!cargando && !error && total === 0 && (
          <p className="py-3 text-sm text-fg-secondary">{conversations.length === 0 ? t('vacio') : t('sinCoincidencias')}</p>
        )}

        {grupos.map(({ grupo, elementos }) => (
          <div key={grupo} className="pt-2">
            <h3 className="px-0 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-fg-muted">{t(`grupo.${grupo}`)}</h3>
            <ul className="space-y-0.5">
              {elementos.map((c) => {
                const activa = c.id === activeId;
                const titulo = c.title ?? t('sinTitulo');
                const hora = cuando(c.last_message_at ?? c.created_at, grupo, timezone, locale);
                return (
                  <li key={c.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onSelect(c.id)}
                      aria-current={activa ? 'true' : undefined}
                      className={cn(
                        'w-full rounded-lg px-3 py-2 pr-10 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand',
                        activa ? 'bg-brand-tint' : 'hover:bg-hover'
                      )}
                    >
                      <span className={cn('block truncate text-sm', activa ? 'text-brand-deep' : 'text-fg')}>{titulo}</span>
                      <span className="block text-xs text-fg-muted">
                        {[
                          grupo === 'hoy' || grupo === 'ayer' ? `${t(`grupo.${grupo}`)}, ${hora}` : hora,
                          c.message_count > 0 ? t('mensajes', { n: c.message_count }) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void archivar(c.id)}
                      disabled={archivando === c.id}
                      aria-label={t('archivar', { titulo })}
                      title={t('archivarAyuda')}
                      className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-fg-muted opacity-0 outline-none transition-opacity hover:bg-pressed hover:text-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand group-hover:opacity-100 disabled:opacity-50"
                    >
                      {archivando === c.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
                      ) : (
                        <Archive className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {total > 0 && <p className="pt-4 text-xs text-fg-muted">{t('nota')}</p>}
      </div>
    </section>
  );
}
