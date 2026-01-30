'use client';

import { Search, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { IdentityFilters } from './types';

interface IdentidadesFiltrosProps {
  filters: IdentityFilters;
  onFiltersChange: (filters: IdentityFilters) => void;
  channels: { id: string; name: string; type: string }[];
}

export function IdentidadesFiltros({
  filters,
  onFiltersChange,
  channels
}: IdentidadesFiltrosProps) {
  const clearFilters = () => {
    onFiltersChange({
      search: '',
      identityType: null,
      channelId: null,
      verified: null,
      showDuplicates: false
    });
  };

  const hasActiveFilters = filters.search || filters.identityType || filters.channelId || filters.verified !== null || filters.showDuplicates;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500" />
          <span className="font-medium text-gray-900 dark:text-white">Filtros</span>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            Limpiar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Búsqueda */}
        <div className="space-y-2">
          <Label className="text-sm text-gray-600 dark:text-gray-400">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Teléfono, email..."
              value={filters.search}
              onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
              className="pl-9 bg-white dark:bg-gray-800"
            />
          </div>
        </div>

        {/* Tipo de identidad */}
        <div className="space-y-2">
          <Label className="text-sm text-gray-600 dark:text-gray-400">Tipo</Label>
          <Select
            value={filters.identityType || 'all'}
            onValueChange={(v) => onFiltersChange({ ...filters, identityType: v === 'all' ? null : v })}
          >
            <SelectTrigger className="bg-white dark:bg-gray-800">
              <SelectValue placeholder="Todos los tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              <SelectItem value="phone">Teléfono</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="whatsapp_id">WhatsApp ID</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Canal */}
        <div className="space-y-2">
          <Label className="text-sm text-gray-600 dark:text-gray-400">Canal</Label>
          <Select
            value={filters.channelId || 'all'}
            onValueChange={(v) => onFiltersChange({ ...filters, channelId: v === 'all' ? null : v })}
          >
            <SelectTrigger className="bg-white dark:bg-gray-800">
              <SelectValue placeholder="Todos los canales" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los canales</SelectItem>
              {channels.map(channel => (
                <SelectItem key={channel.id} value={channel.id}>
                  {channel.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Verificado */}
        <div className="space-y-2">
          <Label className="text-sm text-gray-600 dark:text-gray-400">Estado</Label>
          <Select
            value={filters.verified === null ? 'all' : filters.verified ? 'verified' : 'unverified'}
            onValueChange={(v) => onFiltersChange({ 
              ...filters, 
              verified: v === 'all' ? null : v === 'verified' 
            })}
          >
            <SelectTrigger className="bg-white dark:bg-gray-800">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="verified">Verificados</SelectItem>
              <SelectItem value="unverified">No verificados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Mostrar duplicados */}
        <div className="space-y-2">
          <Label className="text-sm text-gray-600 dark:text-gray-400">Duplicados</Label>
          <div className="flex items-center gap-2 h-10">
            <Switch
              checked={filters.showDuplicates}
              onCheckedChange={(checked) => onFiltersChange({ ...filters, showDuplicates: checked })}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {filters.showDuplicates ? 'Mostrando duplicados' : 'Ver duplicados'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
