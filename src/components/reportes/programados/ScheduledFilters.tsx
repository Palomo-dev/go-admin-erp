'use client';

import React from 'react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { FREQUENCY_OPTIONS } from './scheduledReportService';

interface ScheduledFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: string;
  onStatusChange: (v: string) => void;
  frequencyFilter: string;
  onFrequencyChange: (v: string) => void;
}

export function ScheduledFilters({
  search, onSearchChange,
  statusFilter, onStatusChange,
  frequencyFilter, onFrequencyChange,
}: ScheduledFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {/* Búsqueda */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
        />
      </div>

      {/* Estado */}
      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[150px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="active">Activos</SelectItem>
          <SelectItem value="inactive">Inactivos</SelectItem>
        </SelectContent>
      </Select>

      {/* Frecuencia */}
      <Select value={frequencyFilter} onValueChange={onFrequencyChange}>
        <SelectTrigger className="w-[150px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
          <SelectValue placeholder="Frecuencia" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas</SelectItem>
          {FREQUENCY_OPTIONS.map((f) => (
            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
