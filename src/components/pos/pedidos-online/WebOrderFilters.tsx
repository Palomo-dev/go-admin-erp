'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Search, 
  Filter, 
  X,
  Clock,
  CheckCircle,
  ChefHat,
  Package,
  Truck,
  XCircle,
  Store,
  Bike
} from 'lucide-react';
import type { WebOrderStatus, DeliveryType, PaymentStatus, OrderSource } from '@/lib/services/webOrdersService';

interface WebOrderFiltersProps {
  onFilterChange: (filters: {
    status?: WebOrderStatus[];
    delivery_type?: DeliveryType;
    source?: OrderSource;
    payment_status?: PaymentStatus;
    search?: string;
  }) => void;
  activeFilters: {
    status?: WebOrderStatus[];
    delivery_type?: DeliveryType;
    source?: OrderSource;
    payment_status?: PaymentStatus;
    search?: string;
  };
}

const STATUS_OPTIONS: { value: WebOrderStatus; label: string; icon: React.ReactNode }[] = [
  { value: 'pending', label: 'Pendientes', icon: <Clock className="h-4 w-4 text-yellow-500" /> },
  { value: 'confirmed', label: 'Confirmados', icon: <CheckCircle className="h-4 w-4 text-blue-500" /> },
  { value: 'preparing', label: 'Preparando', icon: <ChefHat className="h-4 w-4 text-orange-500" /> },
  { value: 'ready', label: 'Listos', icon: <Package className="h-4 w-4 text-green-500" /> },
  { value: 'in_delivery', label: 'En camino', icon: <Truck className="h-4 w-4 text-purple-500" /> },
  { value: 'delivered', label: 'Entregados', icon: <CheckCircle className="h-4 w-4 text-emerald-500" /> },
  { value: 'cancelled', label: 'Cancelados', icon: <XCircle className="h-4 w-4 text-red-500" /> },
];

const DELIVERY_TYPE_OPTIONS: { value: DeliveryType | 'all'; label: string; icon: React.ReactNode }[] = [
  { value: 'all', label: 'Todos', icon: <Filter className="h-4 w-4" /> },
  { value: 'pickup', label: 'Retiro', icon: <Store className="h-4 w-4" /> },
  { value: 'delivery_own', label: 'Delivery propio', icon: <Bike className="h-4 w-4" /> },
  { value: 'delivery_third_party', label: 'Terceros', icon: <Truck className="h-4 w-4" /> },
];

export function WebOrderFilters({ onFilterChange, activeFilters }: WebOrderFiltersProps) {
  const [search, setSearch] = useState(activeFilters.search || '');

  const handleStatusToggle = (status: WebOrderStatus) => {
    const currentStatuses = activeFilters.status || [];
    const newStatuses = currentStatuses.includes(status)
      ? currentStatuses.filter(s => s !== status)
      : [...currentStatuses, status];
    
    onFilterChange({ ...activeFilters, status: newStatuses.length > 0 ? newStatuses : undefined });
  };

  const handleDeliveryTypeChange = (value: string) => {
    onFilterChange({ 
      ...activeFilters, 
      delivery_type: value === 'all' ? undefined : value as DeliveryType 
    });
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
  };

  const handleSearchSubmit = () => {
    onFilterChange({ ...activeFilters, search: search || undefined });
  };

  const clearFilters = () => {
    setSearch('');
    onFilterChange({});
  };

  const hasActiveFilters = (activeFilters.status?.length || 0) > 0 || 
    activeFilters.delivery_type || 
    activeFilters.search;

  return (
    <div className="space-y-4">
      {/* Barra de búsqueda */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por # pedido, nombre o teléfono..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
            className="pl-9"
          />
        </div>
        <Button onClick={handleSearchSubmit}>
          Buscar
        </Button>
        {hasActiveFilters && (
          <Button variant="outline" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            Limpiar
          </Button>
        )}
      </div>

      {/* Filtros rápidos por estado */}
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((option) => {
          const isActive = activeFilters.status?.includes(option.value);
          return (
            <Button
              key={option.value}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleStatusToggle(option.value)}
              className="gap-1"
            >
              {option.icon}
              {option.label}
            </Button>
          );
        })}
      </div>

      {/* Filtro por tipo de entrega */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">Tipo de entrega:</span>
        <div className="flex gap-2">
          {DELIVERY_TYPE_OPTIONS.map((option) => {
            const isActive = option.value === 'all' 
              ? !activeFilters.delivery_type 
              : activeFilters.delivery_type === option.value;
            return (
              <Button
                key={option.value}
                variant={isActive ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => handleDeliveryTypeChange(option.value)}
                className="gap-1"
              >
                {option.icon}
                {option.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Filtros activos */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtros activos:</span>
          {activeFilters.status?.map(status => (
            <Badge key={status} variant="secondary" className="gap-1">
              {STATUS_OPTIONS.find(s => s.value === status)?.label}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => handleStatusToggle(status)}
              />
            </Badge>
          ))}
          {activeFilters.delivery_type && (
            <Badge variant="secondary" className="gap-1">
              {DELIVERY_TYPE_OPTIONS.find(d => d.value === activeFilters.delivery_type)?.label}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => handleDeliveryTypeChange('all')}
              />
            </Badge>
          )}
          {activeFilters.search && (
            <Badge variant="secondary" className="gap-1">
              &quot;{activeFilters.search}&quot;
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => {
                  setSearch('');
                  onFilterChange({ ...activeFilters, search: undefined });
                }}
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
