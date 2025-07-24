'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Badge } from '@/components/ui/badge';
import { X, Filter, Search } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { ActivityType, ACTIVITY_TYPE_CONFIG } from '@/types/activity';
import type { ActivityFilter } from '@/types/activity';
import { getActivityUsers } from '@/lib/services/activityService';

interface FiltrosActividadesProps {
  filtros: ActivityFilter;
  onFiltrosChange: (filtros: ActivityFilter) => void;
  className?: string;
}

interface User {
  id: string;
  name: string;
}

export function FiltrosActividades({
  filtros,
  onFiltrosChange,
  className
}: FiltrosActividadesProps) {
  const [usuarios, setUsuarios] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Cargar usuarios disponibles
  useEffect(() => {
    const loadUsers = async () => {
      setLoadingUsers(true);
      try {
        const users = await getActivityUsers();
        setUsuarios(users);
      } catch (error) {
        console.error('Error al cargar usuarios:', error);
      } finally {
        setLoadingUsers(false);
      }
    };

    loadUsers();
  }, []);

  const handleFilterChange = (key: keyof ActivityFilter, value: any) => {
    const newFiltros = { ...filtros, [key]: value };
    onFiltrosChange(newFiltros);
  };

  const clearFilters = () => {
    onFiltrosChange({
      limit: filtros.limit,
      page: 1
    });
  };

  const hasActiveFilters = Boolean(
    filtros.search ||
    filtros.dateFrom ||
    filtros.dateTo ||
    filtros.userId ||
    filtros.activityType ||
    filtros.relatedType
  );

  const activeFiltersCount = [
    filtros.search,
    filtros.dateFrom,
    filtros.dateTo,
    filtros.userId,
    filtros.activityType,
    filtros.relatedType
  ].filter(Boolean).length;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header con toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500" />
          <span className="font-medium text-gray-900 dark:text-white">
            Filtros
          </span>
          {activeFiltersCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {activeFiltersCount}
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <Button
              onClick={clearFilters}
              variant="ghost"
              size="sm"
              className="text-xs"
            >
              <X className="h-3 w-3 mr-1" />
              Limpiar
            </Button>
          )}
          <Button
            onClick={() => setExpanded(!expanded)}
            variant="ghost"
            size="sm"
          >
            {expanded ? 'Ocultar' : 'Mostrar'}
          </Button>
        </div>
      </div>

      {/* Filtros expandidos */}
      {expanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t">
          {/* Búsqueda */}
          <div className="space-y-2">
            <Label htmlFor="search">Buscar en notas</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="search"
                placeholder="Buscar actividades..."
                value={filtros.search || ''}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Fecha desde */}
          <div className="space-y-2">
            <Label>Fecha desde</Label>
            <DatePicker
              date={filtros.dateFrom ? new Date(filtros.dateFrom) : undefined}
              onSelect={(date) => 
                handleFilterChange('dateFrom', date?.toISOString().split('T')[0])
              }
            />
          </div>

          {/* Fecha hasta */}
          <div className="space-y-2">
            <Label>Fecha hasta</Label>
            <DatePicker
              date={filtros.dateTo ? new Date(filtros.dateTo) : undefined}
              onSelect={(date) => 
                handleFilterChange('dateTo', date?.toISOString().split('T')[0])
              }
            />
          </div>

          {/* Tipo de actividad */}
          <div className="space-y-2">
            <Label>Tipo de actividad</Label>
            <Select
              value={filtros.activityType as string || ''}
              onValueChange={(value) => 
                handleFilterChange('activityType', value === 'all' ? undefined : value as ActivityType)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos los tipos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {Object.entries(ACTIVITY_TYPE_CONFIG).map(([type, config]) => (
                  <SelectItem key={type} value={type}>
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", config.bgColor)} />
                      {config.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Usuario */}
          <div className="space-y-2">
            <Label>Usuario</Label>
            <Select
              value={filtros.userId || ''}
              onValueChange={(value) => 
                handleFilterChange('userId', value === 'all' ? undefined : value)
              }
              disabled={loadingUsers}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos los usuarios" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los usuarios</SelectItem>
                {usuarios.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo de relación */}
          <div className="space-y-2">
            <Label>Relacionado con</Label>
            <Select
              value={filtros.relatedType || ''}
              onValueChange={(value) => 
                handleFilterChange('relatedType', value === 'all' ? undefined : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Todas las entidades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las entidades</SelectItem>
                <SelectItem value="customer">Clientes</SelectItem>
                <SelectItem value="opportunity">Oportunidades</SelectItem>
                <SelectItem value="task">Tareas</SelectItem>
                <SelectItem value="lead">Leads</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Filtros activos */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          {filtros.search && (
            <Badge variant="outline" className="flex items-center gap-1">
              Búsqueda: "{filtros.search}"
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => handleFilterChange('search', undefined)}
              />
            </Badge>
          )}
          
          {filtros.activityType && (
            <Badge variant="outline" className="flex items-center gap-1">
              Tipo: {ACTIVITY_TYPE_CONFIG[filtros.activityType as ActivityType]?.label}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => handleFilterChange('activityType', undefined)}
              />
            </Badge>
          )}
          
          {filtros.userId && (
            <Badge variant="outline" className="flex items-center gap-1">
              Usuario: {usuarios.find(u => u.id === filtros.userId)?.name}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => handleFilterChange('userId', undefined)}
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
