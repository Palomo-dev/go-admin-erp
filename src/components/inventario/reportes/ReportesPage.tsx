'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { Tabs,
  TabsContent,
  TabsList,
  TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import {
  BarChart3,
  RefreshCw,
  ArrowLeft,
  Download,
  Package,
  TrendingUp,
  Truck,
  FileText
} from 'lucide-react';
import { ReportesService } from './ReportesService';
import { ReportesPagination, usePagination } from './ReportesPagination';
import { StockReport, RotationReport, SupplierPurchaseReport, ReportFilter } from './types';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { todayInTz, toPlainDate } from '@/lib/utils/timezone';
import { Skeleton } from '@/components/ui/skeleton';
import { useBranch, ALL_BRANCHES } from '@/lib/context/BranchContext';
import { BranchBadge } from '@/components/inventario/BranchBadge';

export function ReportesPage() {
  const { toast } = useToast();
  const tk = useTranslations('inventarioKardex.reportes');
  const { branchFilter, setSelectedBranch } = useBranch();
  const { formatDate } = useFormatDate();
  const { timezone } = useOrgTimezone();
  const { formatear } = useMonedaOrganizacion();
  const [activeTab, setActiveTab] = useState('stock');
  const [loading, setLoading] = useState(false);
  
  // Data states
  const [stockData, setStockData] = useState<StockReport[]>([]);
  const [rotacionData, setRotacionData] = useState<RotationReport[]>([]);
  const [comprasData, setComprasData] = useState<SupplierPurchaseReport[]>([]);
  
  // Filters
  const [categorias, setCategorias] = useState<{ id: number; name: string }[]>([]);
  const [sucursales, setSucursales] = useState<{ id: number; name: string }[]>([]);
  
  const [filters, setFilters] = useState<ReportFilter>({
    dateFrom: toPlainDate(new Date(new Date().setMonth(new Date().getMonth() - 1)), timezone),
    dateTo: todayInTz(timezone),
  });

  // Sincronizar el filtro de sucursal local con el contexto global de sucursal
  useEffect(() => {
    setFilters(prev => ({ ...prev, branchId: branchFilter ?? undefined }));
  }, [branchFilter]);

  const loadFiltersData = useCallback(async () => {
    try {
      const [cats, branches] = await Promise.all([
        ReportesService.obtenerCategorias(),
        ReportesService.obtenerSucursales(),
      ]);
      setCategorias(cats);
      setSucursales(branches);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error cargando filtros:', errorMessage, error);
    }
  }, []);

  useEffect(() => {
    loadFiltersData();
  }, [loadFiltersData]);

  const loadReport = useCallback(async (reportType: string) => {
    setLoading(true);
    try {
      switch (reportType) {
        case 'stock':
          const stock = await ReportesService.obtenerReporteStock(filters);
          setStockData(stock);
          break;
        case 'rotacion':
          const rotacion = await ReportesService.obtenerReporteRotacion(filters);
          setRotacionData(rotacion);
          break;
        case 'compras':
          const compras = await ReportesService.obtenerReporteComprasProveedor(filters);
          setComprasData(compras);
          break;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error cargando reporte:', errorMessage, error);
      toast({
        title: 'Error',
        description: errorMessage || 'No se pudo cargar el reporte',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    // El kardex vive en /app/inventario/kardex (saldo corrido en el servidor, B1).
    if (activeTab === 'kardex') return;
    loadReport(activeTab);
  }, [activeTab, loadReport]);

  // `exportToCSV` es async desde que el dia del nombre de archivo lo resuelve
  // el servicio con la zona de la organizacion. Sin el `await`, el aviso
  // saldria antes de que el archivo se hubiera generado.
  const handleExportCSV = async (
    data: StockReport[] | RotationReport[] | SupplierPurchaseReport[],
    filename: string
  ) => {
    await ReportesService.exportToCSV(data, filename);
    toast({ title: 'Reporte exportado' });
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      normal: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      low: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      out: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      excess: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    };
    const labels: Record<string, string> = {
      normal: 'Normal',
      low: 'Bajo',
      out: 'Agotado',
      excess: 'Exceso',
    };
    return <Badge className={styles[status] || ''}>{labels[status] || status}</Badge>;
  };

  // Paginación para cada tabla
  const stockPagination = usePagination(stockData, 10);
  const rotacionPagination = usePagination(rotacionData, 10);
  const comprasPagination = usePagination(comprasData, 10);

  // Calcular resúmenes
  const stockSummary = {
    totalItems: stockData.length,
    totalValue: stockData.reduce((sum, s) => sum + s.total_value, 0),
    lowStock: stockData.filter(s => s.status === 'low').length,
    outOfStock: stockData.filter(s => s.status === 'out').length,
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/inventario">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <BarChart3 className="h-6 w-6 text-blue-600" />
              </div>
              Reportes de Inventario
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Inventario / Reportes - Análisis y exportación
            </p>
          </div>
        </div>
      </div>

      <BranchBadge />

      {/* Filtros generales */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Desde</Label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Hasta</Label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Sucursal</Label>
              <Select
                value={filters.branchId?.toString() || 'all'}
                onValueChange={(v) => setSelectedBranch(v === 'all' ? ALL_BRANCHES : parseInt(v))}
              >
                <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las sucursales</SelectItem>
                  {sucursales.map(s => (
                    <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Categoría</Label>
              <Select
                value={filters.categoryId?.toString() || 'all'}
                onValueChange={(v) => setFilters(prev => ({ ...prev, categoryId: v === 'all' ? undefined : parseInt(v) }))}
              >
                <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {categorias.map(c => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs de reportes */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-white dark:bg-gray-800 p-1">
          <TabsTrigger value="stock" className="data-[state=active]:bg-blue-100 dark:data-[state=active]:bg-blue-900/30">
            <Package className="h-4 w-4 mr-2" />
            Stock
          </TabsTrigger>
          <TabsTrigger value="kardex" className="data-[state=active]:bg-blue-100 dark:data-[state=active]:bg-blue-900/30">
            <FileText className="h-4 w-4 mr-2" />
            Kardex
          </TabsTrigger>
          <TabsTrigger value="rotacion" className="data-[state=active]:bg-blue-100 dark:data-[state=active]:bg-blue-900/30">
            <TrendingUp className="h-4 w-4 mr-2" />
            Rotación
          </TabsTrigger>
          <TabsTrigger value="compras" className="data-[state=active]:bg-blue-100 dark:data-[state=active]:bg-blue-900/30">
            <Truck className="h-4 w-4 mr-2" />
            Compras
          </TabsTrigger>
        </TabsList>

        {/* Stock Report */}
        <TabsContent value="stock" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="pt-4">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stockSummary.totalItems}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Productos</p>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="pt-4">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatear(stockSummary.totalValue)}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Valor total</p>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="pt-4">
                <p className="text-2xl font-bold text-yellow-600">{stockSummary.lowStock}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Stock bajo</p>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="pt-4">
                <p className="text-2xl font-bold text-red-600">{stockSummary.outOfStock}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Agotados</p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                Reporte de Stock
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => loadReport('stock')} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Actualizar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportCSV(stockData, 'reporte_stock')}
                  disabled={stockData.length === 0}
                >
                  <Download className="h-4 w-4 mr-2" />
                  CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Skeleton className="h-8 w-8 mx-auto" /></div>
              ) : stockData.length === 0 ? (
                <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay datos de stock</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow className="dark:border-gray-700">
                        <TableHead className="dark:text-gray-300">Producto</TableHead>
                        <TableHead className="dark:text-gray-300">SKU</TableHead>
                        <TableHead className="dark:text-gray-300">Categoría</TableHead>
                        <TableHead className="dark:text-gray-300 text-center">Stock</TableHead>
                        <TableHead className="dark:text-gray-300 text-center">Mín</TableHead>
                        <TableHead className="dark:text-gray-300 text-right">Costo Unit.</TableHead>
                        <TableHead className="dark:text-gray-300 text-right">Valor Total</TableHead>
                        <TableHead className="dark:text-gray-300 text-center">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockPagination.paginatedData.map((item, idx) => (
                        <TableRow key={idx} className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <TableCell className="font-medium dark:text-white">{item.product_name}</TableCell>
                          <TableCell className="font-mono text-sm dark:text-gray-300">{item.sku}</TableCell>
                          <TableCell className="dark:text-gray-300">{item.category_name}</TableCell>
                          <TableCell className="text-center dark:text-gray-300">{item.quantity}</TableCell>
                          <TableCell className="text-center dark:text-gray-300">{item.min_stock}</TableCell>
                          <TableCell className="text-right dark:text-gray-300">{formatear(item.unit_cost)}</TableCell>
                          <TableCell className="text-right font-medium dark:text-white">{formatear(item.total_value)}</TableCell>
                          <TableCell className="text-center">{getStatusBadge(item.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <ReportesPagination
                    currentPage={stockPagination.currentPage}
                    totalPages={stockPagination.totalPages}
                    pageSize={stockPagination.pageSize}
                    totalItems={stockPagination.totalItems}
                    onPageChange={stockPagination.handlePageChange}
                    onPageSizeChange={stockPagination.handlePageSizeChange}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Kardex: el tercer kardex se retiró (INVENTARIO-PLAN §3.3). El único es /app/inventario/kardex,
            con el saldo corrido calculado en el servidor (fn_kardex_saldo_corrido). */}
        <TabsContent value="kardex" className="space-y-4">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">{tk('titulo')}</CardTitle>
              <CardDescription className="dark:text-gray-400">{tk('descripcion')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/app/inventario/kardex">
                  <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
                  {tk('abrir')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rotación */}
        <TabsContent value="rotacion" className="space-y-4">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                  Reporte de Rotación
                </CardTitle>
                <CardDescription className="dark:text-gray-400">
                  Análisis de rotación de inventario
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => loadReport('rotacion')} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Actualizar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportCSV(rotacionData, 'rotacion')}
                  disabled={rotacionData.length === 0}
                >
                  <Download className="h-4 w-4 mr-2" />
                  CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Skeleton className="h-8 w-8 mx-auto" /></div>
              ) : rotacionData.length === 0 ? (
                <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay datos de rotación</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow className="dark:border-gray-700">
                        <TableHead className="dark:text-gray-300">Producto</TableHead>
                        <TableHead className="dark:text-gray-300">SKU</TableHead>
                        <TableHead className="dark:text-gray-300">Categoría</TableHead>
                        <TableHead className="dark:text-gray-300 text-center">Vendidos</TableHead>
                        <TableHead className="dark:text-gray-300 text-center">Comprados</TableHead>
                        <TableHead className="dark:text-gray-300 text-center">Índice Rotación</TableHead>
                        <TableHead className="dark:text-gray-300 text-center">Días Prom.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rotacionPagination.paginatedData.map((item) => (
                        <TableRow key={item.product_id} className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <TableCell className="font-medium dark:text-white">{item.product_name}</TableCell>
                          <TableCell className="font-mono text-sm dark:text-gray-300">{item.sku}</TableCell>
                          <TableCell className="dark:text-gray-300">{item.category_name}</TableCell>
                          <TableCell className="text-center dark:text-gray-300">{item.total_sold}</TableCell>
                          <TableCell className="text-center dark:text-gray-300">{item.total_purchased}</TableCell>
                          <TableCell className="text-center">
                            <Badge className={item.rotation_index > 1 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'}>
                              {item.rotation_index}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center dark:text-gray-300">{item.average_days_in_stock}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <ReportesPagination
                    currentPage={rotacionPagination.currentPage}
                    totalPages={rotacionPagination.totalPages}
                    pageSize={rotacionPagination.pageSize}
                    totalItems={rotacionPagination.totalItems}
                    onPageChange={rotacionPagination.handlePageChange}
                    onPageSizeChange={rotacionPagination.handlePageSizeChange}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Compras por Proveedor */}
        <TabsContent value="compras" className="space-y-4">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                  Compras por Proveedor
                </CardTitle>
                <CardDescription className="dark:text-gray-400">
                  Resumen de compras por proveedor
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => loadReport('compras')} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Actualizar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportCSV(comprasData, 'compras_proveedor')}
                  disabled={comprasData.length === 0}
                >
                  <Download className="h-4 w-4 mr-2" />
                  CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Skeleton className="h-8 w-8 mx-auto" /></div>
              ) : comprasData.length === 0 ? (
                <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                  <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay datos de compras</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow className="dark:border-gray-700">
                        <TableHead className="dark:text-gray-300">Proveedor</TableHead>
                        <TableHead className="dark:text-gray-300 text-center">Órdenes</TableHead>
                        <TableHead className="dark:text-gray-300 text-right">Total Compras</TableHead>
                        <TableHead className="dark:text-gray-300 text-right">Prom. Orden</TableHead>
                        <TableHead className="dark:text-gray-300">Última Compra</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comprasPagination.paginatedData.map((item) => (
                        <TableRow key={item.supplier_id} className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <TableCell className="font-medium dark:text-white">{item.supplier_name}</TableCell>
                          <TableCell className="text-center dark:text-gray-300">{item.total_orders}</TableCell>
                          <TableCell className="text-right font-medium dark:text-white">{formatear(item.total_amount)}</TableCell>
                          <TableCell className="text-right dark:text-gray-300">{formatear(item.average_order)}</TableCell>
                          <TableCell className="dark:text-gray-300">{item.last_purchase_date ? formatDate(item.last_purchase_date) : '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <ReportesPagination
                    currentPage={comprasPagination.currentPage}
                    totalPages={comprasPagination.totalPages}
                    pageSize={comprasPagination.pageSize}
                    totalItems={comprasPagination.totalItems}
                    onPageChange={comprasPagination.handlePageChange}
                    onPageSizeChange={comprasPagination.handlePageSizeChange}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
