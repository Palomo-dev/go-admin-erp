'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
import { Search, CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Route {
  id: string;
  name: string;
  code: string;
}

interface Vehicle {
  id: string;
  plate: string;
}

interface Driver {
  id: string;
  name: string;
}

interface Branch {
  id: number;
  name: string;
}

interface TripsFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  dateFilter: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
  routeFilter: string;
  onRouteChange: (value: string) => void;
  vehicleFilter: string;
  onVehicleChange: (value: string) => void;
  driverFilter: string;
  onDriverChange: (value: string) => void;
  branchFilter: string;
  onBranchChange: (value: string) => void;
  routes: Route[];
  vehicles: Vehicle[];
  drivers: Driver[];
  branches: Branch[];
  onClearFilters: () => void;
  hasFilters: boolean;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'scheduled', label: 'Programado' },
  { value: 'boarding', label: 'En Abordaje' },
  { value: 'in_transit', label: 'En Ruta' },
  { value: 'completed', label: 'Completado' },
  { value: 'cancelled', label: 'Cancelado' },
];

export function TripsFilters({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusChange,
  dateFilter,
  onDateChange,
  routeFilter,
  onRouteChange,
  vehicleFilter,
  onVehicleChange,
  driverFilter,
  onDriverChange,
  branchFilter,
  onBranchChange,
  routes,
  vehicles,
  drivers,
  branches,
  onClearFilters,
  hasFilters,
}: TripsFiltersProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {/* Búsqueda */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por código, ruta..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Fecha */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="min-w-[180px] justify-start">
              <CalendarIcon className="h-4 w-4 mr-2" />
              {dateFilter ? format(dateFilter, 'dd/MM/yyyy', { locale: es }) : 'Seleccionar fecha'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateFilter}
              onSelect={onDateChange}
              locale={es}
            />
          </PopoverContent>
        </Popover>

        {/* Estado */}
        <Select value={statusFilter} onValueChange={onStatusChange}>
          <SelectTrigger className="w-[160px]">
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

        {/* Ruta */}
        <Select value={routeFilter} onValueChange={onRouteChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Ruta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las rutas</SelectItem>
            {routes.map((route) => (
              <SelectItem key={route.id} value={route.id}>
                {route.code} - {route.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-3">
        {/* Vehículo */}
        <Select value={vehicleFilter} onValueChange={onVehicleChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Vehículo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los vehículos</SelectItem>
            {vehicles.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.plate}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Conductor */}
        <Select value={driverFilter} onValueChange={onDriverChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Conductor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los conductores</SelectItem>
            {drivers.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sucursal */}
        {branches.length > 0 && (
          <Select value={branchFilter} onValueChange={onBranchChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sucursal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sucursales</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id.toString()}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Limpiar filtros */}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            <X className="h-4 w-4 mr-1" />
            Limpiar filtros
          </Button>
        )}
      </div>
    </div>
  );
}
