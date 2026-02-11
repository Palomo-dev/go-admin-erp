'use client';

import { Search, Filter, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DomainStatus, DomainType } from '@/lib/services/domainService';

interface DomainFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: DomainStatus | 'all';
  onStatusChange: (value: DomainStatus | 'all') => void;
  typeFilter: DomainType | 'all';
  onTypeChange: (value: DomainType | 'all') => void;
  activeFilter: 'all' | 'active' | 'inactive';
  onActiveChange: (value: 'all' | 'active' | 'inactive') => void;
  totalDomains: number;
  filteredCount: number;
}

export function DomainFilters({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusChange,
  typeFilter,
  onTypeChange,
  activeFilter,
  onActiveChange,
  totalDomains,
  filteredCount,
}: DomainFiltersProps) {
  const hasFilters = searchTerm || statusFilter !== 'all' || typeFilter !== 'all' || activeFilter !== 'all';

  const clearFilters = () => {
    onSearchChange('');
    onStatusChange('all');
    onTypeChange('all');
    onActiveChange('all');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Búsqueda */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por dominio..."
            className="pl-10 dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:placeholder-gray-400"
          />
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2">
          {/* Estado */}
          <Select value={statusFilter} onValueChange={(v) => onStatusChange(v as DomainStatus | 'all')}>
            <SelectTrigger className="w-[140px] dark:bg-gray-800 dark:border-gray-700 dark:text-white">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
              <SelectItem value="all" className="dark:text-white dark:focus:bg-gray-700">Todos los estados</SelectItem>
              <SelectItem value="verified" className="dark:text-white dark:focus:bg-gray-700">Verificado</SelectItem>
              <SelectItem value="pending" className="dark:text-white dark:focus:bg-gray-700">Pendiente</SelectItem>
              <SelectItem value="failed" className="dark:text-white dark:focus:bg-gray-700">Fallido</SelectItem>
            </SelectContent>
          </Select>

          {/* Tipo */}
          <Select value={typeFilter} onValueChange={(v) => onTypeChange(v as DomainType | 'all')}>
            <SelectTrigger className="w-[160px] dark:bg-gray-800 dark:border-gray-700 dark:text-white">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
              <SelectItem value="all" className="dark:text-white dark:focus:bg-gray-700">Todos los tipos</SelectItem>
              <SelectItem value="subdomain" className="dark:text-white dark:focus:bg-gray-700">Subdominio</SelectItem>
              <SelectItem value="custom_domain" className="dark:text-white dark:focus:bg-gray-700">Personalizado</SelectItem>
            </SelectContent>
          </Select>

          {/* Activo/Inactivo */}
          <Select value={activeFilter} onValueChange={(v) => onActiveChange(v as 'all' | 'active' | 'inactive')}>
            <SelectTrigger className="w-[130px] dark:bg-gray-800 dark:border-gray-700 dark:text-white">
              <SelectValue placeholder="Actividad" />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
              <SelectItem value="all" className="dark:text-white dark:focus:bg-gray-700">Todos</SelectItem>
              <SelectItem value="active" className="dark:text-white dark:focus:bg-gray-700">Activos</SelectItem>
              <SelectItem value="inactive" className="dark:text-white dark:focus:bg-gray-700">Inactivos</SelectItem>
            </SelectContent>
          </Select>

          {/* Limpiar filtros */}
          {hasFilters && (
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
      </div>

      {/* Contador */}
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Filter className="h-4 w-4" />
        <span>
          Mostrando <strong className="text-gray-900 dark:text-white">{filteredCount}</strong> de{' '}
          <strong className="text-gray-900 dark:text-white">{totalDomains}</strong> dominio{totalDomains !== 1 ? 's' : ''}
        </span>
        {hasFilters && (
          <Badge variant="secondary" className="ml-2 dark:bg-gray-700 dark:text-gray-300">
            Filtros activos
          </Badge>
        )}
      </div>
    </div>
  );
}

export default DomainFilters;
