'use client';

/**
 * Ranking del equipo del mes (F13). Solo se pinta si el servidor envió
 * `leaderboard` (rol admin/manager resuelto en la sesión): con `null` el widget
 * no renderiza nada. Filas con entrada escalonada; el «yo» se marca con texto.
 */

import { Trophy } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Skeleton } from '@/components/ui/skeleton';
import type { LeaderboardEntry } from '@/lib/services/crm/sellerDashboardModel';
import { WidgetCard } from './WidgetCard';
import { leaderboardWidgetModel } from './widgetModels';

interface Props {
  leaderboard: LeaderboardEntry[] | null | undefined;
  currency: string;
  loading: boolean;
  error?: string | null;
  index?: number;
}

export function SellerLeaderboardWidget({ leaderboard, currency, loading, error, index = 2 }: Props) {
  const reduced = useReducedMotion();
  // Mientras carga no se sabe si el rol puede verlo: no se pinta (evita un salto de layout).
  // Con error sí se pinta, igual que los otros tres widgets: si no, tras una carga
  // previa exitosa el ranking se quedaría con cifras viejas sin avisar del fallo.
  if (!error && (leaderboard === null || leaderboard === undefined)) return null;
  const m = loading || error ? null : leaderboardWidgetModel(leaderboard ?? null, currency);
  if (m && m.kind === 'hidden') return null;

  return (
    <WidgetCard title="Ranking del equipo" icon={Trophy} index={index} error={error}>
      {!m ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : m.kind === 'empty' ? (
        <p className="text-sm text-gray-700 dark:text-gray-300">{m.message}</p>
      ) : (
        <ol className="space-y-1.5" aria-label="Ranking por ventas ganadas este mes">
          {m.top.map((r, i) => (
            <motion.li
              key={r.user_id}
              initial={reduced ? false : { opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: reduced ? 0 : 0.2, delay: reduced ? 0 : 0.05 * i }}
              className={`flex items-center gap-3 rounded-md px-2 py-1.5 text-sm ${r.is_me ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
            >
              <span className="w-5 text-right font-semibold tabular-nums text-gray-600 dark:text-gray-400">{r.rank}</span>
              <span className="flex-1 truncate text-gray-900 dark:text-white">
                {r.name}
                {r.is_me && <span className="ml-1 text-xs text-blue-700 dark:text-blue-300">(tú)</span>}
              </span>
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {r.deals} negocio{r.deals === 1 ? '' : 's'}
              </span>
              <span className="font-medium tabular-nums text-gray-900 dark:text-white">{r.amountLabel}</span>
            </motion.li>
          ))}
          {m.me && m.me.rank > m.top.length && (
            <li className="mt-2 flex items-center gap-3 rounded-md bg-blue-50 px-2 py-1.5 text-sm dark:bg-blue-900/30">
              <span className="w-5 text-right font-semibold tabular-nums text-gray-600 dark:text-gray-400">{m.me.rank}</span>
              <span className="flex-1 truncate text-gray-900 dark:text-white">
                {m.me.name} <span className="text-xs text-blue-700 dark:text-blue-300">(tú)</span>
              </span>
              <span className="font-medium tabular-nums text-gray-900 dark:text-white">{m.me.amountLabel}</span>
            </li>
          )}
        </ol>
      )}
    </WidgetCard>
  );
}
