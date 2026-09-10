'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { TimelineQuery } from '@/lib/services/crm/timelineService';
import { KIND_FILTERS } from './utils';

/**
 * TimelineFilters — chips por tipo, usuario del equipo y rango de fechas.
 * Persistencia en localStorage['crm.timeline.filters'].
 */
export interface TimelineFiltersProps {
  value: TimelineQuery;
  onChange: (v: TimelineQuery) => void;
  compact?: boolean;
}

interface TeamUser { id: string; name: string }

export function TimelineFilters({ value, onChange, compact }: TimelineFiltersProps) {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const activeChip = KIND_FILTERS.find((f) => f.kinds.length > 0 && value.kinds && f.kinds.every((k) => value.kinds!.includes(k)) && value.kinds.length === f.kinds.length)?.id ?? 'all';

  useEffect(() => {
    const orgId = getOrganizationId();
    if (!orgId) return;
    supabase
      .from('organization_members')
      .select('user_id, profiles:user_id (first_name, last_name, email)')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .limit(100)
      .then(({ data }) => {
        const rows = (data ?? []) as Array<{ user_id: string; profiles: { first_name?: string; last_name?: string; email?: string } | Array<{ first_name?: string; last_name?: string; email?: string }> | null }>;
        setUsers(rows.map((r) => {
          const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
          return { id: r.user_id, name: `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || p?.email || 'Usuario' };
        }).sort((a, b) => a.name.localeCompare(b.name)));
      });
  }, []);

  const set = (patch: Partial<TimelineQuery>) => onChange({ ...value, ...patch });
  const hasAny = Boolean(value.kinds?.length || value.userId || value.from || value.to);
  const toDateInput = (iso?: string) => (iso ? iso.slice(0, 10) : '');

  return (
    <div className={cn('flex flex-col gap-2', compact ? '' : 'sm:flex-row sm:items-center sm:flex-wrap')}>
      <div role="group" aria-label="Tipo de entrada" className="flex flex-wrap gap-1">
        {KIND_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={activeChip === f.id}
            onClick={() => set({ kinds: f.kinds.length ? f.kinds : undefined })}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
              activeChip === f.id
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Select value={value.userId ?? 'all'} onValueChange={(v) => set({ userId: v === 'all' ? undefined : v })}>
          <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue placeholder="Usuario" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los usuarios</SelectItem>
            {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" aria-label="Desde" value={toDateInput(value.from)} onChange={(e) => set({ from: e.target.value ? new Date(`${e.target.value}T00:00:00`).toISOString() : undefined })} className="h-7 w-[130px] text-xs" />
        <Input type="date" aria-label="Hasta" value={toDateInput(value.to)} onChange={(e) => set({ to: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : undefined })} className="h-7 w-[130px] text-xs" />
        {hasAny && (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange({})}>
            <X className="h-3 w-3 mr-1" />Limpiar
          </Button>
        )}
      </div>
    </div>
  );
}
