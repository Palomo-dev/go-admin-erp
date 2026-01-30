'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, X, Download, Plus, RefreshCw } from 'lucide-react';

interface TrackingFilters {
  reference_type: 'trip' | 'shipment' | 'all';
  dateFrom: string;
  dateTo: string;
  search: string;
}

interface TrackingFiltersProps {
  filters: TrackingFilters;
  onFiltersChange: (filters: TrackingFilters) => void;
  onRefresh: () => void;
  onExport: () => void;
  onNewEvent: () => void;
  isRefreshing: boolean;
}

export function TrackingFilters({
  filters,
  onFiltersChange,
  onRefresh,
  onExport,
  onNewEvent,
  isRefreshing,
}: TrackingFiltersProps) {
  const handleClearFilters = () => {
    onFiltersChange({
      reference_type: 'all',
      dateFrom: '',
      dateTo: '',
      search: '',
    });
  };

  const hasFilters = filters.reference_type !== 'all' || filters.dateFrom || filters.dateTo || filters.search;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <Label className="mb-2 block">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Código de viaje o tracking..."
              value={filters.search}
              onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
              className="pl-10"
            />
          </div>
        </div>

        <div className="w-[150px]">
          <Label className="mb-2 block">Tipo</Label>
          <Select
            value={filters.reference_type}
            onValueChange={(v) => onFiltersChange({ ...filters, reference_type: v as TrackingFilters['reference_type'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="trip">Viajes</SelectItem>
              <SelectItem value="shipment">Envíos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-[150px]">
          <Label className="mb-2 block">Desde</Label>
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onFiltersChange({ ...filters, dateFrom: e.target.value })}
          />
        </div>

        <div className="w-[150px]">
          <Label className="mb-2 block">Hasta</Label>
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value })}
          />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearFilters}>
            <X className="h-4 w-4 mr-1" />
            Limpiar
          </Button>
        )}
      </div>

      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
        <Button onClick={onNewEvent} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" />
          Registrar Evento
        </Button>
      </div>
    </div>
  );
}
