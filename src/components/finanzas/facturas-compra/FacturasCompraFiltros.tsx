'use client';

import React, { useState, useEffect } from 'react';
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
import { Search, Filter, X } from 'lucide-react';
import { FacturasCompraService } from './FacturasCompraService';
import { FiltrosFacturasCompra, SupplierBase } from './types';

interface FacturasCompraFiltrosProps {
  onFiltrosChange: (filtros: FiltrosFacturasCompra) => void;
}

export function FacturasCompraFiltros({ onFiltrosChange }: FacturasCompraFiltrosProps) {
  const [filtros, setFiltros] = useState<FiltrosFacturasCompra>({
    busqueda: '',
    estado: 'todos',
    proveedor: 'todos',
    fechaDesde: '',
    fechaHasta: ''
  });

  const [proveedores, setProveedores] = useState<SupplierBase[]>([]);
  const [mostrarFiltrosAvanzados, setMostrarFiltrosAvanzados] = useState(false);

  // Cargar proveedores al montar el componente
  useEffect(() => {
    cargarProveedores();
  }, []);

  const cargarProveedores = async () => {
    try {
      const data = await FacturasCompraService.obtenerProveedores();
      setProveedores(data);
    } catch (error) {
      console.error('Error cargando proveedores:', error);
    }
  };

  const aplicarFiltros = () => {
    onFiltrosChange(filtros);
  };

  const limpiarFiltros = () => {
    const filtrosLimpios: FiltrosFacturasCompra = {
      busqueda: '',
      estado: 'todos',
      proveedor: 'todos',
      fechaDesde: '',
      fechaHasta: ''
    };
    setFiltros(filtrosLimpios);
    onFiltrosChange(filtrosLimpios);
  };

  const actualizarFiltro = (campo: keyof FiltrosFacturasCompra, valor: string) => {
    const nuevosFiltros = { ...filtros, [campo]: valor };
    setFiltros(nuevosFiltros);
    
    // Auto-aplicar filtros para búsqueda y selectores
    if (campo === 'busqueda' || campo === 'estado' || campo === 'proveedor') {
      onFiltrosChange(nuevosFiltros);
    }
  };

  const hayFiltrosActivos = () => {
    return filtros.busqueda !== '' ||
           filtros.estado !== 'todos' ||
           filtros.proveedor !== 'todos' ||
           filtros.fechaDesde !== '' ||
           filtros.fechaHasta !== '';
  };

  return (
    <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 p-3 sm:p-4 space-y-3 sm:space-y-4">
      {/* Filtros básicos */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="flex-1">
          <Label htmlFor="busqueda" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
            Buscar factura
          </Label>
          <div className="relative mt-1">
            <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <Input
              id="busqueda"
              type="text"
              placeholder="Número de factura o notas..."
              value={filtros.busqueda}
              onChange={(e) => actualizarFiltro('busqueda', e.target.value)}
              className="pl-8 sm:pl-10 h-8 sm:h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div>
            <Label htmlFor="estado" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
              Estado
            </Label>
            <Select
              value={filtros.estado}
              onValueChange={(value) => actualizarFiltro('estado', value)}
            >
              <SelectTrigger className="h-8 sm:h-9 text-xs sm:text-sm mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                <SelectValue placeholder="Todos los estados" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="todos" className="text-xs sm:text-sm dark:text-gray-100 dark:focus:bg-gray-700">Todos los estados</SelectItem>
                <SelectItem value="draft" className="text-xs sm:text-sm dark:text-gray-100 dark:focus:bg-gray-700">Borrador</SelectItem>
                <SelectItem value="received" className="text-xs sm:text-sm dark:text-gray-100 dark:focus:bg-gray-700">Recibida</SelectItem>
                <SelectItem value="partial" className="text-xs sm:text-sm dark:text-gray-100 dark:focus:bg-gray-700">Parcial</SelectItem>
                <SelectItem value="paid" className="text-xs sm:text-sm dark:text-gray-100 dark:focus:bg-gray-700">Pagada</SelectItem>
                <SelectItem value="void" className="text-xs sm:text-sm dark:text-gray-100 dark:focus:bg-gray-700">Anulada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="proveedor" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
              Proveedor
            </Label>
            <Select
              value={filtros.proveedor}
              onValueChange={(value) => actualizarFiltro('proveedor', value)}
            >
              <SelectTrigger className="h-8 sm:h-9 text-xs sm:text-sm mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                <SelectValue placeholder="Todos los proveedores" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="todos" className="text-xs sm:text-sm dark:text-gray-100 dark:focus:bg-gray-700">Todos los proveedores</SelectItem>
                {proveedores.map((proveedor) => (
                  <SelectItem key={proveedor.id} value={proveedor.id.toString()} className="text-xs sm:text-sm dark:text-gray-100 dark:focus:bg-gray-700">
                    {proveedor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 sm:col-span-2 lg:col-span-2 items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMostrarFiltrosAvanzados(!mostrarFiltrosAvanzados)}
              className="flex-1 h-8 sm:h-9 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-2" />
              <span className="hidden sm:inline">Filtros</span>
            </Button>
            
            {hayFiltrosActivos() && (
              <Button
                variant="outline"
                size="sm"
                onClick={limpiarFiltros}
                className="flex-1 h-8 sm:h-9 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-2" />
                <span className="hidden sm:inline">Limpiar</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Filtros avanzados */}
      {mostrarFiltrosAvanzados && (
        <div className="border-t dark:border-gray-700 pt-3 sm:pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <Label htmlFor="fechaDesde" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                Fecha desde
              </Label>
              <Input
                id="fechaDesde"
                type="date"
                value={filtros.fechaDesde}
                onChange={(e) => actualizarFiltro('fechaDesde', e.target.value)}
                className="h-8 sm:h-9 text-sm mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              />
            </div>

            <div>
              <Label htmlFor="fechaHasta" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                Fecha hasta
              </Label>
              <Input
                id="fechaHasta"
                type="date"
                value={filtros.fechaHasta}
                onChange={(e) => actualizarFiltro('fechaHasta', e.target.value)}
                className="h-8 sm:h-9 text-sm mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              />
            </div>

            <div className="flex items-end">
              <Button
                onClick={aplicarFiltros}
                size="sm"
                className="w-full h-8 sm:h-9 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white"
              >
                Aplicar Filtros
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Indicador de filtros activos */}
      {hayFiltrosActivos() && (
        <div className="flex flex-wrap gap-1.5 sm:gap-2 pt-2">
          {filtros.busqueda && (
            <span className="inline-flex items-center px-2 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              Búsqueda: {filtros.busqueda}
            </span>
          )}
          {filtros.estado !== 'todos' && (
            <span className="inline-flex items-center px-2 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800">
              Estado: {filtros.estado}
            </span>
          )}
          {filtros.proveedor !== 'todos' && (
            <span className="inline-flex items-center px-2 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800 max-w-[200px] truncate">
              Proveedor: {proveedores.find(p => p.id.toString() === filtros.proveedor)?.name || 'Desconocido'}
            </span>
          )}
          {filtros.fechaDesde && (
            <span className="inline-flex items-center px-2 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
              Desde: {filtros.fechaDesde}
            </span>
          )}
          {filtros.fechaHasta && (
            <span className="inline-flex items-center px-2 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
              Hasta: {filtros.fechaHasta}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
