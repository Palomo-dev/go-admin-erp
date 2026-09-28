'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Filter, X } from 'lucide-react';

interface JobFiltersProps {
  statusFilter: string;
  onStatusChange: (status: string) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onClearFilters: () => void;
}

/** Estados de `electronic_invoicing_jobs.status` (claves técnicas; la etiqueta sale de `facturacionElectronica.estados`). */
const statusOptions = ['pending', 'processing', 'sent', 'accepted', 'rejected', 'failed', 'cancelled'] as const;

export function JobFilters({
  statusFilter,
  onStatusChange,
  searchTerm,
  onSearchChange,
  onClearFilters,
}: JobFiltersProps) {
  const t = useTranslations('facturacionElectronica');
  const hasFilters = statusFilter !== 'all' || searchTerm !== '';

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
      {/* Búsqueda */}
      <div className="relative flex-1 w-full sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder={t('filtros.buscar')}
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 bg-white dark:bg-gray-800"
        />
      </div>

      {/* Filtro de estado */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-gray-400" />
        <Select value={statusFilter} onValueChange={onStatusChange}>
          <SelectTrigger className="w-[180px] bg-white dark:bg-gray-800">
            <SelectValue placeholder={t('filtros.estadoPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filtros.todos')}</SelectItem>
            {statusOptions.map((estado) => (
              <SelectItem key={estado} value={estado}>
                {t(`estados.${estado}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Limpiar filtros */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <X className="h-4 w-4 mr-1" />
          {t('filtros.limpiar')}
        </Button>
      )}
    </div>
  );
}

export default JobFilters;
