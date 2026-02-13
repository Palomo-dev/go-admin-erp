'use client';

import { useState, useEffect } from 'react';
import { Filter, X, Building2, User, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase/config';
import {
  CalendarFilters as CalendarFiltersType,
  EventSourceType,
  EventStatus,
  SOURCE_TYPE_LABELS,
  SOURCE_TYPE_COLORS,
  ALL_SOURCE_TYPES,
} from './types';
import { cn } from '@/utils/Utils';

interface CalendarFiltersProps {
  organizationId: number | null;
  filters: CalendarFiltersType;
  onFiltersChange: (filters: Partial<CalendarFiltersType>) => void;
}

interface Branch {
  id: number;
  name: string;
}

interface Member {
  user_id: string;
  profiles: {
    first_name: string;
    last_name: string;
  } | null;
}

export function CalendarFilters({
  organizationId,
  filters,
  onFiltersChange,
}: CalendarFiltersProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    if (!organizationId) return;

    const loadData = async () => {
      const [branchesRes, membersRes] = await Promise.all([
        supabase
          .from('branches')
          .select('id, name')
          .eq('organization_id', organizationId)
          .eq('is_active', true),
        supabase
          .from('organization_members')
          .select('user_id, profiles(first_name, last_name)')
          .eq('organization_id', organizationId)
          .eq('is_active', true),
      ]);

      if (branchesRes.data) setBranches(branchesRes.data);
      if (membersRes.data) setMembers(membersRes.data as Member[]);
    };

    loadData();
  }, [organizationId]);

  const activeFiltersCount = [
    filters.branchId ? 1 : 0,
    filters.assignedTo ? 1 : 0,
    filters.status !== 'all' ? 1 : 0,
    filters.sourceTypes.length < ALL_SOURCE_TYPES.length ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const toggleSourceType = (sourceType: EventSourceType) => {
    const current = filters.sourceTypes;
    const updated = current.includes(sourceType)
      ? current.filter((t) => t !== sourceType)
      : [...current, sourceType];
    onFiltersChange({ sourceTypes: updated.length > 0 ? updated : ALL_SOURCE_TYPES });
  };

  const clearFilters = () => {
    onFiltersChange({
      branchId: null,
      assignedTo: null,
      status: 'all',
      sourceTypes: ALL_SOURCE_TYPES,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 p-4 bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
      {/* Filtro por sucursal */}
      <Select
        value={filters.branchId?.toString() || 'all'}
        onValueChange={(v) => onFiltersChange({ branchId: v === 'all' ? null : parseInt(v) })}
      >
        <SelectTrigger className="w-[180px] h-9 bg-white dark:bg-gray-900">
          <Building2 className="h-4 w-4 mr-2 text-gray-500" />
          <SelectValue placeholder="Sucursal" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas las sucursales</SelectItem>
          {branches.map((branch) => (
            <SelectItem key={branch.id} value={branch.id.toString()}>
              {branch.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Filtro por asignado */}
      <Select
        value={filters.assignedTo || 'all'}
        onValueChange={(v) => onFiltersChange({ assignedTo: v === 'all' ? null : v })}
      >
        <SelectTrigger className="w-[180px] h-9 bg-white dark:bg-gray-900">
          <User className="h-4 w-4 mr-2 text-gray-500" />
          <SelectValue placeholder="Asignado a" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {members.map((member) => (
            <SelectItem key={member.user_id} value={member.user_id}>
              {member.profiles
                ? `${member.profiles.first_name} ${member.profiles.last_name}`
                : 'Usuario'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Filtro por estado */}
      <Select
        value={filters.status}
        onValueChange={(v) => onFiltersChange({ status: v as EventStatus | 'all' })}
      >
        <SelectTrigger className="w-[150px] h-9 bg-white dark:bg-gray-900">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los estados</SelectItem>
          <SelectItem value="confirmed">Confirmado</SelectItem>
          <SelectItem value="tentative">Tentativo</SelectItem>
          <SelectItem value="pending">Pendiente</SelectItem>
          <SelectItem value="completed">Completado</SelectItem>
          <SelectItem value="cancelled">Cancelado</SelectItem>
        </SelectContent>
      </Select>

      {/* Filtro por tipo de fuente (módulos) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 bg-white dark:bg-gray-900">
            <Filter className="h-4 w-4 mr-2" />
            Módulos
            {filters.sourceTypes.length < ALL_SOURCE_TYPES.length && (
              <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-blue-600">
                {filters.sourceTypes.length}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Mostrar eventos de</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {ALL_SOURCE_TYPES.map((sourceType) => (
            <DropdownMenuCheckboxItem
              key={sourceType}
              checked={filters.sourceTypes.includes(sourceType)}
              onCheckedChange={() => toggleSourceType(sourceType)}
            >
              <span
                className="w-3 h-3 rounded-full mr-2"
                style={{ backgroundColor: SOURCE_TYPE_COLORS[sourceType] }}
              />
              {SOURCE_TYPE_LABELS[sourceType]}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onFiltersChange({ sourceTypes: ALL_SOURCE_TYPES })}
          >
            <Check className="h-4 w-4 mr-2" />
            Seleccionar todos
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Limpiar filtros */}
      {activeFiltersCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="h-9 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <X className="h-4 w-4 mr-2" />
          Limpiar ({activeFiltersCount})
        </Button>
      )}

      {/* Leyenda de colores */}
      <div className="hidden lg:flex items-center gap-3 ml-auto">
        {ALL_SOURCE_TYPES.slice(0, 5).map((sourceType) => (
          <div
            key={sourceType}
            className={cn(
              'flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400',
              !filters.sourceTypes.includes(sourceType) && 'opacity-40'
            )}
          >
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: SOURCE_TYPE_COLORS[sourceType] }}
            />
            {SOURCE_TYPE_LABELS[sourceType].split(' ')[0]}
          </div>
        ))}
      </div>
    </div>
  );
}
