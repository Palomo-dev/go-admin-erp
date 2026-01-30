'use client';

import { Search, Filter, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SessionFilters } from '@/lib/services/widgetSessionsService';

interface SessionsFiltersProps {
  filters: SessionFilters;
  channels: { id: string; name: string; type: string }[];
  onFiltersChange: (filters: SessionFilters) => void;
  onClearFilters: () => void;
}

export default function SessionsFilters({
  filters,
  channels,
  onFiltersChange,
  onClearFilters
}: SessionsFiltersProps) {
  const hasFilters = filters.status || filters.channelId || filters.hasCustomer !== undefined || filters.search;

  return (
    <div className="p-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={filters.search || ''}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value || undefined })}
            placeholder="Buscar por anon_id, página, referrer..."
            className="pl-10 bg-white dark:bg-gray-800"
          />
        </div>

        <Select
          value={filters.status || 'all'}
          onValueChange={(v) => onFiltersChange({ ...filters, status: v === 'all' ? undefined : v as any })}
        >
          <SelectTrigger className="w-[150px] bg-white dark:bg-gray-800">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">En línea</SelectItem>
            <SelectItem value="expired">Expiradas</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.channelId || 'all'}
          onValueChange={(v) => onFiltersChange({ ...filters, channelId: v === 'all' ? undefined : v })}
        >
          <SelectTrigger className="w-[180px] bg-white dark:bg-gray-800">
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los canales</SelectItem>
            {channels.map((ch) => (
              <SelectItem key={ch.id} value={ch.id}>
                {ch.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.hasCustomer === undefined ? 'all' : filters.hasCustomer ? 'yes' : 'no'}
          onValueChange={(v) => onFiltersChange({ 
            ...filters, 
            hasCustomer: v === 'all' ? undefined : v === 'yes' 
          })}
        >
          <SelectTrigger className="w-[150px] bg-white dark:bg-gray-800">
            <SelectValue placeholder="Cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="yes">Con cliente</SelectItem>
            <SelectItem value="no">Anónimas</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClearFilters}
            className="text-gray-500"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
