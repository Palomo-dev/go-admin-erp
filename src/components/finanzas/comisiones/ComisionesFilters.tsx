'use client';

/**
 * Filtros arriba, con contador de activos y «Limpiar» (brief §3). Miembro =
 * `organization_members` + `profiles` (patrón canónico). Las fechas son días
 * calendario (`<input type="date">` → YYYY-MM-DD) que el servidor acota en la
 * zona horaria de la organización.
 */

import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { OrgMemberOption } from '@/lib/hooks/useOrgMembers';
import { activeFilterCount, emptyFilters, type ComisionesFiltersState } from './comisionesModel';

interface Props {
  filters: ComisionesFiltersState;
  onChange: (filters: ComisionesFiltersState) => void;
  members: OrgMemberOption[];
  /** Un empleado solo ve las suyas: se oculta el selector de miembro. */
  canManage: boolean;
}

const ALL = '__all__';
const field = 'bg-white dark:bg-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600';
const label = 'mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300';

export function ComisionesFilters({ filters, onChange, members, canManage }: Props) {
  const active = activeFilterCount(filters);
  const set = (patch: Partial<ComisionesFiltersState>) => onChange({ ...filters, ...patch });

  return (
    <section aria-label="Filtros" className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <Label htmlFor="com-search" className={label}>Buscar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
            <Input id="com-search" placeholder="Nombre o notas" value={filters.search} onChange={(e) => set({ search: e.target.value })} className={`pl-9 ${field}`} />
          </div>
        </div>

        {canManage && (
          <div>
            <Label htmlFor="com-member" className={label}>Miembro</Label>
            <Select value={filters.payee_id || ALL} onValueChange={(v) => set({ payee_id: v === ALL ? '' : v })}>
              <SelectTrigger id="com-member" className={field}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Label htmlFor="com-status" className={label}>Estado</Label>
          <Select value={filters.status} onValueChange={(v) => set({ status: v as ComisionesFiltersState['status'] })}>
            <SelectTrigger id="com-status" className={field}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="accrued">Pendientes</SelectItem>
              <SelectItem value="paid">Pagadas</SelectItem>
              <SelectItem value="cancelled">Canceladas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="com-source" className={label}>Origen</Label>
          <Select value={filters.source_type} onValueChange={(v) => set({ source_type: v as ComisionesFiltersState['source_type'] })}>
            <SelectTrigger id="com-source" className={field}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="invoice_sale">Factura de venta</SelectItem>
              <SelectItem value="opportunity">Oportunidad</SelectItem>
              <SelectItem value="sale">Venta POS</SelectItem>
              <SelectItem value="invoice_purchase">Factura de compra</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className={canManage ? '' : 'lg:col-span-2'}>
          <fieldset>
            <legend className={label}>Devengadas entre</legend>
            <div className="flex items-center gap-2">
              <Input type="date" aria-label="Desde" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} className={field} />
              <span className="text-xs text-gray-600 dark:text-gray-400" aria-hidden="true">y</span>
              <Input type="date" aria-label="Hasta" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} className={field} />
            </div>
          </fieldset>
        </div>
      </div>

      {active > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
            {active} filtro{active === 1 ? '' : 's'} activo{active === 1 ? '' : 's'}
          </span>
          <Button variant="ghost" size="sm" onClick={() => onChange(emptyFilters())} className="h-7 text-xs">
            <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Limpiar
          </Button>
        </div>
      )}
    </section>
  );
}
