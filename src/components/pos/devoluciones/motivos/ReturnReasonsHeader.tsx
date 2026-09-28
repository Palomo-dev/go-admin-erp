'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { 
  Plus, 
  Upload, 
  Download, 
  ArrowLeft, 
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
import { ReturnReasonFilters } from '../types';

interface ReturnReasonsHeaderProps {
  filters: ReturnReasonFilters;
  onFiltersChange: (filters: ReturnReasonFilters) => void;
  onNewClick: () => void;
  onImportClick: () => void;
  onExportClick: () => void;
  onRefresh: () => void;
  totalReasons: number;
  activeReasons: number;
  loading: boolean;
}

export function ReturnReasonsHeader({
  filters,
  onFiltersChange,
  onNewClick,
  onImportClick,
  onExportClick,
  onRefresh,
  totalReasons,
  activeReasons,
  loading
}: ReturnReasonsHeaderProps) {
  const t = useTranslations('posDevoluciones.motivos.encabezado');
  const handleSearchChange = (value: string) => {
    onFiltersChange({ ...filters, search: value });
  };

  const handleStatusChange = (value: string) => {
    const newFilter = value === 'all' 
      ? { ...filters, is_active: undefined }
      : { ...filters, is_active: value === 'active' };
    onFiltersChange(newFilter);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onRefresh();
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Principal */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center space-x-4">
              <Link href="/app/pos/devoluciones">
                <Button variant="ghost" size="icon" className="dark:hover:bg-gray-700" aria-label={t('volver')}>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Tag className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle className="dark:text-white">
                  {t('titulo')}
                </CardTitle>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('descripcion')}
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onImportClick}
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:hover:bg-gray-600"
              >
                <Upload className="h-4 w-4 mr-2" />
                {t('importar')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onExportClick}
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:hover:bg-gray-600"
              >
                <Download className="h-4 w-4 mr-2" />
                {t('exportar')}
              </Button>
              <Button 
                onClick={onNewClick}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('nuevo')}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Métricas y Filtros */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* Total */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('total')}</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {totalReasons}
                </p>
              </div>
              <Tag className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </CardContent>
        </Card>

        {/* Activos */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('activos')}</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {activeReasons}
                </p>
              </div>
              <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <div className="w-4 h-4 bg-green-600 dark:bg-green-400 rounded-full"></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Búsqueda */}
        <Card className="md:col-span-2 dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={filters.search || ''}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={t('buscarPlaceholder')}
                  className="pl-10 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <Select 
                value={filters.is_active === undefined ? 'all' : filters.is_active ? 'active' : 'inactive'}
                onValueChange={handleStatusChange}
              >
                <SelectTrigger className="w-[140px] dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder={t('estadoPlaceholder')} />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  <SelectItem value="all">{t('todos')}</SelectItem>
                  <SelectItem value="active">{t('activos')}</SelectItem>
                  <SelectItem value="inactive">{t('inactivos')}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={onRefresh}
                disabled={loading}
                aria-label={t('actualizar')}
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
