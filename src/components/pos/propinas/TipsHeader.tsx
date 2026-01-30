'use client';

import { useState } from 'react';
import { 
  Plus, 
  Search, 
  Banknote,
  RefreshCw,
  Users,
  CheckCircle,
  Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TipFilters, TIP_TYPE_LABELS, TipType } from './types';
import { formatCurrency } from '@/utils/Utils';

interface TipsHeaderProps {
  filters: TipFilters;
  onFiltersChange: (filters: TipFilters) => void;
  onRefresh: () => void;
  onNewTip: () => void;
  servers: { id: string; name: string; email: string }[];
  stats: {
    total: number;
    distributed: number;
    pending: number;
    count: number;
  };
  loading: boolean;
  selectedCount?: number;
  onDistributeSelected?: () => void;
}

export function TipsHeader({
  filters,
  onFiltersChange,
  onRefresh,
  onNewTip,
  servers,
  stats,
  loading,
  selectedCount = 0,
  onDistributeSelected
}: TipsHeaderProps) {
  const handleServerChange = (value: string) => {
    onFiltersChange({ 
      ...filters, 
      server_id: value === 'all' ? undefined : value 
    });
  };

  const handleStatusChange = (value: string) => {
    const newFilter = value === 'all' 
      ? { ...filters, is_distributed: undefined }
      : { ...filters, is_distributed: value === 'distributed' };
    onFiltersChange(newFilter);
  };

  const handleTypeChange = (value: string) => {
    onFiltersChange({ 
      ...filters, 
      tip_type: value === 'all' ? undefined : value as TipType 
    });
  };

  const handleDateChange = (field: 'dateFrom' | 'dateTo', value: string) => {
    onFiltersChange({ ...filters, [field]: value || undefined });
  };

  return (
    <div className="space-y-4">
      {/* Header Principal */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <Banknote className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <CardTitle className="dark:text-white">
                  Gestión de Propinas
                </CardTitle>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Registra y distribuye propinas del equipo
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {selectedCount > 0 && onDistributeSelected && (
                <Button 
                  onClick={onDistributeSelected}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Distribuir ({selectedCount})
                </Button>
              )}
              <Button 
                onClick={onNewTip}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nueva Propina
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total del Día</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(stats.total)}
                </p>
              </div>
              <Banknote className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Distribuidas</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {formatCurrency(stats.distributed)}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Pendientes</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {formatCurrency(stats.pending)}
                </p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Propinas Hoy</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {stats.count}
                </p>
              </div>
              <Users className="h-8 w-8 text-purple-600 dark:text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select 
              value={filters.server_id || 'all'}
              onValueChange={handleServerChange}
            >
              <SelectTrigger className="w-[180px] dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <SelectValue placeholder="Mesero" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="all">Todos los meseros</SelectItem>
                {servers.map((server) => (
                  <SelectItem key={server.id} value={server.id}>
                    {server.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select 
              value={filters.is_distributed === undefined ? 'all' : filters.is_distributed ? 'distributed' : 'pending'}
              onValueChange={handleStatusChange}
            >
              <SelectTrigger className="w-[150px] dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
                <SelectItem value="distributed">Distribuidas</SelectItem>
              </SelectContent>
            </Select>

            <Select 
              value={filters.tip_type || 'all'}
              onValueChange={handleTypeChange}
            >
              <SelectTrigger className="w-[140px] dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(TIP_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={filters.dateFrom || ''}
              onChange={(e) => handleDateChange('dateFrom', e.target.value)}
              placeholder="Desde"
              className="w-[150px] dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />

            <Input
              type="date"
              value={filters.dateTo || ''}
              onChange={(e) => handleDateChange('dateTo', e.target.value)}
              placeholder="Hasta"
              className="w-[150px] dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />

            <Button
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={loading}
              className="dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
