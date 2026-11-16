'use client';

/**
 * Calendario de vacaciones del equipo (Figma 20.13.1, `96-hrm-f2-13-01-*`).
 *
 * Escritorio: el mes en grilla, una ficha por persona y día, festivos y días no
 * laborables sombreados, y una ficha roja «Cruce · 2 de Cocina» cuando dos o más
 * personas de la misma área salen el mismo día. Móvil: la lista por semana.
 * Pieza propia de RR. HH. armada con el kit (`ListCard`, `StatusBadge`, `Badge`).
 */
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ListCard, StatusBadge, type AccionFila } from '@/components/kit';
import { clasesBadgeTono } from '@/components/ui/badge';
import { diaDeSemana, diasDeSemana, grillaMes, primerDiaDeSemana } from '@/components/kit/calendarioLogica';
import { cn } from '@/utils/Utils';
import { addPlainDays } from '@/lib/utils/dateCore';
import { agruparPorSemana, ausentesPorDia, crucesDelDia, nombreCorto, type Festivo, type FilaAusencia } from './ausenciasLogica';
import { useFechas } from './piezasAusencias';

const MAX_FICHAS = 3;

export interface CalendarioVacacionesProps {
  mes: string;
  filas: readonly FilaAusencia[];
  festivos: readonly Festivo[];
  hoy: string;
  onAbrir: (f: FilaAusencia) => void;
  accionesDe: (f: FilaAusencia) => AccionFila[];
}

export function CalendarioVacaciones({ mes, filas, festivos, hoy, onAbrir, accionesDe }: CalendarioVacacionesProps) {
  const t = useTranslations('hrmAusencias.calendario');
  const f = useFechas();
  const primer = primerDiaDeSemana(f.locale);
  const encabezados = useMemo(() => diasDeSemana(f.locale, primer), [f.locale, primer]);
  const celdas = useMemo(() => {
    const todas = grillaMes(mes, primer);
    // Solo las semanas que tienen días del mes.
    const semanas: (typeof todas)[] = [];
    for (let i = 0; i < todas.length; i += 7) {
      const s = todas.slice(i, i + 7);
      if (s.some((c) => c.delMes)) semanas.push(s);
    }
    return semanas;
  }, [mes, primer]);
  const desde = `${mes}-01`;
  const hasta = celdas.length ? celdas[celdas.length - 1][6].dia : desde;
  const mapa = useMemo(() => ausentesPorDia(filas, desde, hasta), [filas, desde, hasta]);
  const festivoDe = useMemo(() => new Map(festivos.map((x) => [x.fecha, x])), [festivos]);
  // Día no laborable por defecto: el domingo (descanso pactado de CST 179); cada vínculo puede tener otro.
  const esDomingo = (dia: string) => diaDeSemana(dia) === 0;

  const activas = filas.filter((x) => x.estado !== 'rejected' && x.estado !== 'cancelled');
  const semanasMovil = agruparPorSemana(activas, desde);

  return (
    <>
      {/* Escritorio */}
      <div className="hidden overflow-hidden rounded-xl border border-line bg-surface lg:block">
        <div role="grid" aria-label={t('etiqueta', { mes: f.mesAnio(mes) })} className="grid grid-cols-7">
          <div role="row" className="contents">
            {encabezados.map((d) => (
              <div key={d.largo} role="columnheader" className="border-b border-line bg-subtle px-3 py-3 text-xs font-medium capitalize text-fg-secondary">
                {d.largo}
              </div>
            ))}
          </div>
          {celdas.map((semana) => (
            <div role="row" key={semana[0].dia} className="contents">
              {semana.map((c) => {
                const festivo = festivoDe.get(c.dia);
                const ausentes = c.delMes ? mapa.get(c.dia) ?? [] : [];
                const cruces = crucesDelDia(ausentes);
                const sombra = !c.delMes || festivo || esDomingo(c.dia);
                return (
                  <div
                    key={c.dia}
                    role="gridcell"
                    aria-label={[f.diaLargo(c.dia), festivo ? t('festivo') : null, ausentes.length ? t('salen', { n: ausentes.length }) : null].filter(Boolean).join(' · ')}
                    className={cn('flex min-h-28 flex-col gap-1 border-b border-r border-line p-2 [&:nth-child(7n)]:border-r-0', sombra ? 'bg-subtle' : 'bg-surface')}
                  >
                    <p className={cn('flex items-center gap-2 text-xs', !c.delMes ? 'text-fg-muted' : festivo ? 'text-danger-text' : 'text-fg', c.dia === hoy && 'font-semibold')}>
                      <span className="tabular-nums">{c.numero}</span>
                      {festivo && c.delMes ? <span className="truncate text-fg-muted">{t('festivo')}</span> : null}
                    </p>
                    {ausentes.slice(0, MAX_FICHAS).map((x) => (
                      <button
                        key={x.id}
                        type="button"
                        onClick={() => onAbrir(x)}
                        title={x.nombre ?? undefined}
                        aria-label={t('fichaPersona', { nombre: x.nombre ?? '—', estado: x.estado === 'requested' ? t('porAprobar') : t('aprobada') })}
                        className={cn(
                          clasesBadgeTono('informacion', 'contorno', 'sm'),
                          'max-w-full justify-start truncate hover:bg-info-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                          x.estado === 'requested' && 'border-dashed'
                        )}
                      >
                        <span className="truncate">{nombreCorto(x.nombre)}</span>
                      </button>
                    ))}
                    {ausentes.length > MAX_FICHAS ? <span className="text-xs text-fg-secondary">{t('mas', { n: ausentes.length - MAX_FICHAS })}</span> : null}
                    {cruces.map((cr) => (
                      <span key={cr.area_id} className={cn(clasesBadgeTono('peligro', 'contorno', 'sm'), 'max-w-full truncate')}>
                        {t('cruce', { n: cr.ausentes, area: cr.area ?? '—' })}
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Móvil: lista por semana */}
      <div className="flex flex-col gap-4 lg:hidden">
        {semanasMovil.map((g) => (
          <section key={g.lunes} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-fg">{t('semana', { rango: f.rangoCorto(g.lunes, addPlainDays(g.lunes, 6)) })}</h2>
            {g.filas.map((x) => {
              const conCruce = (x.cruces ?? []).length > 0;
              return (
                <ListCard
                  key={x.id}
                  avatar={{ nombre: x.nombre ?? '?' }}
                  titulo={x.nombre ?? '—'}
                  subtitulo={
                    x.estado === 'requested'
                      ? t('movilPorAprobar', { rango: f.rangoCorto(x.desde, x.hasta) })
                      : x.desde <= hoy
                        ? t('movilHasta', { hasta: f.diaSemana(x.hasta), regresa: f.diaSemana(x.regresa) })
                        : t('movilRango', { rango: f.rangoCorto(x.desde, x.hasta), regresa: f.diaSemana(x.regresa) })
                  }
                  meta={x.area ?? undefined}
                  estado={<StatusBadge estado={conCruce ? 'cruce' : 'vacaciones'} tono={conCruce ? 'peligro' : 'informacion'} etiqueta={conCruce ? t('cruceCorto') : t('vacaciones')} />}
                  onClick={() => onAbrir(x)}
                  acciones={accionesDe(x)}
                />
              );
            })}
          </section>
        ))}
      </div>
    </>
  );
}
