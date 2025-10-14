'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
import { 
  Search, 
  Filter, 
  X, 
  ChevronDown,
  ChevronUp,
  Calendar,
  DollarSign,
  Building2,
  AlertCircle
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

import { CuentasPorPagarService } from './CuentasPorPagarService';
import { FiltrosCuentasPorPagar, SupplierOption } from './types';

interface CuentasPorPagarFiltrosProps {
  filtros: FiltrosCuentasPorPagar;
  onFiltrosChange: (filtros: FiltrosCuentasPorPagar) => void;
  onLimpiarFiltros: () => void;
}

export function CuentasPorPagarFiltros({
  filtros,
  onFiltrosChange,
  onLimpiarFiltros
}: CuentasPorPagarFiltrosProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [proveedores, setProveedores] = useState<SupplierOption[]>([]);
  const [mostrarFiltrosAvanzados, setMostrarFiltrosAvanzados] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    cargarProveedores();
  }, []);

  const cargarProveedores = async () => {
    try {
      const proveedoresData = await CuentasPorPagarService.obtenerProveedoresConSaldo();
      
      const proveedoresOptions: SupplierOption[] = proveedoresData.map(proveedor => ({
        value: proveedor.id.toString(),
        label: proveedor.name,
        nit: proveedor.nit,
        // En una implementación completa, estos valores vendrían del join con accounts_payable
        balance: 0,
        overdue_amount: 0
      }));

      setProveedores(proveedoresOptions);
    } catch (error) {
      console.error('Error cargando proveedores:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los proveedores",
        variant: "destructive",
      });
    }
  };

  // Handlers de cambio
  const handleInputChange = (field: keyof FiltrosCuentasPorPagar, value: any) => {
    const nuevosFiltros = { ...filtros, [field]: value };
    onFiltrosChange(nuevosFiltros);
  };

  const handleBusquedaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleInputChange('busqueda', e.target.value);
  };

  const handleEstadoChange = (value: string) => {
    handleInputChange('estado', value as FiltrosCuentasPorPagar['estado']);
  };

  const handleProveedorChange = (value: string) => {
    handleInputChange('proveedor', value);
  };

  const handleVencimientoChange = (value: string) => {
    handleInputChange('vencimiento', value as FiltrosCuentasPorPagar['vencimiento']);
  };

  const handleFechaDesdeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleInputChange('fechaDesde', e.target.value);
  };

  const handleFechaHastaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleInputChange('fechaHasta', e.target.value);
  };

  const handleMontoMinimoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value ? parseFloat(e.target.value) : null;
    handleInputChange('montoMinimo', value);
  };

  const handleMontoMaximoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value ? parseFloat(e.target.value) : null;
    handleInputChange('montoMaximo', value);
  };

  // Verificar si hay filtros activos
  const hasFiltrosActivos = () => {
    return (
      filtros.busqueda !== '' ||
      filtros.estado !== 'todos' ||
      filtros.proveedor !== 'todos' ||
      filtros.fechaDesde !== '' ||
      filtros.fechaHasta !== '' ||
      filtros.vencimiento !== 'todos' ||
      filtros.montoMinimo !== null ||
      filtros.montoMaximo !== null
    );
  };

  const contarFiltrosActivos = () => {
    let count = 0;
    if (filtros.busqueda) count++;
    if (filtros.estado !== 'todos') count++;
    if (filtros.proveedor !== 'todos') count++;
    if (filtros.fechaDesde) count++;
    if (filtros.fechaHasta) count++;
    if (filtros.vencimiento !== 'todos') count++;
    if (filtros.montoMinimo) count++;
    if (filtros.montoMaximo) count++;
    return count;
  };

  return (
    <Card className="dark:bg-gray-800/50 dark:border-gray-700 border-gray-200">
      <CardContent className="p-3 sm:p-4">
        <div className="space-y-3 sm:space-y-4">
          {/* Filtros principales */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Búsqueda */}
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="busqueda" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                <Search className="w-3 h-3 sm:w-4 sm:h-4 inline mr-1" />
                <span>Búsqueda</span>
              </Label>
              <Input
                id="busqueda"
                placeholder="Buscar..."
                value={filtros.busqueda}
                onChange={handleBusquedaChange}
                className="w-full h-8 sm:h-9 text-xs sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              />
            </div>

            {/* Estado */}
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">Estado</Label>
              <Select value={filtros.estado} onValueChange={handleEstadoChange}>
                <SelectTrigger className="h-8 sm:h-9 text-xs sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  <SelectItem value="todos" className="text-xs sm:text-sm dark:text-gray-300">Todos</SelectItem>
                  <SelectItem value="pendiente" className="text-xs sm:text-sm dark:text-gray-300">Pendiente</SelectItem>
                  <SelectItem value="vencida" className="text-xs sm:text-sm dark:text-gray-300">Vencida</SelectItem>
                  <SelectItem value="parcial" className="text-xs sm:text-sm dark:text-gray-300">Parcial</SelectItem>
                  <SelectItem value="pagada" className="text-xs sm:text-sm dark:text-gray-300">Pagada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Vencimiento */}
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">Vencimiento</Label>
              <Select value={filtros.vencimiento} onValueChange={handleVencimientoChange}>
                <SelectTrigger className="h-8 sm:h-9 text-xs sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  <SelectItem value="todos" className="text-xs sm:text-sm dark:text-gray-300">Todos</SelectItem>
                  <SelectItem value="hoy" className="text-xs sm:text-sm dark:text-gray-300">Vence hoy</SelectItem>
                  <SelectItem value="proximos_7" className="text-xs sm:text-sm dark:text-gray-300">Próximos 7 días</SelectItem>
                  <SelectItem value="proximos_30" className="text-xs sm:text-sm dark:text-gray-300">Próximos 30 días</SelectItem>
                  <SelectItem value="vencidas" className="text-xs sm:text-sm dark:text-gray-300">Vencidas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Botón para filtros avanzados */}
            <div className="flex items-end">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setMostrarFiltrosAvanzados(!mostrarFiltrosAvanzados)}
                className="flex items-center gap-1.5 sm:gap-2 w-full h-8 sm:h-9 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {mostrarFiltrosAvanzados ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Menos filtros</span>
                    <span className="sm:hidden">Menos</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Más filtros</span>
                    <span className="sm:hidden">Más</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Filtros avanzados */}
          {mostrarFiltrosAvanzados && (
            <div className="p-3 sm:p-4 border border-gray-200 rounded-lg bg-gray-50 dark:bg-gray-800/50 dark:border-gray-700">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {/* Filtro por proveedor */}
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">Proveedor</Label>
                  <Select 
                    value={filtros.proveedor} 
                    onValueChange={handleProveedorChange}
                  >
                    <SelectTrigger className="h-8 sm:h-9 text-xs sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                      <SelectItem value="todos" className="text-xs sm:text-sm dark:text-gray-300">Todos los proveedores</SelectItem>
                      {proveedores.map((proveedor) => (
                        <SelectItem key={proveedor.value} value={proveedor.value} className="dark:text-gray-300">
                          <div className="flex flex-col">
                            <span className="text-xs sm:text-sm">{proveedor.label}</span>
                            {proveedor.nit && (
                              <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                                NIT: {proveedor.nit}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Monto mínimo */}
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="montoMinimo" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    <DollarSign className="w-3 h-3 sm:w-4 sm:h-4 inline mr-1" />
                    <span>Monto mínimo</span>
                  </Label>
                  <Input
                    id="montoMinimo"
                    type="number"
                    placeholder="0.00"
                    value={filtros.montoMinimo || ''}
                    onChange={handleMontoMinimoChange}
                    className="h-8 sm:h-9 text-xs sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  />
                </div>

                {/* Monto máximo */}
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="montoMaximo" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    <DollarSign className="w-3 h-3 sm:w-4 sm:h-4 inline mr-1" />
                    <span>Monto máximo</span>
                  </Label>
                  <Input
                    id="montoMaximo"
                    type="number"
                    placeholder="Sin límite"
                    value={filtros.montoMaximo || ''}
                    onChange={handleMontoMaximoChange}
                    className="h-8 sm:h-9 text-xs sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  />
                </div>

                {/* Fecha desde */}
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="fechaDesde" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    <Calendar className="w-3 h-3 sm:w-4 sm:h-4 inline mr-1" />
                    <span>Vence desde</span>
                  </Label>
                  <Input
                    id="fechaDesde"
                    type="date"
                    value={filtros.fechaDesde}
                    onChange={handleFechaDesdeChange}
                    className="h-8 sm:h-9 text-xs sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  />
                </div>

                {/* Fecha hasta */}
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="fechaHasta" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    <Calendar className="w-3 h-3 sm:w-4 sm:h-4 inline mr-1" />
                    <span>Vence hasta</span>
                  </Label>
                  <Input
                    id="fechaHasta"
                    type="date"
                    value={filtros.fechaHasta}
                    onChange={handleFechaHastaChange}
                    className="h-8 sm:h-9 text-xs sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Resumen de filtros activos */}
          {hasFiltrosActivos() && (
            <div className="mt-2 sm:mt-3 p-2 sm:p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-blue-700 dark:text-blue-300">
                  <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>
                    {contarFiltrosActivos()} filtro{contarFiltrosActivos() !== 1 ? 's' : ''} activo{contarFiltrosActivos() !== 1 ? 's' : ''}
                  </span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={onLimpiarFiltros}
                  className="h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 dark:hover:bg-blue-900/30"
                >
                  <X className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                  <span>Limpiar todo</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
