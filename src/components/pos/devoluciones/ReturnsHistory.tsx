'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { History, Calendar, DollarSign, Filter, RefreshCw, Eye, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DevolucionesService } from './devolucionesService';
import { Return, ReturnSearchFilters } from './types';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { toast } from 'sonner';
import { CampoFecha } from '@/components/kit/CampoFecha';

interface ReturnsHistoryProps {
  refreshTrigger?: number;
  branchFilter?: number | null;
}

export function ReturnsHistory({ refreshTrigger, branchFilter }: ReturnsHistoryProps) {
  const { formatear } = useMonedaOrganizacion();
  const t = useTranslations('posDevoluciones.historial');
  const tComun = useTranslations('posDevoluciones.comun');
  const { formatDate, getToday } = useFormatDate();
  // Estado conocido se traduce; uno desconocido se muestra tal cual (es un dato).
  const nombreEstado = (estado: string): string =>
    t.has(`estados.${estado}`) ? t(`estados.${estado}`) : estado;
  const [returns, setReturns] = useState<Return[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<Return | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [filters, setFilters] = useState<ReturnSearchFilters>({
    search: '',
    status: '',
    dateFrom: '',
    dateTo: ''
  });

  useEffect(() => {
    cargarHistorial();
    // Se recarga solo al pedirlo el padre o al cambiar de sucursal; los filtros se aplican con «Filtrar».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger, branchFilter]);

  const cargarHistorial = async () => {
    setLoading(true);
    try {
      const response = await DevolucionesService.obtenerHistorialDevoluciones({ ...filters, branchId: branchFilter });
      setReturns(response.data);
    } catch (error) {
      console.error('Error cargando historial:', error);
      toast.error(t('errorCarga'));
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    cargarHistorial();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const verDetalles = (returnItem: Return) => {
    setSelectedReturn(returnItem);
    setShowDetails(true);
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      processed: { 
        className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", 
        label: t('estados.processed')
      },
      pending: { 
        className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", 
        label: t('estados.pending')
      },
      cancelled: { 
        className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", 
        label: t('estados.cancelled')
      }
    };

    const variant = variants[status as keyof typeof variants] || variants.processed;
    
    return (
      <Badge className={variant.className}>
        {variant.label}
      </Badge>
    );
  };

  const exportarCSV = async () => {
    try {
      const csvData = returns.map(returnItem => ({
        [tComun('fecha')]: formatDate(returnItem.return_date),
        [tComun('idVenta')]: returnItem.sale_id,
        [tComun('totalReembolso')]: returnItem.refund_total_with_tax,
        [tComun('motivo')]: returnItem.reason,
        [tComun('estado')]: nombreEstado(returnItem.status),
        [tComun('items')]: returnItem.return_items.length
      }));

      const csvContent = [
        Object.keys(csvData[0]).join(','),
        ...csvData.map(row => Object.values(row).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('href', url);
      a.setAttribute('download', `historial-devoluciones-${getToday()}.csv`);
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast.success(t('exportado'));
    } catch {
      toast.error(t('errorExportar'));
    }
  };

  const totalReembolsado = returns.reduce((sum, ret) => sum + ret.refund_total_with_tax, 0);
  const devolucionesProcesadas = returns.filter(ret => ret.status === 'processed').length;

  return (
    <div className="space-y-4">
      {/* Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('totalDevoluciones')}</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{returns.length}</p>
              </div>
              <History className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('procesadas')}</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{devolucionesProcesadas}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <div className="w-4 h-4 bg-green-600 dark:bg-green-400 rounded-full"></div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('totalReembolsado')}</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatear(totalReembolsado)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center space-x-2 text-lg dark:text-white">
            <Filter className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span>{t('filtros')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
            <div>
              <Input
                placeholder={t('buscarPlaceholder')}
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                onKeyPress={handleKeyPress}
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
            <div>
              <CampoFecha
                aria-label={tComun('fechaDesde')}
                placeholder={tComun('fechaDesde')}
                valor={filters.dateFrom || ''}
                onValorChange={(dia) => setFilters(prev => ({ ...prev, dateFrom: dia }))}
              />
            </div>
            <div>
              <CampoFecha
                aria-label={tComun('fechaHasta')}
                placeholder={tComun('fechaHasta')}
                valor={filters.dateTo || ''}
                onValorChange={(dia) => setFilters(prev => ({ ...prev, dateTo: dia }))}
              />
            </div>
            <div>
              <Select
                value={filters.status || undefined}
                onValueChange={(value) => setFilters(prev => ({ ...prev, status: value === 'all' ? '' : value }))}
              >
                <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600">
                  <SelectValue placeholder={t('estadoPlaceholder')} />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  <SelectItem value="all">{t('todosEstados')}</SelectItem>
                  <SelectItem value="processed">{t('estados.processed')}</SelectItem>
                  <SelectItem value="pending">{t('estados.pending')}</SelectItem>
                  <SelectItem value="cancelled">{t('estados.cancelled')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex space-x-2">
              <Button 
                onClick={handleSearch}
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Filter className="h-4 w-4 mr-2" />
                )}
                {t('filtrar')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Historial */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2 dark:text-white">
              <History className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <span>{tComun('historialDevoluciones')}</span>
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={exportarCSV}
              disabled={returns.length === 0}
              className="dark:border-gray-600 dark:text-gray-300"
            >
              <Download className="h-4 w-4 mr-2" />
              {tComun('exportar')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-12 w-12 rounded dark:bg-gray-700" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-[250px] dark:bg-gray-700" />
                    <Skeleton className="h-4 w-[200px] dark:bg-gray-700" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-gray-700">
                    <TableHead className="dark:text-gray-300">{tComun('fecha')}</TableHead>
                    <TableHead className="dark:text-gray-300">{tComun('idVenta')}</TableHead>
                    <TableHead className="dark:text-gray-300">{tComun('reembolso')}</TableHead>
                    <TableHead className="dark:text-gray-300">{tComun('items')}</TableHead>
                    <TableHead className="dark:text-gray-300">{tComun('motivo')}</TableHead>
                    <TableHead className="dark:text-gray-300">{tComun('estado')}</TableHead>
                    <TableHead className="dark:text-gray-300">{tComun('acciones')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returns.map((returnItem) => (
                    <TableRow 
                      key={returnItem.id}
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 dark:border-gray-700"
                    >
                      <TableCell className="dark:text-gray-300">
                        <div className="flex items-center space-x-2">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span>{formatDate(returnItem.return_date)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <div className="font-mono text-sm">
                          {returnItem.sale_id.slice(-8)}
                        </div>
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <div className="space-y-1">
                          <div className="text-lg font-bold text-red-600 dark:text-red-400">
                            {formatear(returnItem.refund_total_with_tax)}
                          </div>
                          {returnItem.refund_tax_amount > 0 && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {tComun('subtotalMasImpuestos', { subtotal: formatear(returnItem.total_refund), impuestos: formatear(returnItem.refund_tax_amount) })}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <Badge variant="outline" className="dark:border-blue-500 dark:text-blue-400">
                          {tComun('conteoItems', { n: returnItem.return_items.length })}
                        </Badge>
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <div className="break-words whitespace-normal" title={returnItem.reason}>
                          {returnItem.reason}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(returnItem.status)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => verDetalles(returnItem)}
                          aria-label={t('verDetalles')}
                          className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {returns.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 dark:text-gray-400">
                        {t('sinResultados')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Dialog de detalles */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-4xl dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-white">{t('detalleTitulo')}</DialogTitle>
          </DialogHeader>
          {selectedReturn && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm font-medium text-gray-600 dark:text-gray-400">{tComun('fecha')}</div>
                  <div className="dark:text-gray-200">{formatDate(selectedReturn.return_date)}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-600 dark:text-gray-400">{tComun('idVenta')}</div>
                  <div className="font-mono dark:text-gray-200">{selectedReturn.sale_id.slice(-8)}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-600 dark:text-gray-400">{tComun('totalReembolso')}</div>
                  <div className="space-y-1">
                    <div className="text-lg font-bold text-red-600 dark:text-red-400">
                      {formatear(selectedReturn.refund_total_with_tax)}
                    </div>
                    {selectedReturn.refund_tax_amount > 0 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {tComun('subtotalMasImpuestos', { subtotal: formatear(selectedReturn.total_refund), impuestos: formatear(selectedReturn.refund_tax_amount) })}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-600 dark:text-gray-400">{tComun('estado')}</div>
                  {getStatusBadge(selectedReturn.status)}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">{tComun('motivo')}</div>
                <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-md dark:text-gray-200">
                  {selectedReturn.reason}
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2 dark:text-white">{t('itemsDevueltos')}</h4>
                <Table>
                  <TableHeader>
                    <TableRow className="dark:border-gray-700">
                      <TableHead className="dark:text-gray-300">{tComun('producto')}</TableHead>
                      <TableHead className="dark:text-gray-300">{tComun('cantidad')}</TableHead>
                      <TableHead className="dark:text-gray-300">{tComun('reembolso')}</TableHead>
                      <TableHead className="dark:text-gray-300">{tComun('motivo')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedReturn.return_items.map((item, index) => (
                      <TableRow key={index} className="dark:border-gray-700">
                        <TableCell className="dark:text-gray-300">
                          <div className="font-medium">{item.product_name}</div>
                        </TableCell>
                        <TableCell className="dark:text-gray-300">{item.return_quantity}</TableCell>
                        <TableCell className="dark:text-gray-300">{formatear(item.refund_amount)}</TableCell>
                        <TableCell className="dark:text-gray-300">{item.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end">
                <Button 
                  variant="outline" 
                  onClick={() => setShowDetails(false)}
                  className="dark:border-gray-600 dark:text-gray-300"
                >
                  {tComun('cerrar')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
