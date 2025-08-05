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
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* Filtros principales */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Búsqueda */}
            <div className="space-y-2">
              <Label htmlFor="busqueda">
                <Search className="w-4 h-4 inline mr-1" />
                Búsqueda
              </Label>
              <Input
                id="busqueda"
                placeholder="Buscar por proveedor, factura..."
                value={filtros.busqueda}
                onChange={handleBusquedaChange}
                className="w-full"
              />
            </div>

            {/* Estado */}
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={filtros.estado} onValueChange={handleEstadoChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="vencida">Vencida</SelectItem>
                  <SelectItem value="parcial">Pago parcial</SelectItem>
                  <SelectItem value="pagada">Pagada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Vencimiento */}
            <div className="space-y-2">
              <Label>Vencimiento</Label>
              <Select value={filtros.vencimiento} onValueChange={handleVencimientoChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="hoy">Vence hoy</SelectItem>
                  <SelectItem value="proximos_7">Próximos 7 días</SelectItem>
                  <SelectItem value="proximos_30">Próximos 30 días</SelectItem>
                  <SelectItem value="vencidas">Vencidas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Botón para filtros avanzados */}
            <div className="flex items-end">
              <Button 
                variant="outline" 
                size="default"
                onClick={() => setMostrarFiltrosAvanzados(!mostrarFiltrosAvanzados)}
                className="flex items-center gap-2 w-full"
              >
                {mostrarFiltrosAvanzados ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    Menos filtros
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    Más filtros
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Filtros avanzados */}
          {mostrarFiltrosAvanzados && (
            <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Filtro por proveedor */}
                <div className="space-y-2">
                  <Label>Proveedor</Label>
                  <Select 
                    value={filtros.proveedor} 
                    onValueChange={handleProveedorChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todos los proveedores" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos los proveedores</SelectItem>
                      {proveedores.map((proveedor) => (
                        <SelectItem key={proveedor.value} value={proveedor.value}>
                          <div className="flex flex-col">
                            <span>{proveedor.label}</span>
                            {proveedor.nit && (
                              <span className="text-xs text-gray-500">
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
                <div className="space-y-2">
                  <Label htmlFor="montoMinimo">
                    <DollarSign className="w-4 h-4 inline mr-1" />
                    Monto mínimo
                  </Label>
                  <Input
                    id="montoMinimo"
                    type="number"
                    placeholder="0.00"
                    value={filtros.montoMinimo || ''}
                    onChange={handleMontoMinimoChange}
                  />
                </div>

                {/* Monto máximo */}
                <div className="space-y-2">
                  <Label htmlFor="montoMaximo">
                    <DollarSign className="w-4 h-4 inline mr-1" />
                    Monto máximo
                  </Label>
                  <Input
                    id="montoMaximo"
                    type="number"
                    placeholder="Sin límite"
                    value={filtros.montoMaximo || ''}
                    onChange={handleMontoMaximoChange}
                  />
                </div>

                {/* Fecha desde */}
                <div className="space-y-2">
                  <Label htmlFor="fechaDesde">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Vence desde
                  </Label>
                  <Input
                    id="fechaDesde"
                    type="date"
                    value={filtros.fechaDesde}
                    onChange={handleFechaDesdeChange}
                  />
                </div>

                {/* Fecha hasta */}
                <div className="space-y-2">
                  <Label htmlFor="fechaHasta">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Vence hasta
                  </Label>
                  <Input
                    id="fechaHasta"
                    type="date"
                    value={filtros.fechaHasta}
                    onChange={handleFechaHastaChange}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Resumen de filtros activos */}
          {hasFiltrosActivos() && (
            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                  <Filter className="w-4 h-4" />
                  <span>
                    {contarFiltrosActivos()} filtro{contarFiltrosActivos() !== 1 ? 's' : ''} activo{contarFiltrosActivos() !== 1 ? 's' : ''}
                  </span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={onLimpiarFiltros}
                  className="text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100"
                >
                  <X className="w-4 h-4 mr-1" />
                  Limpiar todo
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
