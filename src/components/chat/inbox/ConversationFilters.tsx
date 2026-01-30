'use client';

import React from 'react';
import { Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ConversationFilters as Filters } from '@/lib/services/conversationsService';

interface ConversationFiltersProps {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  tags: Array<{ id: string; name: string; color: string }>;
  channels: Array<{ id: string; name: string; type: string }>;
}

export default function ConversationFilters({
  filters,
  onFilterChange,
  tags,
  channels
}: ConversationFiltersProps) {
  const activeFilterCount = Object.values(filters).filter(v => v !== undefined && v !== '').length;

  const handleClearFilters = () => {
    onFilterChange({});
  };

  return (
    <div className="space-y-4">
      {/* Búsqueda */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Buscar por nombre, email, teléfono, documento o ID..."
          value={filters.search || ''}
          onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
          className="pl-10"
        />
      </div>

      {/* Filtros principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Estado */}
        <Select
          value={filters.status || 'all'}
          onValueChange={(value) =>
            onFilterChange({ ...filters, status: value === 'all' ? undefined : value })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="open">Abiertas</SelectItem>
            <SelectItem value="pending">Pendientes</SelectItem>
            <SelectItem value="closed">Cerradas</SelectItem>
          </SelectContent>
        </Select>

        {/* Prioridad */}
        <Select
          value={filters.priority || 'all'}
          onValueChange={(value) =>
            onFilterChange({ ...filters, priority: value === 'all' ? undefined : value })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Prioridad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las prioridades</SelectItem>
            <SelectItem value="low">Baja</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
            <SelectItem value="urgent">Urgente</SelectItem>
          </SelectContent>
        </Select>

        {/* Canal */}
        <Select
          value={filters.channel || 'all'}
          onValueChange={(value) =>
            onFilterChange({ ...filters, channel: value === 'all' ? undefined : value })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los canales</SelectItem>
            {channels.map((channel) => (
              <SelectItem key={channel.id} value={channel.id}>
                {channel.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Etiqueta */}
        <Select
          value={filters.tag_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({ ...filters, tag_id: value === 'all' ? undefined : value })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Etiqueta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las etiquetas</SelectItem>
            {tags.map((tag) => (
              <SelectItem key={tag.id} value={tag.id}>
                <div className="flex items-center space-x-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span>{tag.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Filtros adicionales */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={filters.unresponded ? 'default' : 'outline'}
          size="sm"
          onClick={() =>
            onFilterChange({ ...filters, unresponded: !filters.unresponded })
          }
          className={filters.unresponded ? 'bg-blue-600 hover:bg-blue-700' : ''}
        >
          Sin responder
        </Button>

        <Button
          variant={filters.my_conversations ? 'default' : 'outline'}
          size="sm"
          onClick={() =>
            onFilterChange({ ...filters, my_conversations: !filters.my_conversations })
          }
          className={filters.my_conversations ? 'bg-blue-600 hover:bg-blue-700' : ''}
        >
          Mis conversaciones
        </Button>

        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <Filter className="h-4 w-4 mr-1" />
            Limpiar filtros
            <Badge variant="secondary" className="ml-2">
              {activeFilterCount}
            </Badge>
          </Button>
        )}
      </div>
    </div>
  );
}
