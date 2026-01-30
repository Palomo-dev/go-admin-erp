'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, TrendingDown, Bell, BarChart3, RefreshCw, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { CuentaPorCobrar, FiltrosCuentasPorCobrar, EstadisticasCxC, ResultadoPaginado } from './types';
import { CuentasPorCobrarService } from './service';
import { EstadisticasCards, EstadisticasDetalle } from './EstadisticasCards';
import { CuentasPorCobrarFiltros } from './CuentasPorCobrarFiltros';
import { CuentasPorCobrarTable } from './CuentasPorCobrarTable';
import { AgingReport } from './AgingReport';
import { RecordatoriosPanel } from './RecordatoriosPanel';
import { toast } from 'sonner';

export function CuentasPorCobrarPage() {
  const [resultadoCuentas, setResultadoCuentas] = useState<ResultadoPaginado<CuentaPorCobrar>>({
    data: [],
    total_count: 0,
    page_size: 10,
    page_number: 1,
    total_pages: 0
  });
  const [estadisticas, setEstadisticas] = useState<EstadisticasCxC>({
    total_cuentas: 0,
    total_amount: 0,
    total_balance: 0,
    current_amount: 0,
    overdue_amount: 0,
    paid_amount: 0,
    partial_amount: 0,
    promedio_dias_cobro: 0,
  });
  const [filtros, setFiltros] = useState<FiltrosCuentasPorCobrar>({
    busqueda: '',
    estado: 'todos',
    aging: 'todos',
    cliente: '',
    fechaDesde: '',
    fechaHasta: '',
    pageSize: 10,
    pageNumber: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('cuentas');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      loadCuentas();
    }
  }, [filtros]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        loadCuentas(),
        loadEstadisticas(),
      ]);
    } catch (error) {
      console.error('Error al cargar datos:', error);
      toast.error('Error al cargar los datos');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCuentas = async () => {
    try {
      const data = await CuentasPorCobrarService.obtenerCuentasPorCobrarPaginadas(filtros);
      setResultadoCuentas(data);
    } catch (error) {
      console.error('Error al cargar cuentas:', error);
      toast.error('Error al cargar las cuentas por cobrar');
    }
  };

  const loadEstadisticas = async () => {
    try {
      const data = await CuentasPorCobrarService.obtenerEstadisticasOptimizadas();
      setEstadisticas(data);
    } catch (error) {
      console.error('Error al cargar estadísticas:', error);
      toast.error('Error al cargar las estadísticas');
    }
  };

  const handleFiltrosChange = (nuevosFiltros: FiltrosCuentasPorCobrar) => {
    setFiltros({
      ...nuevosFiltros,
      pageNumber: 1, // Reset a primera página cuando cambien filtros
      pageSize: filtros.pageSize // Mantener el tamaño de página actual
    });
  };

  const handlePageChange = (page: number) => {
    setFiltros(prev => ({
      ...prev,
      pageNumber: page
    }));
  };

  const handlePageSizeChange = (pageSize: number) => {
    setFiltros(prev => ({
      ...prev,
      pageSize,
      pageNumber: 1 // Reset a primera página cuando cambie el tamaño
    }));
  };

  const handleRefresh = () => {
    loadData();
  };

  const handleExportCSV = () => {
    // Esta función se maneja en el componente de filtros
    console.log('Exportando CSV con filtros:', filtros);
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <Link href="/app/finanzas">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Cuentas por Cobrar
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                Finanzas / Cuentas por Cobrar
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={isLoading}
              className="h-9 px-3 text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>
        </div>

        {/* Estadísticas */}
        <EstadisticasCards estadisticas={estadisticas} isLoading={isLoading} />

        {/* Tabs de navegación */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1 dark:bg-gray-800 dark:border-gray-700">
            <TabsTrigger value="cuentas" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 dark:data-[state=active]:bg-gray-700 dark:text-gray-300">
              <FileText className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Cuentas</span>
              <span className="sm:hidden">Ctas</span>
            </TabsTrigger>
            <TabsTrigger value="aging" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 dark:data-[state=active]:bg-gray-700 dark:text-gray-300">
              <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Aging</span>
            </TabsTrigger>
            <TabsTrigger value="recordatorios" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 dark:data-[state=active]:bg-gray-700 dark:text-gray-300">
              <Bell className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Recordatorios</span>
              <span className="sm:hidden">Recor</span>
            </TabsTrigger>
            <TabsTrigger value="estadisticas" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 dark:data-[state=active]:bg-gray-700 dark:text-gray-300">
              <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Estadísticas</span>
              <span className="sm:hidden">Stats</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cuentas" className="space-y-4 sm:space-y-6">
            <CuentasPorCobrarFiltros
              filtros={filtros}
              onFiltrosChange={handleFiltrosChange}
              onExportCSV={handleExportCSV}
              onRefresh={handleRefresh}
              isLoading={isLoading}
            />
            <CuentasPorCobrarTable
              resultado={resultadoCuentas}
              isLoading={isLoading}
              onRefresh={handleRefresh}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          </TabsContent>

          <TabsContent value="aging" className="space-y-4 sm:space-y-6">
            <AgingReport />
          </TabsContent>

          <TabsContent value="recordatorios" className="space-y-4 sm:space-y-6">
            <RecordatoriosPanel onRefresh={handleRefresh} />
          </TabsContent>

          <TabsContent value="estadisticas" className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <EstadisticasDetalle estadisticas={estadisticas} />
              <Card className="dark:bg-gray-800/50 dark:border-gray-700">
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-base sm:text-lg text-gray-900 dark:text-white">
                    Análisis de Tendencias
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 sm:p-6">
                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                        Eficiencia de cobro
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 sm:w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                          <div 
                            className="h-2 bg-green-500 dark:bg-green-400 rounded-full"
                            style={{ 
                              width: `${estadisticas.total_amount > 0 ? (estadisticas.paid_amount / estadisticas.total_amount) * 100 : 0}%` 
                            }}
                          />
                        </div>
                        <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">
                          {estadisticas.total_amount > 0 ? ((estadisticas.paid_amount / estadisticas.total_amount) * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                        Cartera vencida
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 sm:w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                          <div 
                            className="h-2 bg-red-500 dark:bg-red-400 rounded-full"
                            style={{ 
                              width: `${estadisticas.total_balance > 0 ? (estadisticas.overdue_amount / estadisticas.total_balance) * 100 : 0}%` 
                            }}
                          />
                        </div>
                        <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">
                          {estadisticas.total_balance > 0 ? ((estadisticas.overdue_amount / estadisticas.total_balance) * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                    </div>
                    
                    <div className="pt-3 sm:pt-4 border-t dark:border-gray-700">
                      <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                        Promedio de días para cobro: <span className="font-medium text-gray-900 dark:text-white">
                          {Math.round(estadisticas.promedio_dias_cobro)} días
                        </span>
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
