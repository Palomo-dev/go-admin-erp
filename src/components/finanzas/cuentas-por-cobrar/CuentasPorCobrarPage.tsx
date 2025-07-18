'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, TrendingDown, Bell, BarChart3, RefreshCw } from 'lucide-react';
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
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Cuentas por Cobrar
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestión y seguimiento de cuentas por cobrar
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isLoading}
            className="dark:border-gray-600 dark:hover:bg-gray-700"
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
        <TabsList className="grid w-full grid-cols-4 dark:bg-gray-800 dark:border-gray-700">
          <TabsTrigger value="cuentas" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Cuentas
          </TabsTrigger>
          <TabsTrigger value="aging" className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            Aging
          </TabsTrigger>
          <TabsTrigger value="recordatorios" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Recordatorios
          </TabsTrigger>
          <TabsTrigger value="estadisticas" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Estadísticas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cuentas" className="space-y-6">
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

        <TabsContent value="aging" className="space-y-6">
          <AgingReport />
        </TabsContent>

        <TabsContent value="recordatorios" className="space-y-6">
          <RecordatoriosPanel onRefresh={handleRefresh} />
        </TabsContent>

        <TabsContent value="estadisticas" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <EstadisticasDetalle estadisticas={estadisticas} />
            <Card className="dark:bg-gray-800/50 dark:border-gray-700 light:bg-white">
              <CardHeader>
                <CardTitle className="text-lg text-gray-900 dark:text-white">
                  Análisis de Tendencias
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      Eficiencia de cobro
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                        <div 
                          className="h-2 bg-green-500 rounded-full"
                          style={{ 
                            width: `${estadisticas.total_amount > 0 ? (estadisticas.paid_amount / estadisticas.total_amount) * 100 : 0}%` 
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {estadisticas.total_amount > 0 ? ((estadisticas.paid_amount / estadisticas.total_amount) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      Cartera vencida
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                        <div 
                          className="h-2 bg-red-500 rounded-full"
                          style={{ 
                            width: `${estadisticas.total_balance > 0 ? (estadisticas.overdue_amount / estadisticas.total_balance) * 100 : 0}%` 
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {estadisticas.total_balance > 0 ? ((estadisticas.overdue_amount / estadisticas.total_balance) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t dark:border-gray-700">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
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
  );
}
