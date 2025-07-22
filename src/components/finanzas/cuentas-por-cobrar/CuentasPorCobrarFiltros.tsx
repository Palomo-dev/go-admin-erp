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
    <Card className="mb-6 dark:bg-gray-800/50 dark:border-gray-700 light:bg-white">
      <CardHeader>
        <CardTitle className="text-lg text-gray-900 dark:text-white flex items-center gap-2">
          <Filter className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Filtros y Búsqueda
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filtros básicos */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="space-y-2">
            <Label htmlFor="busqueda" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Buscar
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="busqueda"
                placeholder="Cliente, email, teléfono..."
                value={filtros.busqueda}
                onChange={(e) => handleInputChange('busqueda', e.target.value)}
                className="pl-10 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="estado" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Estado
            </Label>
            <Select value={filtros.estado} onValueChange={(value) => handleInputChange('estado', value)}>
              <SelectTrigger className="dark:bg-gray-800 dark:border-gray-600">
                <SelectValue placeholder="Todos los estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                <SelectItem value="current">Al día</SelectItem>
                <SelectItem value="overdue">Vencidas</SelectItem>
                <SelectItem value="partial">Parcialmente pagadas</SelectItem>
                <SelectItem value="paid">Pagadas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="aging" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Aging
            </Label>
            <Select value={filtros.aging} onValueChange={(value) => handleInputChange('aging', value)}>
              <SelectTrigger className="dark:bg-gray-800 dark:border-gray-600">
                <SelectValue placeholder="Todos los períodos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los períodos</SelectItem>
                <SelectItem value="0-30">0-30 días</SelectItem>
                <SelectItem value="31-60">31-60 días</SelectItem>
                <SelectItem value="61-90">61-90 días</SelectItem>
                <SelectItem value="90+">Más de 90 días</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cliente" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Cliente
            </Label>
            <Input
              id="cliente"
              placeholder="Nombre del cliente"
              value={filtros.cliente}
              onChange={(e) => handleInputChange('cliente', e.target.value)}
              className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Acciones
            </Label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMostrarFiltrosAvanzados(!mostrarFiltrosAvanzados)}
                className="dark:border-gray-600 dark:hover:bg-gray-700"
              >
                <Filter className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isLoading}
                className="dark:border-gray-600 dark:hover:bg-gray-700"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>

        {/* Filtros avanzados */}
        {mostrarFiltrosAvanzados && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t dark:border-gray-700">
            <div className="space-y-2">
              <Label htmlFor="fechaDesde" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Fecha Vencimiento Desde
              </Label>
              <Input
                id="fechaDesde"
                type="date"
                value={filtros.fechaDesde}
                onChange={(e) => handleInputChange('fechaDesde', e.target.value)}
                className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fechaHasta" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Fecha Vencimiento Hasta
              </Label>
              <Input
                id="fechaHasta"
                type="date"
                value={filtros.fechaHasta}
                onChange={(e) => handleInputChange('fechaHasta', e.target.value)}
                className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              />
            </div>
          </div>
        )}

        {/* Botones de acción */}
        <div className="flex justify-between items-center pt-4 border-t dark:border-gray-700">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={limpiarFiltros}
              className="dark:border-gray-600 dark:hover:bg-gray-700"
            >
              Limpiar Filtros
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={exportarCSV}
              disabled={isLoading}
              className="dark:border-gray-600 dark:hover:bg-gray-700"
            >
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
