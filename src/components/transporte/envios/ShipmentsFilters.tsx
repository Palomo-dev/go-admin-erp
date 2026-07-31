'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, X, CalendarDays } from 'lucide-react';
import { SHIPMENT_STATUS_OPTIONS, SHIPMENT_PAYMENT_STATUSES } from './shipmentStatuses';

interface Trip {
  id: string;
  trip_code: string;
  transport_routes?: { name: string };
}

interface DriverOption {
  id: string;
  name: string;
}

interface ShipmentsFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  paymentFilter: string;
  onPaymentChange: (value: string) => void;
  tripFilter: string;
  onTripChange: (value: string) => void;
  trips: Trip[];
  dateFrom?: string;
  onDateFromChange?: (value: string) => void;
  dateTo?: string;
  onDateToChange?: (value: string) => void;
  driverFilter?: string;
  onDriverChange?: (value: string) => void;
  drivers?: DriverOption[];
  onClearFilters: () => void;
  hasFilters: boolean;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  ...SHIPMENT_STATUS_OPTIONS,
];

const PAYMENT_OPTIONS = [
  { value: 'all', label: 'Todos los pagos' },
  ...SHIPMENT_PAYMENT_STATUSES,
];

export function ShipmentsFilters({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusChange,
  paymentFilter,
  onPaymentChange,
  tripFilter,
  onTripChange,
  trips,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  driverFilter,
  onDriverChange,
  drivers,
  onClearFilters,
  hasFilters,
}: ShipmentsFiltersProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
          <Input
            placeholder="Buscar por tracking, remitente, destinatario..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 placeholder:text-xs sm:placeholder:text-sm"
          />
        </div>

        <Select value={statusFilter} onValueChange={onStatusChange}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={paymentFilter} onValueChange={onPaymentChange}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Pago" />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={tripFilter} onValueChange={onTripChange}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Viaje" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los viajes</SelectItem>
            {trips.map((trip) => (
              <SelectItem key={trip.id} value={trip.id}>
                {trip.trip_code} - {trip.transport_routes?.name || 'Sin ruta'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {onDriverChange && (
          <Select value={driverFilter || 'all'} onValueChange={onDriverChange}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Conductor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los conductores</SelectItem>
              <SelectItem value="unassigned">Sin asignar</SelectItem>
              {(drivers || []).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            <X className="h-4 w-4 mr-1" />
            Limpiar
          </Button>
        )}
      </div>

      {(onDateFromChange || onDateToChange) && (
        <div className="flex flex-wrap items-end gap-3">
          {onDateFromChange && (
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-gray-500 flex items-center gap-1 dark:text-gray-400">
                <CalendarDays className="h-3 w-3" />
                Desde
              </Label>
              <Input
                type="date"
                value={dateFrom || ''}
                onChange={(e) => onDateFromChange(e.target.value)}
                className="w-full sm:w-[160px]"
              />
            </div>
          )}
          {onDateToChange && (
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-gray-500 flex items-center gap-1 dark:text-gray-400">
                <CalendarDays className="h-3 w-3" />
                Hasta
              </Label>
              <Input
                type="date"
                value={dateTo || ''}
                onChange={(e) => onDateToChange(e.target.value)}
                className="w-full sm:w-[160px]"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
