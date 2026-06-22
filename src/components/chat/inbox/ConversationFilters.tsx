'use client';

import React from 'react';
import { Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SearchSelect } from '@/components/ui/search-select';
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
        <SearchSelect
          options={[
            { value: 'open', label: 'Abiertas' },
            { value: 'pending', label: 'Pendientes' },
            { value: 'closed', label: 'Cerradas' },
          ]}
          value={filters.status || 'all'}
          onValueChange={(value) =>
            onFilterChange({ ...filters, status: value === 'all' ? undefined : value })
          }
          placeholder="Estado"
          searchPlaceholder="Buscar estado..."
          emptyText="No se encontraron estados"
          noneLabel="Todos los estados"
          noneValue="all"
        />

        {/* Prioridad */}
        <SearchSelect
          options={[
            { value: 'low', label: 'Baja' },
            { value: 'normal', label: 'Normal' },
            { value: 'high', label: 'Alta' },
            { value: 'urgent', label: 'Urgente' },
          ]}
          value={filters.priority || 'all'}
          onValueChange={(value) =>
            onFilterChange({ ...filters, priority: value === 'all' ? undefined : value })
          }
          placeholder="Prioridad"
          searchPlaceholder="Buscar prioridad..."
          emptyText="No se encontraron prioridades"
          noneLabel="Todas las prioridades"
          noneValue="all"
        />

        {/* Canal */}
        <SearchSelect
          options={channels.map((channel) => ({ value: channel.id, label: channel.name, sublabel: channel.type }))}
          value={filters.channel || 'all'}
          onValueChange={(value) =>
            onFilterChange({ ...filters, channel: value === 'all' ? undefined : value })
          }
          placeholder="Canal"
          searchPlaceholder="Buscar canal..."
          emptyText="No se encontraron canales"
          noneLabel="Todos los canales"
          noneValue="all"
        />

        {/* Etiqueta */}
        <SearchSelect
          options={tags.map((tag) => ({ value: tag.id, label: tag.name }))}
          value={filters.tag_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({ ...filters, tag_id: value === 'all' ? undefined : value })
          }
          placeholder="Etiqueta"
          searchPlaceholder="Buscar etiqueta..."
          emptyText="No se encontraron etiquetas"
          noneLabel="Todas las etiquetas"
          noneValue="all"
        />
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
