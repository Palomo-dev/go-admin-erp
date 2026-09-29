'use client';

import { useTranslations } from 'next-intl';
import { RefreshCw, Plus, CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  RESERVATION_STATUS_LABELS,
  RESERVATION_SOURCE_LABELS,
  type ReservationStatus,
  type ReservationSource,
} from './reservasMesasService';
import { CampoFecha } from '@/components/kit/CampoFecha';
import { PageHeader, SearchInput, BranchBadgeActiva, RowActionsMenu } from '@/components/kit';

interface ReservasHeaderProps {
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  sourceFilter: string;
  onSourceFilterChange: (v: string) => void;
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  onRefresh: () => void;
  onNewReservation: () => void;
  isLoading: boolean;
}

/**
 * Cabecera y filtros de reservas de mesas con el kit (sin Figma aprobado:
 * regla del kit). La agenda y las llegadas quedan para cuando exista el diseño.
 */
export function ReservasHeader({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sourceFilter,
  onSourceFilterChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  onRefresh,
  onNewReservation,
  isLoading,
}: ReservasHeaderProps) {
  const t = useTranslations('posReservasMesas');
  return (
    <div className="space-y-4">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={CalendarRange}
        cargando={isLoading}
        debajo={<BranchBadgeActiva />}
        acciones={
          <>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10"
              onClick={onRefresh}
              disabled={isLoading}
              aria-label={t('actualizar')}
              title={t('actualizar')}
            >
              <RefreshCw aria-hidden="true" className={isLoading ? 'size-4 animate-spin' : 'size-4'} strokeWidth={1.5} />
            </Button>
            <Button className="h-10 gap-2" onClick={onNewReservation}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('nueva')}
            </Button>
          </>
        }
        movil={{
          accion: (
            <RowActionsMenu
              orientacion="horizontal"
              tamano="md"
              titulo={t('titulo')}
              acciones={[
                { id: 'nueva', etiqueta: t('nueva'), icono: Plus, onSelect: onNewReservation },
                { id: 'actualizar', etiqueta: t('actualizar'), icono: RefreshCw, onSelect: onRefresh, deshabilitada: isLoading },
              ]}
            />
          ),
        }}
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-72">
          <SearchInput value={search} onChange={onSearchChange} placeholder={t('buscar')} atajo={false} />
        </div>

        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger aria-label={t('estado')} className="h-10 w-[160px] border-line-strong bg-surface">
            <SelectValue placeholder={t('estado')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('todosEstados')}</SelectItem>
            {(Object.entries(RESERVATION_STATUS_LABELS) as [ReservationStatus, string][]).map(
              ([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>

        <Select value={sourceFilter} onValueChange={onSourceFilterChange}>
          <SelectTrigger aria-label={t('origen')} className="h-10 w-[140px] border-line-strong bg-surface">
            <SelectValue placeholder={t('origen')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('todosOrigenes')}</SelectItem>
            {(Object.entries(RESERVATION_SOURCE_LABELS) as [ReservationSource, string][]).map(
              ([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>

        <CampoFecha
          aria-label={t('desde')}
          valor={dateFrom}
          onValorChange={onDateFromChange}
          className="w-[170px]"
        />
        <span aria-hidden="true" className="text-fg-muted">—</span>
        <CampoFecha
          aria-label={t('hasta')}
          valor={dateTo}
          onValorChange={onDateToChange}
          className="w-[170px]"
        />
      </div>
    </div>
  );
}
