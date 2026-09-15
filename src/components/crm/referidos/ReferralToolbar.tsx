'use client';

/**
 * Búsqueda y filtros arriba, chips de estado con conteo (brief §3). Los chips
 * son botones `aria-pressed`; el filtro activo se ve y se quita con un clic.
 */

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { REFERRAL_STATUSES, type ReferralStatus } from '@/lib/services/crm/referralStateMachine';
import type { ReferralListFilters } from '@/lib/services/crm/referralModel';
import { cn } from '@/utils/Utils';
import { REFERRAL_STATUS_META } from './referralMeta';

interface Props {
  filters: ReferralListFilters;
  counts: Record<ReferralStatus, number>;
  total: number;
  shown: number;
  onChange: (next: ReferralListFilters) => void;
}

export function chipClass(active: boolean): string {
  return cn(
    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950',
    active
      ? 'border-blue-600 bg-blue-600 text-white'
      : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800',
  );
}

export function ReferralToolbar({ filters, counts, total, shown, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-md">
          <Label htmlFor="referrals-search" className="text-xs text-gray-700 dark:text-gray-300">Buscar</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
            <Input
              id="referrals-search"
              type="search"
              autoComplete="off"
              className="pl-9"
              placeholder="Nombre, correo, teléfono o referidor"
              value={filters.q}
              onChange={(e) => onChange({ ...filters, q: e.target.value })}
            />
          </div>
        </div>
        <p className="pb-2 text-sm text-gray-600 dark:text-gray-400" aria-live="polite">
          {shown === total ? `${total} referido${total === 1 ? '' : 's'}` : `${shown} de ${total} referidos`}
        </p>
      </div>
      <ul aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
        <li>
          <button type="button" aria-pressed={filters.status === 'all'} className={chipClass(filters.status === 'all')} onClick={() => onChange({ ...filters, status: 'all' })}>
            Todos <span className="text-xs">{total}</span>
          </button>
        </li>
        {REFERRAL_STATUSES.map((s) => {
          const Icon = REFERRAL_STATUS_META[s].icon;
          const active = filters.status === s;
          return (
            <li key={s}>
              <button type="button" aria-pressed={active} className={chipClass(active)} onClick={() => onChange({ ...filters, status: active ? 'all' : s })}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {REFERRAL_STATUS_META[s].label} <span className="text-xs">{counts[s]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
