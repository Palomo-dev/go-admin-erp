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
    <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 p-4 space-y-4">
      {/* Filtros básicos */}
      <div className="flex flex-col sm:flex-row gap-4 items-end">
        <div className="flex-1">
          <Label htmlFor="busqueda" className="dark:text-gray-300">
            Buscar factura
          </Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              id="busqueda"
              type="text"
              placeholder="Número de factura o notas..."
              value={filtros.busqueda}
              onChange={(e) => actualizarFiltro('busqueda', e.target.value)}
              className="pl-10 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
          </div>
        </div>

        <div className="w-full sm:w-48">
          <Label htmlFor="estado" className="dark:text-gray-300">
            Estado
          </Label>
          <Select
            value={filtros.estado}
            onValueChange={(value) => actualizarFiltro('estado', value)}
          >
            <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
              <SelectItem value="todos">Todos los estados</SelectItem>
              <SelectItem value="draft">Borrador</SelectItem>
              <SelectItem value="received">Recibida</SelectItem>
              <SelectItem value="partial">Parcial</SelectItem>
              <SelectItem value="paid">Pagada</SelectItem>
              <SelectItem value="void">Anulada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-64">
          <Label htmlFor="proveedor" className="dark:text-gray-300">
            Proveedor
          </Label>
          <Select
            value={filtros.proveedor}
            onValueChange={(value) => actualizarFiltro('proveedor', value)}
          >
            <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
              <SelectValue placeholder="Todos los proveedores" />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
              <SelectItem value="todos">Todos los proveedores</SelectItem>
              {proveedores.map((proveedor) => (
                <SelectItem key={proveedor.id} value={proveedor.id.toString()}>
                  {proveedor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setMostrarFiltrosAvanzados(!mostrarFiltrosAvanzados)}
            className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filtros
          </Button>
          
          {hayFiltrosActivos() && (
            <Button
              variant="outline"
              onClick={limpiarFiltros}
              className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <X className="w-4 h-4 mr-2" />
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* Filtros avanzados */}
      {mostrarFiltrosAvanzados && (
        <div className="border-t dark:border-gray-700 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="fechaDesde" className="dark:text-gray-300">
                Fecha desde
              </Label>
              <Input
                id="fechaDesde"
                type="date"
                value={filtros.fechaDesde}
                onChange={(e) => actualizarFiltro('fechaDesde', e.target.value)}
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              />
            </div>

            <div>
              <Label htmlFor="fechaHasta" className="dark:text-gray-300">
                Fecha hasta
              </Label>
              <Input
                id="fechaHasta"
                type="date"
                value={filtros.fechaHasta}
                onChange={(e) => actualizarFiltro('fechaHasta', e.target.value)}
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              />
            </div>

            <div className="flex items-end">
              <Button
                onClick={aplicarFiltros}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                Aplicar Filtros
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Indicador de filtros activos */}
      {hayFiltrosActivos() && (
        <div className="flex flex-wrap gap-2 pt-2">
          {filtros.busqueda && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
              Búsqueda: {filtros.busqueda}
            </span>
          )}
          {filtros.estado !== 'todos' && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
              Estado: {filtros.estado}
            </span>
          )}
          {filtros.proveedor !== 'todos' && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
              Proveedor: {proveedores.find(p => p.id.toString() === filtros.proveedor)?.name || 'Desconocido'}
            </span>
          )}
          {filtros.fechaDesde && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
              Desde: {filtros.fechaDesde}
            </span>
          )}
          {filtros.fechaHasta && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
              Hasta: {filtros.fechaHasta}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
