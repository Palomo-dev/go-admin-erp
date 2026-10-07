'use client';

import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Filter, Clock } from 'lucide-react';
import { SearchInput } from '@/components/kit/SearchInput';
import { useTranslations } from 'next-intl';

export interface PassFiltersState {
  search: string;
  status: string;
  expiringDays: string;
}

interface PassesFiltersProps {
  filters: PassFiltersState;
  onFiltersChange: (filters: PassFiltersState) => void;
}

export function PassesFilters({ filters, onFiltersChange }: PassesFiltersProps) {
  const t = useTranslations('pmsParking');
  const handleChange = (key: keyof PassFiltersState, value: string) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <SearchInput
        value={filters.search}
        onChange={(v) => handleChange('search', v)}
        onValueChange={(v) => handleChange('search', v)}
        placeholder={t('passesFilters.buscarClientePlacaPlan')}
        className="flex-1"
      />

      <Select
        value={filters.status}
        onValueChange={(v) => handleChange('status', v)}
      >
        <SelectTrigger className="w-full sm:w-40 dark:bg-gray-800 dark:border-gray-700">
          <Filter className="h-4 w-4 mr-2 text-gray-400 dark:text-gray-500" />
          <SelectValue placeholder={t('passesTable.estado')} />
        </SelectTrigger>
        <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
          <SelectItem value="all">{t('passesFilters.todos')}</SelectItem>
          <SelectItem value="active">{t('passesFilters.activo')}</SelectItem>
          <SelectItem value="expired">{t('passCard.vencido')}</SelectItem>
          <SelectItem value="suspended">{t('passesFilters.suspendido')}</SelectItem>
          <SelectItem value="cancelled">{t('passesFilters.cancelado')}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.expiringDays}
        onValueChange={(v) => handleChange('expiringDays', v)}
      >
        <SelectTrigger className="w-full sm:w-48 dark:bg-gray-800 dark:border-gray-700">
          <Clock className="h-4 w-4 mr-2 text-gray-400 dark:text-gray-500" />
          <SelectValue placeholder={t('passesFilters.vencimiento')} />
        </SelectTrigger>
        <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
          <SelectItem value="all">{t('passesFilters.sinFiltro')}</SelectItem>
          <SelectItem value="7">{t('passesFilters.vence7Dias')}</SelectItem>
          <SelectItem value="15">{t('passesFilters.vence15Dias')}</SelectItem>
          <SelectItem value="30">{t('passesFilters.vence30Dias')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export default PassesFilters;
