'use client';

import { 
  Plus, 
  Banknote,
  RefreshCw,
  Users,
  CheckCircle,
  Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TipFilters, TIP_TYPES, TipType } from './types';
import { esTipoPropina } from './propinasLogica';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useTranslations } from 'next-intl';
import { CampoFecha } from '@/components/kit/CampoFecha';

interface TipsHeaderProps {
  filters: TipFilters;
  onFiltersChange: (filters: TipFilters) => void;
  onRefresh: () => void;
  /** Sin permiso de registrar (pos.create) no se muestra «Nueva propina». */
  onNewTip?: () => void;
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
  /** Mientras se distribuye, el botón queda deshabilitado (sin doble clic). */
  distributing?: boolean;
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
  onDistributeSelected,
  distributing = false
}: TipsHeaderProps) {
  const t = useTranslations('posPropinas');
  const { formatear } = useMonedaOrganizacion();
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
      tip_type: value !== 'all' && esTipoPropina(value) ? (value as TipType) : undefined
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
                  {t('cabecera.titulo')}
                </CardTitle>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('cabecera.subtitulo')}
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {selectedCount > 0 && onDistributeSelected && (
                <Button 
                  onClick={onDistributeSelected}
                  disabled={distributing}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {t('cabecera.distribuirSeleccion', { count: selectedCount })}
                </Button>
              )}
              {onNewTip && (
              <Button
                onClick={onNewTip}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('cabecera.nueva')}
              </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('kpi.total')}</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {formatear(stats.total)}
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
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('cabecera.distribuidas')}</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {formatear(stats.distributed)}
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
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('cabecera.pendientes')}</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {formatear(stats.pending)}
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
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('kpi.cantidad')}</p>
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
                <SelectValue placeholder={t('cabecera.filtroMesero')} />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="all">{t('cabecera.todosMeseros')}</SelectItem>
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
                <SelectValue placeholder={t('cabecera.filtroEstado')} />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="all">{t('cabecera.todos')}</SelectItem>
                <SelectItem value="pending">{t('cabecera.pendientes')}</SelectItem>
                <SelectItem value="distributed">{t('cabecera.distribuidas')}</SelectItem>
              </SelectContent>
            </Select>

            <Select 
              value={filters.tip_type || 'all'}
              onValueChange={handleTypeChange}
            >
              <SelectTrigger className="w-[140px] dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <SelectValue placeholder={t('cabecera.filtroTipo')} />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="all">{t('cabecera.todos')}</SelectItem>
                {TIP_TYPES.map((tipo) => (
                  <SelectItem key={tipo} value={tipo}>{t(`tipos.${tipo}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <CampoFecha
              aria-label={t('cabecera.desde')}
              placeholder={t('cabecera.desde')}
              valor={filters.dateFrom || ''}
              onValorChange={(dia) => handleDateChange('dateFrom', dia)}
              className="w-[170px]"
            />

            <CampoFecha
              aria-label={t('cabecera.hasta')}
              placeholder={t('cabecera.hasta')}
              valor={filters.dateTo || ''}
              onValorChange={(dia) => handleDateChange('dateTo', dia)}
              className="w-[170px]"
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
