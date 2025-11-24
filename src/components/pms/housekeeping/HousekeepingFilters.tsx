'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface HousekeepingFiltersProps {
  selectedDate: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
}

export function HousekeepingFilters({
  selectedDate,
  onDateChange,
  selectedStatus,
  onStatusChange,
  searchTerm,
  onSearchChange,
}: HousekeepingFiltersProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Búsqueda por espacio */}
        <div className="space-y-2">
          <Label htmlFor="search">Buscar Espacio</Label>
          <Input
            id="search"
            placeholder="Nombre del espacio..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="dark:bg-gray-900"
          />
        </div>

        {/* Filtro por fecha */}
        <div className="space-y-2">
          <Label>Fecha</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal dark:bg-gray-900"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? (
                  format(selectedDate, 'PPP', { locale: es })
                ) : (
                  <span>Seleccionar fecha</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={onDateChange}
                initialFocus
                locale={es}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Filtro por estado */}
        <div className="space-y-2">
          <Label htmlFor="status">Estado</Label>
          <Select value={selectedStatus} onValueChange={onStatusChange}>
            <SelectTrigger id="status" className="dark:bg-gray-900">
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="in_progress">En Progreso</SelectItem>
              <SelectItem value="done">Completadas</SelectItem>
              <SelectItem value="cancelled">Canceladas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
