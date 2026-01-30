'use client';

import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Filter, X } from 'lucide-react';
import { FiltrosTransferencias, Branch } from './types';
import { TransferenciasService } from './TransferenciasService';

interface TransferenciasFiltrosProps {
  onFiltrosChange: (filtros: FiltrosTransferencias) => void;
}

export function TransferenciasFiltros({ onFiltrosChange }: TransferenciasFiltrosProps) {
  const [sucursales, setSucursales] = useState<Branch[]>([]);
  const [filtros, setFiltros] = useState<FiltrosTransferencias>({
    busqueda: '',
    estado: 'todos',
    origen: 'todos',
    destino: 'todos',
    fechaDesde: '',
    fechaHasta: ''
  });
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  useEffect(() => {
    cargarSucursales();
  }, []);

  const cargarSucursales = async () => {
    try {
      const data = await TransferenciasService.obtenerSucursales();
      setSucursales(data);
    } catch (error) {
      console.error('Error cargando sucursales:', error);
    }
  };

  const handleChange = (campo: keyof FiltrosTransferencias, valor: string) => {
    const nuevosFiltros = { ...filtros, [campo]: valor };
    setFiltros(nuevosFiltros);
    onFiltrosChange(nuevosFiltros);
  };

  const limpiarFiltros = () => {
    const filtrosLimpios: FiltrosTransferencias = {
      busqueda: '',
      estado: 'todos',
      origen: 'todos',
      destino: 'todos',
      fechaDesde: '',
      fechaHasta: ''
    };
    setFiltros(filtrosLimpios);
    onFiltrosChange(filtrosLimpios);
  };

  const hayFiltrosActivos = 
    filtros.estado !== 'todos' || 
    filtros.origen !== 'todos' || 
    filtros.destino !== 'todos' ||
    filtros.fechaDesde !== '' ||
    filtros.fechaHasta !== '';

  return (
    <div className="space-y-4 mb-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Buscar por ID o notas..."
            value={filtros.busqueda}
            onChange={(e) => handleChange('busqueda', e.target.value)}
            className="pl-10 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
          />
        </div>
        
        <Select value={filtros.estado} onValueChange={(v) => handleChange('estado', v)}>
          <SelectTrigger className="w-full sm:w-[180px] dark:bg-gray-800 dark:border-gray-600 dark:text-white">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-800 dark:border-gray-600">
            <SelectItem value="todos">Todos los estados</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="in_transit">En Tránsito</SelectItem>
            <SelectItem value="partial">Parcial</SelectItem>
            <SelectItem value="complete">Completa</SelectItem>
            <SelectItem value="cancelled">Cancelada</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          onClick={() => setMostrarFiltros(!mostrarFiltros)}
          className={`dark:border-gray-600 dark:text-gray-300 ${hayFiltrosActivos ? 'border-blue-500 text-blue-600' : ''}`}
        >
          <Filter className="h-4 w-4 mr-2" />
          Filtros
          {hayFiltrosActivos && (
            <span className="ml-2 bg-blue-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">
              !
            </span>
          )}
        </Button>
      </div>

      {mostrarFiltros && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border dark:border-gray-700">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Origen</label>
            <Select value={filtros.origen} onValueChange={(v) => handleChange('origen', v)}>
              <SelectTrigger className="dark:bg-gray-800 dark:border-gray-600 dark:text-white">
                <SelectValue placeholder="Sucursal origen" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-600">
                <SelectItem value="todos">Todas</SelectItem>
                {sucursales.map((s) => (
                  <SelectItem key={s.id} value={s.id.toString()}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Destino</label>
            <Select value={filtros.destino} onValueChange={(v) => handleChange('destino', v)}>
              <SelectTrigger className="dark:bg-gray-800 dark:border-gray-600 dark:text-white">
                <SelectValue placeholder="Sucursal destino" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-600">
                <SelectItem value="todos">Todas</SelectItem>
                {sucursales.map((s) => (
                  <SelectItem key={s.id} value={s.id.toString()}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Desde</label>
            <Input
              type="date"
              value={filtros.fechaDesde}
              onChange={(e) => handleChange('fechaDesde', e.target.value)}
              className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">Hasta</label>
            <Input
              type="date"
              value={filtros.fechaHasta}
              onChange={(e) => handleChange('fechaHasta', e.target.value)}
              className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            />
          </div>

          {hayFiltrosActivos && (
            <div className="col-span-full flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={limpiarFiltros}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4 mr-1" />
                Limpiar filtros
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
