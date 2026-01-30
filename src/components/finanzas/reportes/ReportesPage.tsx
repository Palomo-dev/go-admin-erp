'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  Download,
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  Wallet,
  CreditCard,
  Building2,
  Receipt,
  PiggyBank,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  FileText,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  Percent,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency, formatDate } from '@/utils/Utils';
import {
  reportesFinancierosService,
  ReportSummary,
  DateRange,
} from '@/lib/services/reportesFinancierosService';

type RangeOption = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

const rangeOptions: { value: RangeOption; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mes' },
  { value: 'quarter', label: 'Este trimestre' },
  { value: 'year', label: 'Este año' },
];

function getDateRange(option: RangeOption): DateRange {
  const now = new Date();
  const from = new Date();

  switch (option) {
    case 'today':
      from.setHours(0, 0, 0, 0);
      break;
    case 'week':
      from.setDate(now.getDate() - 7);
      break;
    case 'month':
      from.setDate(1);
      break;
    case 'quarter':
      from.setMonth(Math.floor(now.getMonth() / 3) * 3, 1);
      break;
    case 'year':
      from.setMonth(0, 1);
      break;
    default:
      from.setDate(1);
  }

  return {
    from: from.toISOString(),
    to: now.toISOString(),
  };
}

export function ReportesPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [rangeOption, setRangeOption] = useState<RangeOption>('month');
  const [reports, setReports] = useState<ReportSummary | null>(null);

  const loadReports = useCallback(async () => {
    setIsLoading(true);
    try {
      const dateRange = getDateRange(rangeOption);
      const data = await reportesFinancierosService.getReportSummary(dateRange);
      setReports(data);
    } catch (error) {
      console.error('Error loading reports:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los reportes',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [rangeOption]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleExport = (reportType: string) => {
    toast({
      title: 'Exportando',
      description: `Generando reporte de ${reportType}...`,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/finanzas">
            <Button variant="ghost" size="icon" className="hover:bg-gray-100 dark:hover:bg-gray-800">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Reportes Financieros
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Hub de informes y análisis financiero
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={rangeOption} onValueChange={(v) => setRangeOption(v as RangeOption)}>
            <SelectTrigger className="w-[180px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              {rangeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={loadReports} className="dark:border-gray-700">
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Report Cards Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* P&G Card */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleExport('P&G')}>
                <Download className="h-4 w-4" />
              </Button>
            </div>
            <CardTitle className="text-lg text-gray-900 dark:text-white">
              Estado de Resultados (P&G)
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-gray-400">
              Ingresos, costos y utilidades
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500 dark:text-gray-400">Ingresos</span>
              <span className="font-semibold text-green-600 dark:text-green-400">
                {formatCurrency(reports?.pnl.ingresos || 0)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500 dark:text-gray-400">Costos</span>
              <span className="font-semibold text-red-600 dark:text-red-400">
                {formatCurrency(reports?.pnl.costos || 0)}
              </span>
            </div>
            <div className="border-t dark:border-gray-700 pt-2 flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Utilidad Neta</span>
              <span className={`font-bold ${(reports?.pnl.utilidadNeta || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(reports?.pnl.utilidadNeta || 0)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Percent className="h-3 w-3" />
              Margen: {(reports?.pnl.margenNeto || 0).toFixed(1)}%
            </div>
          </CardContent>
        </Card>

        {/* Cash Flow Card */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Wallet className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleExport('Flujo de Caja')}>
                <Download className="h-4 w-4" />
              </Button>
            </div>
            <CardTitle className="text-lg text-gray-900 dark:text-white">
              Flujo de Caja
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-gray-400">
              Movimiento de efectivo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <ArrowUpRight className="h-3 w-3 text-green-500" />
                Ingresos
              </span>
              <span className="font-semibold text-green-600 dark:text-green-400">
                {formatCurrency(reports?.cashFlow.ingresos || 0)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <ArrowDownRight className="h-3 w-3 text-red-500" />
                Egresos
              </span>
              <span className="font-semibold text-red-600 dark:text-red-400">
                {formatCurrency(reports?.cashFlow.egresos || 0)}
              </span>
            </div>
            <div className="border-t dark:border-gray-700 pt-2 flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Saldo Final</span>
              <span className={`font-bold ${(reports?.cashFlow.saldoFinal || 0) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {formatCurrency(reports?.cashFlow.saldoFinal || 0)}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
              <span>{reports?.cashFlow.movimientosCaja || 0} mov. caja</span>
              <span>{reports?.cashFlow.transaccionesBanco || 0} trans. banco</span>
            </div>
          </CardContent>
        </Card>

        {/* Cartera Card */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <CreditCard className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleExport('Cartera')}>
                <Download className="h-4 w-4" />
              </Button>
            </div>
            <CardTitle className="text-lg text-gray-900 dark:text-white">
              Cartera
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-gray-400">
              Cuentas por cobrar y pagar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500 dark:text-gray-400">Por Cobrar</span>
              <span className="font-semibold text-green-600 dark:text-green-400">
                {formatCurrency(reports?.cartera.totalPorCobrar || 0)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500 dark:text-gray-400">Por Pagar</span>
              <span className="font-semibold text-red-600 dark:text-red-400">
                {formatCurrency(reports?.cartera.totalPorPagar || 0)}
              </span>
            </div>
            {(reports?.cartera.carteraVencida || 0) > 0 && (
              <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-600 dark:text-red-400">
                <AlertTriangle className="h-3 w-3" />
                Vencida: {formatCurrency(reports?.cartera.carteraVencida || 0)}
              </div>
            )}
            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
              <span>{reports?.cartera.clientesConDeuda || 0} clientes</span>
              <span>{reports?.cartera.proveedoresConDeuda || 0} proveedores</span>
            </div>
          </CardContent>
        </Card>

        {/* Taxes Card */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Receipt className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleExport('Impuestos')}>
                <Download className="h-4 w-4" />
              </Button>
            </div>
            <CardTitle className="text-lg text-gray-900 dark:text-white">
              Impuestos
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-gray-400">
              IVA y retenciones
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500 dark:text-gray-400">IVA Recaudado</span>
              <span className="font-semibold text-purple-600 dark:text-purple-400">
                {formatCurrency(reports?.taxes.ivaRecaudado || 0)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500 dark:text-gray-400">IVA Pagado</span>
              <span className="font-semibold text-gray-600 dark:text-gray-300">
                {formatCurrency(reports?.taxes.ivaPagado || 0)}
              </span>
            </div>
            <div className="border-t dark:border-gray-700 pt-2 flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Saldo IVA</span>
              <span className={`font-bold ${(reports?.taxes.totalImpuestos || 0) >= 0 ? 'text-purple-600' : 'text-green-600'}`}>
                {formatCurrency(reports?.taxes.totalImpuestos || 0)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Cash Card */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <PiggyBank className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleExport('Caja')}>
                <Download className="h-4 w-4" />
              </Button>
            </div>
            <CardTitle className="text-lg text-gray-900 dark:text-white">
              Caja
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-gray-400">
              Estado de cajas y arqueos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500 dark:text-gray-400">Total en Caja</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 text-lg">
                {formatCurrency(reports?.cash.totalEnCaja || 0)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
                <span className="text-gray-500 dark:text-gray-400">Sesiones</span>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {reports?.cash.sesionesAbiertas || 0} abiertas
                </p>
              </div>
              <div className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
                <span className="text-gray-500 dark:text-gray-400">Mov. Hoy</span>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {reports?.cash.movimientosHoy || 0}
                </p>
              </div>
            </div>
            {reports?.cash.ultimoArqueo && (
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <CheckCircle className="h-3 w-3 text-green-500" />
                Último arqueo: {formatDate(reports.cash.ultimoArqueo.fecha)}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bank Card */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                <Building2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleExport('Bancos')}>
                <Download className="h-4 w-4" />
              </Button>
            </div>
            <CardTitle className="text-lg text-gray-900 dark:text-white">
              Bancos
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-gray-400">
              Cuentas y transacciones
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500 dark:text-gray-400">Saldo Total</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400 text-lg">
                {formatCurrency(reports?.bank.saldoTotal || 0)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1">
                <ArrowUpRight className="h-3 w-3 text-green-500" />
                <span className="text-gray-600 dark:text-gray-300">
                  {formatCurrency(reports?.bank.depositos || 0)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <ArrowDownRight className="h-3 w-3 text-red-500" />
                <span className="text-gray-600 dark:text-gray-300">
                  {formatCurrency(reports?.bank.retiros || 0)}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>{reports?.bank.totalCuentas || 0} cuentas activas</span>
              <span>{reports?.bank.transaccionesDelMes || 0} transacciones</span>
            </div>
            {(reports?.bank.reconciliacionesPendientes || 0) > 0 && (
              <div className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-xs text-yellow-600 dark:text-yellow-400">
                <AlertTriangle className="h-3 w-3" />
                {reports?.bank.reconciliacionesPendientes} reconciliaciones pendientes
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg text-gray-900 dark:text-white">
            Accesos Rápidos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <Link href="/app/finanzas/facturas-venta">
              <Button variant="outline" className="w-full justify-start dark:border-gray-700">
                <FileText className="h-4 w-4 mr-2" />
                Facturas Venta
              </Button>
            </Link>
            <Link href="/app/finanzas/facturas-compra">
              <Button variant="outline" className="w-full justify-start dark:border-gray-700">
                <Receipt className="h-4 w-4 mr-2" />
                Facturas Compra
              </Button>
            </Link>
            <Link href="/app/finanzas/ingresos">
              <Button variant="outline" className="w-full justify-start dark:border-gray-700">
                <TrendingUp className="h-4 w-4 mr-2" />
                Ingresos
              </Button>
            </Link>
            <Link href="/app/finanzas/egresos">
              <Button variant="outline" className="w-full justify-start dark:border-gray-700">
                <TrendingDown className="h-4 w-4 mr-2" />
                Egresos
              </Button>
            </Link>
            <Link href="/app/finanzas/cuentas-por-cobrar">
              <Button variant="outline" className="w-full justify-start dark:border-gray-700">
                <DollarSign className="h-4 w-4 mr-2" />
                CxC
              </Button>
            </Link>
            <Link href="/app/finanzas/cuentas-por-pagar">
              <Button variant="outline" className="w-full justify-start dark:border-gray-700">
                <CreditCard className="h-4 w-4 mr-2" />
                CxP
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
