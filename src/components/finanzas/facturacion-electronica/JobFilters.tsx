'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Filter, X } from 'lucide-react';
import { SearchInput } from '@/components/kit/SearchInput';

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
      <SearchInput
        value={searchTerm}
        onChange={onSearchChange}
        onValueChange={onSearchChange}
        placeholder={t('filtros.buscar')}
        className="flex-1 w-full sm:max-w-xs"
      />

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
