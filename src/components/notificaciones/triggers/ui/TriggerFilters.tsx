/**
 * Componente para filtrar triggers
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Search, Filter, X, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
import { Label } from '@/components/ui/label';
import { cn, debounce } from '@/utils/Utils';

// Services
import eventCatalogService from '@/lib/services/eventCatalogService';

// Types
import type { EventTriggerFilter, NotificationChannel } from '@/types/eventTrigger';

export interface TriggerFiltersProps {
  filters: EventTriggerFilter;
  onFiltersChange: (filters: Partial<EventTriggerFilter>) => void;
  loading?: boolean;
  className?: string;
}

export function TriggerFilters({ 
  filters, 
  onFiltersChange, 
  loading = false,
  className 
}: TriggerFiltersProps) {
  const [searchValue, setSearchValue] = useState(filters.search || '');
  const [eventCodes, setEventCodes] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  // Debounced search
  const debouncedSearch = debounce((value: string) => {
    onFiltersChange({ search: value || undefined });
  }, 300);

  // Cargar códigos de eventos para el selector
  useEffect(() => {
    const loadEventCodes = async () => {
      try {
        const events = await eventCatalogService.getEvents();
        const codes = events.map(event => event.code);
        setEventCodes(codes);
      } catch (error) {
        console.error('Error al cargar códigos de eventos:', error);
      }
    };
    
    loadEventCodes();
  }, []);

  // Manejar cambio en búsqueda
  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    debouncedSearch(value);
  };

  // Limpiar filtros
  const handleClearFilters = () => {
    setSearchValue('');
    onFiltersChange({
      search: undefined,
      event_code: undefined,
      channel: undefined,
      active: undefined,
      priority: undefined,
      page: 1
    });
  };

  // Contar filtros activos
  const activeFiltersCount = Object.values(filters).filter(value => 
    value !== undefined && value !== '' && value !== 1 // Ignorar page: 1
  ).length;

  // Configuración de canales
  const channels: { value: NotificationChannel; label: string; icon: string }[] = [
    { value: 'email', label: 'Email', icon: '📧' },
    { value: 'whatsapp', label: 'WhatsApp', icon: '📱' },
    { value: 'webhook', label: 'Webhook', icon: '🔗' },
    { value: 'push', label: 'Push', icon: '🔔' },
    { value: 'sms', label: 'SMS', icon: '💬' }
  ];

  // Prioridades disponibles
  const priorities = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* Header con búsqueda y toggle */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Búsqueda */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar triggers por nombre o evento..."
                value={searchValue}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
                disabled={loading}
              />
              {searchValue && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                  onClick={() => handleSearchChange('')}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>

            {/* Controles */}
            <div className="flex items-center gap-2">
              {/* Badge de filtros activos */}
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="px-2 py-1">
                  {activeFiltersCount} filtro{activeFiltersCount !== 1 ? 's' : ''}
                </Badge>
              )}
              
              {/* Toggle filtros avanzados */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-2"
              >
                <Filter className="h-4 w-4" />
                Filtros
              </Button>

              {/* Limpiar filtros */}
              {activeFiltersCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                  disabled={loading}
                >
                  <X className="h-4 w-4 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>
          </div>

          {/* Filtros expandidos */}
          {isExpanded && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t">
              {/* Evento */}
              <div className="space-y-2">
                <Label htmlFor="event-filter">Evento</Label>
                <Select
                  value={filters.event_code || ''}
                  onValueChange={(value) => 
                    onFiltersChange({ event_code: value || undefined, page: 1 })
                  }
                  disabled={loading}
                >
                  <SelectTrigger id="event-filter">
                    <SelectValue placeholder="Todos los eventos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos los eventos</SelectItem>
                    {eventCodes.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Canal */}
              <div className="space-y-2">
                <Label htmlFor="channel-filter">Canal</Label>
                <Select
                  value={filters.channel || ''}
                  onValueChange={(value) => 
                    onFiltersChange({ channel: (value as NotificationChannel) || undefined, page: 1 })
                  }
                  disabled={loading}
                >
                  <SelectTrigger id="channel-filter">
                    <SelectValue placeholder="Todos los canales" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos los canales</SelectItem>
                    {channels.map((channel) => (
                      <SelectItem key={channel.value} value={channel.value}>
                        <div className="flex items-center gap-2">
                          <span>{channel.icon}</span>
                          <span>{channel.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Estado */}
              <div className="space-y-2">
                <Label htmlFor="active-filter">Estado</Label>
                <Select
                  value={filters.active !== undefined ? String(filters.active) : ''}
                  onValueChange={(value) => 
                    onFiltersChange({ 
                      active: value === '' ? undefined : value === 'true',
                      page: 1 
                    })
                  }
                  disabled={loading}
                >
                  <SelectTrigger id="active-filter">
                    <SelectValue placeholder="Todos los estados" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos los estados</SelectItem>
                    <SelectItem value="true">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <span>Activos</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="false">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-gray-500 rounded-full" />
                        <span>Inactivos</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Prioridad */}
              <div className="space-y-2">
                <Label htmlFor="priority-filter">Prioridad</Label>
                <Select
                  value={filters.priority ? String(filters.priority) : ''}
                  onValueChange={(value) => 
                    onFiltersChange({ 
                      priority: value ? parseInt(value) : undefined,
                      page: 1 
                    })
                  }
                  disabled={loading}
                >
                  <SelectTrigger id="priority-filter">
                    <SelectValue placeholder="Todas las prioridades" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todas las prioridades</SelectItem>
                    {priorities.map((priority) => (
                      <SelectItem key={priority} value={String(priority)}>
                        Prioridad {priority}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default TriggerFilters;
