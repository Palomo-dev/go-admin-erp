'use client';

import { useId, useState } from 'react';
import { Minus, TrendingDown, TrendingUp, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { trendDelta, type HealthBand } from '@/lib/services/crm/healthBands';
import { BAND_STYLES } from './healthBandStyles';

/**
 * HealthTrend (F11 §4.2): sparkline de `health_score_snapshots` (bitácora,
 * `created_at`) con su delta en texto y una tabla accesible alternativa
 * (botón «Ver tabla»). Las fechas pasan por la zona de la organización.
 */
export interface HealthTrendPoint {
  id?: string;
  score: number;
  band: HealthBand;
  created_at: string;
}

export interface HealthTrendProps {
  snapshots: HealthTrendPoint[];
  /** Banda actual: color de la línea. */
  band: HealthBand;
  className?: string;
}

const W = 100;
const H = 32;

export function HealthTrend({ snapshots, band, className = '' }: HealthTrendProps) {
  const { timezone } = useOrgTimezone();
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();
  const ordered = [...snapshots].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const delta = trendDelta(ordered);
  const style = BAND_STYLES[band];
  const fmt = (v: string) => formatDateTimeInTz(v, timezone, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  if (ordered.length < 2) {
    return (
      <p className={`text-xs text-gray-600 dark:text-gray-400 ${className}`}>
        Aún no hay tendencia: se necesitan al menos dos mediciones. La tarea diaria de salud las irá registrando.
      </p>
    );
  }

  const points = ordered.map((p, i) => `${(i / (ordered.length - 1)) * W},${H - (Math.max(0, Math.min(100, p.score)) / 100) * H}`);
  const last = ordered[ordered.length - 1];
  const first = ordered[0];
  const summary = `Tendencia de salud: de ${first.score} el ${fmt(first.created_at)} a ${last.score} el ${fmt(last.created_at)}, ${ordered.length} mediciones`;
  const DeltaIcon = delta === null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const deltaText = delta === null || delta === 0 ? 'estable' : `${delta > 0 ? '+' : ''}${delta} puntos`;
  const deltaClass = delta === null || delta === 0 ? 'text-gray-600 dark:text-gray-400' : delta > 0 ? BAND_STYLES.green.text : BAND_STYLES.red.text;

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs text-gray-600 dark:text-gray-400">Tendencia ({ordered.length} mediciones)</span>
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${deltaClass}`}>
          <DeltaIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {deltaText}
        </span>
      </div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={summary} className="overflow-visible">
        <polyline points={points.join(' ')} fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" className={style.ring} />
        <circle cx={W} cy={H - (Math.max(0, Math.min(100, last.score)) / 100) * H} r="2.5" className={`${style.ring} fill-current ${style.text}`} />
      </svg>
      <div className="mt-2">
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" aria-expanded={showTable} aria-controls={tableId} onClick={() => setShowTable((v) => !v)}>
          <Table2 className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
          {showTable ? 'Ocultar tabla' : 'Ver tabla'}
        </Button>
        {showTable && (
          <div id={tableId} className="mt-1 max-h-48 overflow-y-auto overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
            <table className="w-full text-xs">
              <caption className="sr-only">Mediciones de salud del cliente</caption>
              <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300">
                <tr>
                  <th scope="col" className="text-left px-2 py-1 font-medium">Fecha</th>
                  <th scope="col" className="text-right px-2 py-1 font-medium">Score</th>
                  <th scope="col" className="text-left px-2 py-1 font-medium">Banda</th>
                </tr>
              </thead>
              <tbody>
                {[...ordered].reverse().map((p, i) => {
                  const st = BAND_STYLES[p.band] ?? BAND_STYLES.red;
                  return (
                    <tr key={p.id ?? `${p.created_at}-${i}`} className="border-t border-gray-100 dark:border-gray-700/60">
                      <td className="px-2 py-1 text-gray-700 dark:text-gray-300">{fmt(p.created_at)}</td>
                      <td className={`px-2 py-1 text-right font-semibold tabular-nums ${st.text}`}>{p.score}</td>
                      <td className={`px-2 py-1 ${st.text}`}>{st.label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default HealthTrend;
