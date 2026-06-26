'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { 
  Building2, 
  Truck, 
  Calendar as CalendarIcon, 
  X,
  Download,
  RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export interface TransportFiltersState {
  branchId: string;
  carrierId: string;
  dateFrom: Date;
  dateTo: Date;
}

interface Branch {
  id: number;
  name: string;
}

interface Carrier {
  id: string;
  name: string;
  code: string;
}

interface TransportFiltersProps {
  branches: Branch[];
  carriers: Carrier[];
  filters: TransportFiltersState;
  onFiltersChange: (filters: TransportFiltersState) => void;
  onRefresh: () => void;
  onExport: () => void;
  isLoading?: boolean;
}

export function TransportFilters({
  branches,
  carriers,
  filters,
  onFiltersChange,
  onRefresh,
  onExport,
  isLoading = false,
}: TransportFiltersProps) {
  const [localFilters, setLocalFilters] = useState<TransportFiltersState>(filters);

  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const handleBranchChange = (value: string) => {
    const newFilters = { ...localFilters, branchId: value };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleCarrierChange = (value: string) => {
    const newFilters = { ...localFilters, carrierId: value };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleDateFromChange = (date: Date | undefined) => {
    if (date) {
      const newFilters = { ...localFilters, dateFrom: date };
      setLocalFilters(newFilters);
      onFiltersChange(newFilters);
    }
  };

  const handleDateToChange = (date: Date | undefined) => {
    if (date) {
      const newFilters = { ...localFilters, dateTo: date };
      setLocalFilters(newFilters);
      onFiltersChange(newFilters);
    }
  };

  const handleClearFilters = () => {
    const today = new Date();
    const defaultFilters: TransportFiltersState = {
      branchId: 'all',
      carrierId: 'all',
      dateFrom: today,
      dateTo: today,
    };
    setLocalFilters(defaultFilters);
    onFiltersChange(defaultFilters);
  };

  const hasActiveFilters = 
    localFilters.branchId !== 'all' || 
    localFilters.carrierId !== 'all';

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3">
          {/* Filtro por Sucursal */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Building2 className="h-4 w-4 text-gray-500 flex-shrink-0" />
            <Select value={localFilters.branchId} onValueChange={handleBranchChange}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Sucursal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las sucursales</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id.toString()}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filtro por Transportadora */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Truck className="h-4 w-4 text-gray-500 flex-shrink-0" />
            <Select value={localFilters.carrierId} onValueChange={handleCarrierChange}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Transportadora" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las flotas</SelectItem>
                {carriers.map((carrier) => (
                  <SelectItem key={carrier.id} value={carrier.id}>
                    {carrier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filtro por Fecha Desde */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <CalendarIcon className="h-4 w-4 text-gray-500 flex-shrink-0" />
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full sm:w-[140px] justify-start text-left font-normal',
                    !localFilters.dateFrom && 'text-muted-foreground'
                  )}
                >
                  {localFilters.dateFrom ? (
                    format(localFilters.dateFrom, 'dd/MM/yyyy', { locale: es })
                  ) : (
                    <span>Desde</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={localFilters.dateFrom}
                  onSelect={handleDateFromChange}
                  initialFocus
                  locale={es}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Filtro por Fecha Hasta */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-gray-500 flex-shrink-0">-</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full sm:w-[140px] justify-start text-left font-normal',
                    !localFilters.dateTo && 'text-muted-foreground'
                  )}
                >
                  {localFilters.dateTo ? (
                    format(localFilters.dateTo, 'dd/MM/yyyy', { locale: es })
                  ) : (
                    <span>Hasta</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={localFilters.dateTo}
                  onSelect={handleDateToChange}
                  initialFocus
                  locale={es}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Separador flexible */}
          <div className="hidden sm:block flex-1" />

          {/* Botones de acción */}
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-4 w-4 mr-1" />
                Limpiar
              </Button>
            )}
            
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
              className="dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700"
            >
              <RefreshCw className={cn('h-4 w-4 mr-1', isLoading && 'animate-spin')} />
              Actualizar
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              disabled={isLoading}
            >
              <Download className="h-4 w-4 mr-1" />
              Exportar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
