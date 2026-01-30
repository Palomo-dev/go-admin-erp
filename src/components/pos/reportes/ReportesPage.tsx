'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Package,
  CreditCard,
  Download,
  RefreshCw,
  ArrowLeft,
  Calendar,
  Users,
  Wallet,
  FileText,
  Loader2,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/Utils';
import { ReportesService, SalesReport, ProductReport, PaymentMethodReport, DailySalesData } from './reportesService';

export function ReportesPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filtros
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);

  // Datos
  const [salesSummary, setSalesSummary] = useState<SalesReport | null>(null);
  const [topProducts, setTopProducts] = useState<ProductReport[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodReport[]>([]);
  const [dailySales, setDailySales] = useState<DailySalesData[]>([]);
  const [cashReport, setCashReport] = useState<any>(null);

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const filters = {
        startDate,
        endDate,
        branchId: selectedBranch !== 'all' ? parseInt(selectedBranch) : undefined,
      };

      const [summary, products, payments, daily, cash, branchesData] = await Promise.all([
        ReportesService.getSalesSummary(filters),
        ReportesService.getTopProducts(filters),
        ReportesService.getPaymentMethodsReport(filters),
        ReportesService.getDailySales(filters),
        ReportesService.getCashReport(filters),
        ReportesService.getBranches(),
      ]);

      setSalesSummary(summary);
      setTopProducts(products);
      setPaymentMethods(payments);
      setDailySales(daily);
      setCashReport(cash);
      setBranches(branchesData);
    } catch (error) {
      console.error('Error cargando reportes:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los reportes',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [startDate, endDate, selectedBranch, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExportSales = () => {
    if (dailySales.length === 0) {
      toast({ title: 'Sin datos', description: 'No hay datos para exportar' });
      return;
    }
    ReportesService.exportToCSV(dailySales, 'ventas_diarias');
    toast({ title: 'Exportado', description: 'Archivo CSV descargado' });
  };

  const handleExportProducts = () => {
    if (topProducts.length === 0) {
      toast({ title: 'Sin datos', description: 'No hay datos para exportar' });
      return;
    }
    ReportesService.exportToCSV(topProducts, 'productos_mas_vendidos');
    toast({ title: 'Exportado', description: 'Archivo CSV descargado' });
  };

  const getPaymentMethodName = (method: string): string => {
    const names: Record<string, string> = {
      cash: 'Efectivo',
      card: 'Tarjeta',
      credit_card: 'Tarjeta Crédito',
      debit_card: 'Tarjeta Débito',
      transfer: 'Transferencia',
      nequi: 'Nequi',
      daviplata: 'Daviplata',
    };
    return names[method] || method;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/pos">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <BarChart3 className="h-6 w-6 text-blue-600" />
              </div>
              Reportes POS
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              POS / Reportes
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => loadData(true)} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" onClick={handleExportSales}>
            <Download className="h-4 w-4 mr-2" />
            Exportar Ventas
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-gray-700 dark:text-gray-300">Fecha Inicio</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
            <div>
              <Label className="text-gray-700 dark:text-gray-300">Fecha Fin</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
            <div>
              <Label className="text-gray-700 dark:text-gray-300">Sucursal</Label>
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="mt-1 dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue placeholder="Todas las sucursales" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las sucursales</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id.toString()}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={() => loadData(true)} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                <Calendar className="h-4 w-4 mr-2" />
                Aplicar Filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(salesSummary?.total_sales || 0)}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Ventas Totales</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <ShoppingCart className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {salesSummary?.total_transactions || 0}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Transacciones</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(salesSummary?.average_ticket || 0)}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Ticket Promedio</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <Package className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {salesSummary?.total_items_sold || 0}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Items Vendidos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos y Tablas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Productos Más Vendidos */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
              Productos Más Vendidos
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleExportProducts}>
              <Download className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topProducts.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                  No hay datos para mostrar
                </p>
              ) : (
                topProducts.slice(0, 5).map((product, index) => (
                  <div key={product.product_id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-full text-sm font-bold">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{product.product_name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{product.category_name || 'Sin categoría'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900 dark:text-white">{product.quantity_sold} uds</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{formatCurrency(product.total_revenue)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Métodos de Pago */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-blue-600" />
              Métodos de Pago
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {paymentMethods.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                  No hay datos para mostrar
                </p>
              ) : (
                paymentMethods.map((pm) => (
                  <div key={pm.method} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{getPaymentMethodName(pm.method)}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{pm.count} transacciones</p>
                    </div>
                    <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(pm.total)}</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resumen de Caja */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Wallet className="h-5 w-5 text-blue-600" />
            Resumen de Caja
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
              <p className="text-sm text-emerald-600 dark:text-emerald-400">Ventas</p>
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                {formatCurrency(cashReport?.totalVentas || 0)}
              </p>
            </div>
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <p className="text-sm text-green-600 dark:text-green-400">+ Ingresos</p>
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                {formatCurrency(cashReport?.totalIngresos || 0)}
              </p>
            </div>
            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">- Egresos</p>
              <p className="text-2xl font-bold text-red-700 dark:text-red-300">
                {formatCurrency(cashReport?.totalEgresos || 0)}
              </p>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-600 dark:text-blue-400">= Balance Total</p>
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                {formatCurrency(cashReport?.balance || 0)}
              </p>
            </div>
          </div>

          {/* Sesiones de caja */}
          <div className="mt-4">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3">Sesiones de Caja</h4>
            {cashReport?.sessions?.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                No hay sesiones en el período seleccionado
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Caja</th>
                      <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Apertura</th>
                      <th className="text-right py-2 px-3 text-gray-600 dark:text-gray-400">Saldo Inicial</th>
                      <th className="text-right py-2 px-3 text-gray-600 dark:text-gray-400">Saldo Final</th>
                      <th className="text-right py-2 px-3 text-gray-600 dark:text-gray-400">Diferencia</th>
                      <th className="text-center py-2 px-3 text-gray-600 dark:text-gray-400">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashReport?.sessions?.slice(0, 5).map((session: any) => (
                      <tr key={session.id} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 px-3 text-gray-900 dark:text-white">
                          {session.cash_registers?.name || 'Caja'}
                        </td>
                        <td className="py-2 px-3 text-gray-600 dark:text-gray-400">
                          {formatDate(session.opened_at)}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-900 dark:text-white">
                          {formatCurrency(session.opening_balance || 0)}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-900 dark:text-white">
                          {formatCurrency(session.closing_balance || 0)}
                        </td>
                        <td className={`py-2 px-3 text-right font-medium ${
                          (session.difference || 0) >= 0 
                            ? 'text-green-600 dark:text-green-400' 
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                          {formatCurrency(session.difference || 0)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            session.status === 'closed'
                              ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                              : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                          }`}>
                            {session.status === 'closed' ? 'Cerrada' : 'Abierta'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Impuestos y Descuentos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                <FileText className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(salesSummary?.total_taxes || 0)}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Impuestos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <TrendingUp className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(salesSummary?.total_discounts || 0)}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Descuentos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
