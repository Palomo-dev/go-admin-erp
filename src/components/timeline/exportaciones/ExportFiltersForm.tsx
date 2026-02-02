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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TimelineFilters } from '@/lib/services/timelineService';
import {
  SOURCE_TABLE_LABELS,
  ACTION_LABELS,
  SOURCE_CATEGORY_LABELS,
} from '@/lib/services/timelineService';

interface ExportFiltersFormProps {
  filters: TimelineFilters;
  onFiltersChange: (filters: TimelineFilters) => void;
}

const AVAILABLE_TABLES = [
  'ops_audit_log',
  'finance_audit_log',
  'products_audit_log',
  'chat_audit_logs',
  'roles_audit_log',
  'transport_events',
  'integration_events',
  'electronic_invoicing_events',
  'membership_events',
  'attendance_events',
];

const AVAILABLE_ACTIONS = [
  'create',
  'update',
  'delete',
  'approve',
  'reject',
  'status_change',
  'void',
  'login',
  'logout',
];

const AVAILABLE_CATEGORIES = [
  'audit',
  'domain_event',
  'status_history',
  'integration',
];

export function ExportFiltersForm({ filters, onFiltersChange }: ExportFiltersFormProps) {
  const handleChange = (key: keyof TimelineFilters, value: string | undefined) => {
    onFiltersChange({
      ...filters,
      [key]: value === 'all' ? undefined : value,
    });
  };

  const handleDateChange = (key: 'startDate' | 'endDate', date: Date | undefined) => {
    if (date) {
      onFiltersChange({
        ...filters,
        [key]: date.toISOString(),
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Rango de fechas */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Fecha inicio</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.startDate
                  ? format(new Date(filters.startDate), 'dd/MM/yyyy', { locale: es })
                  : 'Seleccionar'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.startDate ? new Date(filters.startDate) : undefined}
                onSelect={(date) => handleDateChange('startDate', date)}
                locale={es}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label>Fecha fin</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.endDate
                  ? format(new Date(filters.endDate), 'dd/MM/yyyy', { locale: es })
                  : 'Seleccionar'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.endDate ? new Date(filters.endDate) : undefined}
                onSelect={(date) => handleDateChange('endDate', date)}
                locale={es}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Categoría */}
      <div className="space-y-2">
        <Label>Categoría</Label>
        <Select
          value={filters.sourceCategory || 'all'}
          onValueChange={(value) => handleChange('sourceCategory', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Todas las categorías" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {AVAILABLE_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {SOURCE_CATEGORY_LABELS[cat] || cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Módulo/Tabla */}
      <div className="space-y-2">
        <Label>Módulo</Label>
        <Select
          value={filters.sourceTable || 'all'}
          onValueChange={(value) => handleChange('sourceTable', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Todos los módulos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los módulos</SelectItem>
            {AVAILABLE_TABLES.map((table) => (
              <SelectItem key={table} value={table}>
                {SOURCE_TABLE_LABELS[table] || table}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Acción */}
      <div className="space-y-2">
        <Label>Acción</Label>
        <Select
          value={filters.action || 'all'}
          onValueChange={(value) => handleChange('action', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Todas las acciones" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las acciones</SelectItem>
            {AVAILABLE_ACTIONS.map((action) => (
              <SelectItem key={action} value={action}>
                {ACTION_LABELS[action] || action}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tipo de entidad */}
      <div className="space-y-2">
        <Label>Tipo de entidad</Label>
        <Input
          placeholder="Ej: product, customer, invoice..."
          value={filters.entityType || ''}
          onChange={(e) => handleChange('entityType', e.target.value || undefined)}
        />
      </div>

      {/* ID de entidad */}
      <div className="space-y-2">
        <Label>ID de entidad (opcional)</Label>
        <Input
          placeholder="UUID o ID específico"
          value={filters.entityId || ''}
          onChange={(e) => handleChange('entityId', e.target.value || undefined)}
        />
      </div>

      {/* Búsqueda de texto */}
      <div className="space-y-2">
        <Label>Búsqueda de texto</Label>
        <Input
          placeholder="Buscar en eventos..."
          value={filters.searchText || ''}
          onChange={(e) => handleChange('searchText', e.target.value || undefined)}
        />
      </div>
    </div>
  );
}
