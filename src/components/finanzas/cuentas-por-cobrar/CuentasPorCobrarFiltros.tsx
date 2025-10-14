'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Filter, Download, RefreshCw } from 'lucide-react';
import { FiltrosCuentasPorCobrar } from './types';
import { CuentasPorCobrarService } from './service';
import { toast } from 'sonner';

interface CuentasPorCobrarFiltrosProps {
  filtros: FiltrosCuentasPorCobrar;
  onFiltrosChange: (filtros: FiltrosCuentasPorCobrar) => void;
  onExportCSV: () => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function CuentasPorCobrarFiltros({ 
  filtros, 
  onFiltrosChange, 
  onExportCSV, 
  onRefresh, 
  isLoading 
}: CuentasPorCobrarFiltrosProps) {
  const [mostrarFiltrosAvanzados, setMostrarFiltrosAvanzados] = useState(false);

  const handleInputChange = (field: keyof FiltrosCuentasPorCobrar, value: string) => {
    onFiltrosChange({
      ...filtros,
      [field]: value,
    });
  };

  const limpiarFiltros = () => {
    onFiltrosChange({
      busqueda: '',
      estado: 'todos',
      aging: 'todos',
      cliente: '',
      fechaDesde: '',
      fechaHasta: '',
      pageSize: filtros.pageSize, // Mantener tamaño de página
      pageNumber: 1, // Reset a primera página
    });
  };

  const exportarCSV = async () => {
    try {
      const csvContent = await CuentasPorCobrarService.exportarCSV(filtros);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `cuentas_por_cobrar_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Reporte exportado exitosamente');
    } catch (error) {
      console.error('Error al exportar CSV:', error);
      toast.error('Error al exportar el reporte');
    }
  };

  return (
    <Card className="dark:bg-gray-800/50 dark:border-gray-700">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-base sm:text-lg text-gray-900 dark:text-white flex items-center gap-2">
          <Filter className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
          <span>Filtros y Búsqueda</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6">
        {/* Filtros básicos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="busqueda" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
              Buscar
            </Label>
            <div className="relative">
              <Search className="absolute left-2 sm:left-3 top-2 sm:top-3 h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 dark:text-gray-500" />
              <Input
                id="busqueda"
                placeholder="Cliente, email, teléfono..."
                value={filtros.busqueda}
                onChange={(e) => handleInputChange('busqueda', e.target.value)}
                className="h-8 sm:h-10 text-xs sm:text-sm pl-8 sm:pl-10 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              />
            </div>
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="estado" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
              Estado
            </Label>
            <Select value={filtros.estado} onValueChange={(value) => handleInputChange('estado', value)}>
              <SelectTrigger className="h-8 sm:h-10 text-xs sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                <SelectValue placeholder="Todos los estados" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="todos" className="text-xs sm:text-sm dark:text-gray-300">Todos los estados</SelectItem>
                <SelectItem value="current" className="text-xs sm:text-sm dark:text-gray-300">Al día</SelectItem>
                <SelectItem value="overdue" className="text-xs sm:text-sm dark:text-gray-300">Vencidas</SelectItem>
                <SelectItem value="partial" className="text-xs sm:text-sm dark:text-gray-300">Parcialmente pagadas</SelectItem>
                <SelectItem value="paid" className="text-xs sm:text-sm dark:text-gray-300">Pagadas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="aging" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
              Aging
            </Label>
            <Select value={filtros.aging} onValueChange={(value) => handleInputChange('aging', value)}>
              <SelectTrigger className="h-8 sm:h-10 text-xs sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                <SelectValue placeholder="Todos los períodos" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="todos" className="text-xs sm:text-sm dark:text-gray-300">Todos los períodos</SelectItem>
                <SelectItem value="0-30" className="text-xs sm:text-sm dark:text-gray-300">0-30 días</SelectItem>
                <SelectItem value="31-60" className="text-xs sm:text-sm dark:text-gray-300">31-60 días</SelectItem>
                <SelectItem value="61-90" className="text-xs sm:text-sm dark:text-gray-300">61-90 días</SelectItem>
                <SelectItem value="90+" className="text-xs sm:text-sm dark:text-gray-300">Más de 90 días</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="cliente" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
              Cliente
            </Label>
            <Input
              id="cliente"
              placeholder="Nombre del cliente"
              value={filtros.cliente}
              onChange={(e) => handleInputChange('cliente', e.target.value)}
              className="h-8 sm:h-10 text-xs sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
              Acciones
            </Label>
            <div className="flex gap-1.5 sm:gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMostrarFiltrosAvanzados(!mostrarFiltrosAvanzados)}
                className="h-8 sm:h-10 px-2 sm:px-3 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <Filter className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isLoading}
                className="h-8 sm:h-10 px-2 sm:px-3 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>

        {/* Filtros avanzados */}
        {mostrarFiltrosAvanzados && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 pt-3 sm:pt-4 border-t dark:border-gray-700">
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="fechaDesde" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                Fecha Vencimiento Desde
              </Label>
              <Input
                id="fechaDesde"
                type="date"
                value={filtros.fechaDesde}
                onChange={(e) => handleInputChange('fechaDesde', e.target.value)}
                className="h-8 sm:h-10 text-xs sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              />
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="fechaHasta" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                Fecha Vencimiento Hasta
              </Label>
              <Input
                id="fechaHasta"
                type="date"
                value={filtros.fechaHasta}
                onChange={(e) => handleInputChange('fechaHasta', e.target.value)}
                className="h-8 sm:h-10 text-xs sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              />
            </div>
          </div>
        )}

        {/* Botones de acción */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 sm:gap-0 pt-3 sm:pt-4 border-t dark:border-gray-700">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={limpiarFiltros}
              className="h-8 sm:h-9 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Limpiar Filtros
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={exportarCSV}
              disabled={isLoading}
              className="h-8 sm:h-9 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-2" />
              <span>Exportar CSV</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
