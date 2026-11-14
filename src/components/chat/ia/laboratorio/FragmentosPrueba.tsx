'use client';

/**
 * «Fragmentos que usó» del Laboratorio (auditoría 2026-11-14, Agente 3):
 * resumen del conocimiento, buscador, Todos/Ninguno, contador, prioridad,
 * etiquetas y «Ver más». Hasta 50 fragmentos activos; la prueba usa los
 * elegidos hasta el máximo de fragmentos de los ajustes.
 *
 * Sin porcentaje de «similitud»: la lista no viene de una búsqueda semántica
 * y esa cifra era inventada.
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw, Search } from 'lucide-react';
import { Tarjeta } from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import type { RetrievedFragment } from '@/lib/services/aiLabService';

export interface ResumenConocimiento {
  total: number;
  active: number;
  inactive: number;
  avgPriority: number;
}

interface Props {
  fragmentos: RetrievedFragment[];
  elegidos: string[];
  onElegidos: (ids: string[]) => void;
  cargando: boolean;
  resumen: ResumenConocimiento | null;
  onActualizar: () => void;
}

export function FragmentosPrueba({ fragmentos, elegidos, onElegidos, cargando, resumen, onActualizar }: Props) {
  const t = useTranslations('chatModulo.ia.laboratorio');
  const locale = useLocaleIntl();
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase(locale);
    if (!q) return fragmentos;
    return fragmentos.filter((f) => f.title.toLocaleLowerCase(locale).includes(q) || f.content.toLocaleLowerCase(locale).includes(q) || f.tags.some((x) => x.toLocaleLowerCase(locale).includes(q)));
  }, [busqueda, fragmentos, locale]);

  const alternar = (id: string, si: boolean) => onElegidos(si ? [...elegidos.filter((x) => x !== id), id] : elegidos.filter((x) => x !== id));
  const todos = () => onElegidos(Array.from(new Set([...elegidos, ...visibles.map((f) => f.id)])));
  const ninguno = () => onElegidos(elegidos.filter((id) => !visibles.some((f) => f.id === id)));
  const numero = (n: number, dec = 0) => n.toLocaleString(locale, { maximumFractionDigits: dec });

  return (
    <Tarjeta
      titulo={t('fragmentosUso')}
      accion={
        <button
          type="button"
          onClick={onActualizar}
          disabled={cargando}
          aria-label={t('fragmentos.actualizar')}
          title={t('fragmentos.actualizar')}
          className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
        >
          <RefreshCw aria-hidden="true" className={`size-4 ${cargando ? 'animate-spin' : ''}`} strokeWidth={1.5} />
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        {resumen && (
          <dl aria-label={t('fragmentos.estadisticas.etiqueta')} className="grid grid-cols-4 gap-2 rounded-lg bg-subtle p-2 text-center">
            {[
              [t('fragmentos.estadisticas.total'), numero(resumen.total)],
              [t('fragmentos.estadisticas.activos'), numero(resumen.active)],
              [t('fragmentos.estadisticas.inactivos'), numero(resumen.inactive)],
              [t('fragmentos.estadisticas.prioridad'), numero(resumen.avgPriority, 1)],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="truncate text-[11px] text-fg-muted">{k}</dt>
                <dd className="text-sm font-semibold tabular-nums text-fg">{v}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
          <Input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder={t('fragmentos.buscar')} aria-label={t('fragmentos.buscar')} className="pl-9" />
        </div>

        <div className="flex items-center justify-between gap-2">
          <p aria-live="polite" className="text-xs text-fg-muted">
            {t('fragmentos.contador', { elegidos: elegidos.length, total: fragmentos.length })}
          </p>
          <div className="flex gap-1">
            <button type="button" onClick={todos} className="rounded px-2 py-1 text-xs font-medium text-brand hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              {t('fragmentos.todos')}
            </button>
            <button type="button" onClick={ninguno} className="rounded px-2 py-1 text-xs font-medium text-brand hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              {t('fragmentos.ninguno')}
            </button>
          </div>
        </div>

        {cargando ? (
          <Skeleton className="h-24" />
        ) : fragmentos.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t('sinFragmentos')}</p>
        ) : visibles.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t('fragmentos.sinResultados')}</p>
        ) : (
          <ul className="flex max-h-[640px] flex-col gap-2 overflow-y-auto pr-1">
            {visibles.map((f) => {
              const elegido = elegidos.includes(f.id);
              const expandido = abierto === f.id;
              return (
                <li key={f.id} className={`rounded-lg border p-2.5 ${elegido ? 'border-line-brand bg-brand-tint' : 'border-line'}`}>
                  <div className="flex items-start gap-2">
                    <Checkbox id={`frag-${f.id}`} checked={elegido} onCheckedChange={(v) => alternar(f.id, v === true)} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <label htmlFor={`frag-${f.id}`} className="min-w-0 cursor-pointer text-sm font-medium text-fg">
                          {f.title}
                        </label>
                        <span className="shrink-0 rounded bg-subtle px-1.5 py-0.5 text-[11px] tabular-nums text-fg-secondary">{t('fragmentos.prioridad', { n: f.priority })}</span>
                      </div>
                      <p className={`mt-1 whitespace-pre-wrap text-xs text-fg-secondary ${expandido ? '' : 'line-clamp-2'}`}>{f.content}</p>
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1">
                          {f.tags.slice(0, 3).map((x) => (
                            <span key={x} className="inline-flex items-center rounded-full bg-subtle px-2 py-0.5 text-[11px] font-medium text-fg-secondary">
                              {x}
                            </span>
                          ))}
                          {f.tags.length > 3 && <span className="text-[11px] text-fg-muted">{t('fragmentos.masEtiquetas', { n: f.tags.length - 3 })}</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => setAbierto(expandido ? null : f.id)}
                          aria-expanded={expandido}
                          className="text-[11px] font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          {expandido ? t('fragmentos.verMenos') : t('fragmentos.verMas')}
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-fg-muted">{t('fragmentos.ayuda')}</p>
      </div>
    </Tarjeta>
  );
}
