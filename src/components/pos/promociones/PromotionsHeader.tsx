'use client';

import Link from 'next/link';
import { 
  Plus, 
  Upload, 
  Download, 
  Search, 
  Filter,
  Tag,
  RefreshCw
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
import { PromotionFilters, PROMOTION_TYPE_LABELS } from './types';

interface PromotionsHeaderProps {
  filters: PromotionFilters;
  onFiltersChange: (filters: PromotionFilters) => void;
  onRefresh: () => void;
  totalPromotions: number;
  activePromotions: number;
  loading: boolean;
}

export function PromotionsHeader({
  filters,
  onFiltersChange,
  onRefresh,
  totalPromotions,
  activePromotions,
  loading
}: PromotionsHeaderProps) {
  const handleSearchChange = (value: string) => {
    onFiltersChange({ ...filters, search: value });
  };

  const handleStatusChange = (value: string) => {
    const newFilter = value === 'all' 
      ? { ...filters, is_active: undefined }
      : { ...filters, is_active: value === 'active' };
    onFiltersChange(newFilter);
  };

  const handleTypeChange = (value: string) => {
    const newFilter = value === 'all'
      ? { ...filters, promotion_type: undefined }
      : { ...filters, promotion_type: value as any };
    onFiltersChange(newFilter);
  };

  return (
    <div className="space-y-4">
      {/* Header Principal */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Tag className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle className="dark:text-white">
                  Promociones
                </CardTitle>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Administra descuentos, ofertas y promociones especiales
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/app/pos/cupones">
                <Button variant="outline" size="sm" className="dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:hover:bg-gray-600">
                  Cupones
                </Button>
              </Link>
              <Link href="/app/pos/promociones/nuevo">
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Promoción
                </Button>
              </Link>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Métricas y Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Promociones</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {totalPromotions}
                </p>
              </div>
              <Tag className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </CardContent>
        </Card>

        {/* Activas */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Activas</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {activePromotions}
                </p>
              </div>
              <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <div className="w-4 h-4 bg-green-600 dark:bg-green-400 rounded-full"></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filtros */}
        <Card className="md:col-span-2 dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={filters.search || ''}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Buscar promociones..."
                  className="pl-10 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <Select 
                value={filters.is_active === undefined ? 'all' : filters.is_active ? 'active' : 'inactive'}
                onValueChange={handleStatusChange}
              >
                <SelectTrigger className="w-[130px] dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Activas</SelectItem>
                  <SelectItem value="inactive">Inactivas</SelectItem>
                </SelectContent>
              </Select>
              <Select 
                value={filters.promotion_type || 'all'}
                onValueChange={handleTypeChange}
              >
                <SelectTrigger className="w-[140px] dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(PROMOTION_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
    </div>
  );
}
