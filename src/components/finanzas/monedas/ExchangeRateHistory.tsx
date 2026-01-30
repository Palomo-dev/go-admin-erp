'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  TrendingUp, 
  TrendingDown, 
  History, 
  Calendar, 
  RefreshCw,
  Loader2,
  Download,
  Filter,
  Globe
} from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { useToast } from '@/components/ui/use-toast';
import { actualizarTasasDeCambioGlobal } from '@/lib/services/openexchangerates';

interface ExchangeRateRecord {
  id: string;
  code: string;
  rate_date: string;
  rate: number;
  source: string;
  base_currency_code: string;
  created_at: string;
  updated_at: string;
}

interface ExchangeRateHistoryProps {
  organizationId?: number;
}

export function ExchangeRateHistory({ organizationId: propOrgId }: ExchangeRateHistoryProps) {
  const [rates, setRates] = useState<ExchangeRateRecord[]>([]);
  const [filteredRates, setFilteredRates] = useState<ExchangeRateRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const { toast } = useToast();

  useEffect(() => {
    loadExchangeRates();
  }, []);

  useEffect(() => {
    filterRates();
  }, [rates, selectedCurrency, dateFrom, dateTo]);

  const loadExchangeRates = async () => {
    setIsLoading(true);
    try {
      // Consultar tabla currency_rates (datos reales de API OpenExchangeRates)
      const { data, error } = await supabase
        .from('currency_rates')
        .select('*')
        .order('rate_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;

      setRates(data || []);
      
      // Extraer monedas únicas
      const uniqueCurrencies = new Set<string>();
      data?.forEach(rate => {
        uniqueCurrencies.add(rate.code);
      });
      setCurrencies(Array.from(uniqueCurrencies).sort());

    } catch (error) {
      console.error('Error cargando tasas de cambio:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las tasas de cambio',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateRates = async () => {
    setIsUpdating(true);
    try {
      const result = await actualizarTasasDeCambioGlobal();
      
      if (result.success) {
        toast({
          title: 'Tasas actualizadas',
          description: result.message || `Se actualizaron ${result.updated_count || 0} tasas`,
        });
        await loadExchangeRates();
      } else {
        toast({
          title: 'Error',
          description: result.message || 'No se pudieron actualizar las tasas',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Error actualizando tasas:', error);
      toast({
        title: 'Error',
        description: error.message || 'Error al actualizar tasas de cambio',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const filterRates = () => {
    let filtered = [...rates];

    if (selectedCurrency !== 'all') {
      filtered = filtered.filter(r => r.code === selectedCurrency);
    }

    if (dateFrom) {
      filtered = filtered.filter(r => r.rate_date >= dateFrom);
    }

    if (dateTo) {
      filtered = filtered.filter(r => r.rate_date <= dateTo);
    }

    setFilteredRates(filtered);
  };

  const calculateVariation = (current: number, previous: number): { value: number; isPositive: boolean } => {
    if (!previous || previous === 0) return { value: 0, isPositive: true };
    const variation = ((current - previous) / previous) * 100;
    return { value: Math.abs(variation), isPositive: variation >= 0 };
  };

  const exportToCSV = () => {
    const headers = ['Fecha', 'Moneda Base', 'Moneda', 'Tasa', 'Fuente', 'Fecha Registro'];
    const rows = filteredRates.map(rate => [
      rate.rate_date,
      rate.base_currency_code || 'USD',
      rate.code,
      rate.rate.toString(),
      rate.source || 'openexchangerates',
      new Date(rate.created_at).toLocaleString('es-CO')
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `tasas_cambio_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    toast({
      title: 'Exportación completada',
      description: `Se exportaron ${filteredRates.length} registros`,
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatRate = (rate: number) => {
    return rate.toLocaleString('es-CO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    });
  };

  // Agrupar por moneda para mostrar estadísticas
  const getStats = () => {
    const stats: Record<string, { min: number; max: number; avg: number; count: number; latest: number }> = {};
    
    filteredRates.forEach(rate => {
      const key = rate.code;
      if (!stats[key]) {
        stats[key] = { min: rate.rate, max: rate.rate, avg: rate.rate, count: 1, latest: rate.rate };
      } else {
        stats[key].min = Math.min(stats[key].min, rate.rate);
        stats[key].max = Math.max(stats[key].max, rate.rate);
        stats[key].avg = (stats[key].avg * stats[key].count + rate.rate) / (stats[key].count + 1);
        stats[key].count++;
      }
    });

    return stats;
  };

  const stats = getStats();

  return (
    <Card className="dark:bg-gray-800/50 dark:border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <History className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Histórico de Tasas de Cambio
          <Badge variant="outline" className="ml-2 text-xs font-normal">
            <Globe className="h-3 w-3 mr-1" />
            OpenExchangeRates
          </Badge>
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button 
            variant="default" 
            size="sm" 
            onClick={handleUpdateRates} 
            disabled={isUpdating}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Globe className={`h-4 w-4 mr-1 ${isUpdating ? 'animate-pulse' : ''}`} />
            {isUpdating ? 'Actualizando...' : 'Actualizar desde API'}
          </Button>
          <Button variant="outline" size="sm" onClick={loadExchangeRates} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Recargar
          </Button>
          <Button variant="outline" size="sm" onClick={exportToCSV} disabled={filteredRates.length === 0}>
            <Download className="h-4 w-4 mr-1" />
            Exportar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filtros */}
        <div className="flex flex-wrap gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filtros:</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Label className="text-sm">Moneda:</Label>
            <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
              <SelectTrigger className="w-32 h-8 text-sm dark:bg-gray-800 dark:border-gray-600">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800">
                <SelectItem value="all">Todas</SelectItem>
                {currencies.map(currency => (
                  <SelectItem key={currency} value={currency}>{currency}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-sm">Desde:</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-36 h-8 text-sm dark:bg-gray-800 dark:border-gray-600"
            />
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-sm">Hasta:</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-36 h-8 text-sm dark:bg-gray-800 dark:border-gray-600"
            />
          </div>

          {(selectedCurrency !== 'all' || dateFrom || dateTo) && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => {
                setSelectedCurrency('all');
                setDateFrom('');
                setDateTo('');
              }}
            >
              Limpiar filtros
            </Button>
          )}
        </div>

        {/* Estadísticas por moneda */}
        {Object.keys(stats).length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(stats).slice(0, 4).map(([currency, data]) => (
              <div 
                key={currency}
                className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
              >
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="font-mono">{currency}</Badge>
                  <span className="text-xs text-gray-500">{data.count} registros</span>
                </div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatRate(data.latest)}
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Min: {formatRate(data.min)}</span>
                  <span>Max: {formatRate(data.max)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabla de histórico */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : filteredRates.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No hay registros de tasas de cambio</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden dark:border-gray-700">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-800">
                  <TableHead className="font-semibold">Fecha Efectiva</TableHead>
                  <TableHead className="font-semibold">Par</TableHead>
                  <TableHead className="font-semibold text-right">Tasa</TableHead>
                  <TableHead className="font-semibold text-center">Variación</TableHead>
                  <TableHead className="font-semibold">Fuente</TableHead>
                  <TableHead className="font-semibold">Registro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRates.slice(0, 50).map((rate, index) => {
                  const prevRate = filteredRates.find(
                    (r, i) => i > index && 
                    r.code === rate.code && 
                    r.rate_date < rate.rate_date
                  );
                  const variation = prevRate 
                    ? calculateVariation(rate.rate, prevRate.rate)
                    : null;

                  return (
                    <TableRow key={rate.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          {formatDate(rate.rate_date)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono">
                          {rate.base_currency_code || 'USD'}/{rate.code}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatRate(rate.rate)}
                      </TableCell>
                      <TableCell className="text-center">
                        {variation && variation.value > 0 ? (
                          <div className={`flex items-center justify-center gap-1 ${
                            variation.isPositive ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {variation.isPositive ? (
                              <TrendingUp className="h-4 w-4" />
                            ) : (
                              <TrendingDown className="h-4 w-4" />
                            )}
                            <span className="text-sm">{variation.value.toFixed(2)}%</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={rate.source === 'openexchangerates' ? 'default' : 'outline'}
                          className="text-xs"
                        >
                          {rate.source === 'openexchangerates' ? 'API' : rate.source || 'Manual'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-500 text-sm">
                        {new Date(rate.created_at).toLocaleString('es-CO', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {filteredRates.length > 50 && (
              <div className="p-3 text-center text-sm text-gray-500 border-t dark:border-gray-700">
                Mostrando 50 de {filteredRates.length} registros
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
