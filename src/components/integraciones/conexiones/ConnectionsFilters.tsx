'use client';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, X, Filter } from 'lucide-react';
import { IntegrationProvider } from '@/lib/services/integrationsService';

export interface ConnectionFilters {
  search: string;
  status: string;
  environment: string;
  countryCode: string;
  branchId: number | null;
  providerId: string;
}

interface ConnectionsFiltersProps {
  filters: ConnectionFilters;
  onFiltersChange: (filters: ConnectionFilters) => void;
  providers: IntegrationProvider[];
  branches: Array<{ id: number; name: string }>;
  countries: Array<{ code: string; name: string }>;
}

const statusOptions = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'connected', label: 'Conectado' },
  { value: 'paused', label: 'Pausado' },
  { value: 'error', label: 'Error' },
  { value: 'draft', label: 'Borrador' },
  { value: 'revoked', label: 'Revocado' },
];

const environmentOptions = [
  { value: 'all', label: 'Todos los ambientes' },
  { value: 'production', label: 'Producción' },
  { value: 'sandbox', label: 'Sandbox' },
  { value: 'test', label: 'Test' },
];

export function ConnectionsFilters({
  filters,
  onFiltersChange,
  providers,
  branches,
  countries,
}: ConnectionsFiltersProps) {
  const handleChange = (key: keyof ConnectionFilters, value: string | number | null) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange({
      search: '',
      status: 'all',
      environment: 'all',
      countryCode: 'all',
      branchId: null,
      providerId: 'all',
    });
  };

  const hasActiveFilters =
    filters.search ||
    filters.status !== 'all' ||
    filters.environment !== 'all' ||
    filters.countryCode !== 'all' ||
    filters.branchId !== null ||
    filters.providerId !== 'all';

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Búsqueda */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar conexiones..."
            value={filters.search}
            onChange={(e) => handleChange('search', e.target.value)}
            className="pl-10 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
          />
        </div>

        {/* Estado */}
        <Select
          value={filters.status}
          onValueChange={(value) => handleChange('status', value)}
        >
          <SelectTrigger className="w-full sm:w-[160px] dark:bg-gray-800 dark:border-gray-700">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
            {statusOptions.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                className="dark:text-gray-200 dark:focus:bg-gray-700"
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Ambiente */}
        <Select
          value={filters.environment}
          onValueChange={(value) => handleChange('environment', value)}
        >
          <SelectTrigger className="w-full sm:w-[160px] dark:bg-gray-800 dark:border-gray-700">
            <SelectValue placeholder="Ambiente" />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
            {environmentOptions.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                className="dark:text-gray-200 dark:focus:bg-gray-700"
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {/* Proveedor */}
        <Select
          value={filters.providerId}
          onValueChange={(value) => handleChange('providerId', value)}
        >
          <SelectTrigger className="w-full sm:w-[180px] dark:bg-gray-800 dark:border-gray-700">
            <SelectValue placeholder="Proveedor" />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
            <SelectItem value="all" className="dark:text-gray-200 dark:focus:bg-gray-700">
              Todos los proveedores
            </SelectItem>
            {providers.map((provider) => (
              <SelectItem
                key={provider.id}
                value={provider.id}
                className="dark:text-gray-200 dark:focus:bg-gray-700"
              >
                {provider.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* País */}
        <Select
          value={filters.countryCode}
          onValueChange={(value) => handleChange('countryCode', value)}
        >
          <SelectTrigger className="w-full sm:w-[160px] dark:bg-gray-800 dark:border-gray-700">
            <SelectValue placeholder="País" />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
            <SelectItem value="all" className="dark:text-gray-200 dark:focus:bg-gray-700">
              Todos los países
            </SelectItem>
            {countries.map((country) => (
              <SelectItem
                key={country.code}
                value={country.code}
                className="dark:text-gray-200 dark:focus:bg-gray-700"
              >
                {country.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sucursal */}
        {branches.length > 0 && (
          <Select
            value={filters.branchId?.toString() || 'all'}
            onValueChange={(value) =>
              handleChange('branchId', value === 'all' ? null : parseInt(value))
            }
          >
            <SelectTrigger className="w-full sm:w-[180px] dark:bg-gray-800 dark:border-gray-700">
              <SelectValue placeholder="Sucursal" />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
              <SelectItem value="all" className="dark:text-gray-200 dark:focus:bg-gray-700">
                Todas las sucursales
              </SelectItem>
              {branches.map((branch) => (
                <SelectItem
                  key={branch.id}
                  value={branch.id.toString()}
                  className="dark:text-gray-200 dark:focus:bg-gray-700"
                >
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Limpiar filtros */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4 mr-1" />
            Limpiar
          </Button>
        )}
      </div>

      {/* Indicador de filtros activos */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
          <Filter className="h-4 w-4" />
          <span>Filtros activos</span>
        </div>
      )}
    </div>
  );
}

export default ConnectionsFilters;
