'use client';

import {useRedText} from '@/components/crm/red/useRedText';

/**
 * Búsqueda y filtros arriba, chips de estado con conteo (brief §3). Los chips
 * son botones `aria-pressed`; el filtro activo se ve y se quita con un clic.
 */


import { Label } from '@/components/ui/label';
import { REFERRAL_STATUSES, type ReferralStatus } from '@/lib/services/crm/referralStateMachine';
import type { ReferralListFilters } from '@/lib/services/crm/referralModel';
import { cn } from '@/utils/Utils';
import { REFERRAL_STATUS_META } from './referralMeta';
import { SearchInput } from '@/components/kit/SearchInput';

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
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-surface',
    active
      ? 'border-brand bg-brand text-white'
      : 'border-line-strong bg-surface text-fg hover:bg-subtle    dark:hover:bg-subtle',
  );
}

export function ReferralToolbar({ filters, counts, total, shown, onChange }: Props) {
  const {tr} = useRedText();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-md">
          <Label htmlFor="referrals-search" className="text-xs text-fg-secondary ">{tr("Buscar")}</Label>
          <SearchInput
            value={filters.q}
            onChange={(v) => onChange({ ...filters, q: v })}
            onValueChange={(v) => onChange({ ...filters, q: v })}
            placeholder={tr("Nombre, correo, teléfono o referidor")}
            id="referrals-search"
          />
        </div>
        <p className="pb-2 text-sm text-fg-secondary " aria-live="polite">
          {shown === total ? tr("{p0} referido{p1}", {p0: total, p1: total === 1 ? '' : 's'}) : tr("{p0} de {p1} referidos", {p0: shown, p1: total})}
        </p>
      </div>
      <ul aria-label={tr("Filtrar por estado")} className="flex flex-wrap gap-2">
        <li>
          <button type="button" aria-pressed={filters.status === 'all'} className={chipClass(filters.status === 'all')} onClick={() => onChange({ ...filters, status: 'all' })}>
             {tr("Todos")} <span className="text-xs">{total}</span>
          </button>
        </li>
        {REFERRAL_STATUSES.map((s) => {
          const Icon = REFERRAL_STATUS_META[s].icon;
          const active = filters.status === s;
          return (
            <li key={s}>
              <button type="button" aria-pressed={active} className={chipClass(active)} onClick={() => onChange({ ...filters, status: active ? 'all' : s })}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {tr(REFERRAL_STATUS_META[s].label)} <span className="text-xs">{counts[s]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
