"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';

import { Search } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import { FiltrosProductos as FiltrosProductosType, Categoria } from './types';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';

interface FiltrosProductosProps {
  filters: FiltrosProductosType;
  onFiltersChange: (filters: FiltrosProductosType) => void;
}

/**
 * Componente para filtros de búsqueda de productos
 */
const FiltrosProductos: React.FC<FiltrosProductosProps> = ({ filters, onFiltersChange }) => {

  const { organization } = useOrganization();
  const { branchFilter, branches } = useBranch();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [busquedaLocal, setBusquedaLocal] = useState<string>(filters.busqueda);

  // Refs para mantener valores estables dentro del debounce y evitar recrearlo
  const filtersRef = useRef(filters);
  const onFiltersChangeRef = useRef(onFiltersChange);
  useEffect(() => { filtersRef.current = filters; }, [filters]);
  useEffect(() => { onFiltersChangeRef.current = onFiltersChange; }, [onFiltersChange]);

  // Cargar categorías desde Supabase
  useEffect(() => {
    const fetchCategorias = async () => {
      if (!organization?.id) {
        console.log('Esperando organization_id...');
        return;
      }

      try {
        const { data, error } = await supabase
          .from('categories')
          .select('*')
          .eq('organization_id', organization.id)
          .order('name');

        if (error) throw error;

        setCategorias(data || []);
      } catch (error) {
        console.error('Error al cargar categorías:', error);
      }
    };

    fetchCategorias();
  }, [organization?.id]);

  // Debounce estable: no se recrea en cada render gracias a los refs.
  // Antes dependía de [filters, onFiltersChange] y se recreaba por cada tecla,
  // perdiendo el timer y disparando una consulta completa por cada caracter.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedSearch = useCallback((value: string) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      onFiltersChangeRef.current({ ...filtersRef.current, busqueda: value });
    }, 400);
  }, []);

  // Limpiar timer al desmontar
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Manejadores de cambios en filtros
  // Sincronizar busquedaLocal cuando filters.busqueda cambia externamente
  // (ej. botón "Limpiar filtros" resetea busqueda a '')
  useEffect(() => {
    setBusquedaLocal(filters.busqueda);
  }, [filters.busqueda]);

  const handleBusquedaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setBusquedaLocal(value);
    debouncedSearch(value);
  };

  const handleCategoriaChange = (value: string) => {
    onFiltersChange({ 
      ...filters, 
      categoria: value === "todos" ? null : parseInt(value) 
    });
  };

  // Opciones de categoría para el SearchSelect (memoizado para no recalcular en cada render)
  const categoriaOptions: SearchSelectOption[] = React.useMemo(
    () => categorias.map((c) => ({ value: c.id.toString(), label: c.name })),
    [categorias]
  );

  const handleEstadoChange = (value: string) => {
    onFiltersChange({ ...filters, estado: value });
  };

  const handleOrdenarPorChange = (value: string) => {
    onFiltersChange({ ...filters, ordenarPor: value });
  };

  return (
    <div className="p-3 sm:p-4 rounded-lg border bg-gray-50/80 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
      {/* Badge de sucursal activa */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Sucursal:</span>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${branchFilter === null ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300'}`}>
          {branchFilter === null
            ? 'Todas las sucursales'
            : (branches.find(b => b.id === branchFilter)?.name ?? `Sucursal #${branchFilter}`)}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Búsqueda */}
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-gray-400 dark:text-gray-500" />
          <Input
            value={busquedaLocal}
            onChange={handleBusquedaChange}
            placeholder="Buscar productos..."
            aria-label="Buscar productos por nombre o código"
            className="pl-8 sm:pl-10 text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100"
          />
        </div>
        
        {/* Filtro de categoría — SearchSelect con buscador integrado */}
        <div>
          <SearchSelect
            options={categoriaOptions}
            value={filters.categoria?.toString() || "todos"}
            onValueChange={handleCategoriaChange}
            placeholder="Categoría"
            searchPlaceholder="Buscar categoría..."
            emptyText="No se encontraron categorías"
            noneLabel="Todas"
            noneValue="todos"
            className="text-sm h-9 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100"
          />
        </div>
        
        {/* Filtro de estado */}
        <div>
          <Select 
            value={filters.estado || "todos"} 
            onValueChange={handleEstadoChange}
          >
            <SelectTrigger className="text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
              <SelectGroup>
                <SelectItem value="todos" className="text-sm dark:text-gray-200 dark:focus:bg-gray-800">Todos</SelectItem>
                <SelectItem value="active" className="text-sm dark:text-gray-200 dark:focus:bg-gray-800">Activo</SelectItem>
                <SelectItem value="inactive" className="text-sm dark:text-gray-200 dark:focus:bg-gray-800">Inactivo</SelectItem>
                <SelectItem value="discontinued" className="text-sm dark:text-gray-200 dark:focus:bg-gray-800">Descontinuado</SelectItem>
                <SelectItem value="deleted" className="text-sm dark:text-gray-200 dark:focus:bg-gray-800">Eliminado</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        
        {/* Ordenar por */}
        <div>
          <Select 
            value={filters.ordenarPor} 
            onValueChange={handleOrdenarPorChange}
          >
            <SelectTrigger className="text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
              <SelectGroup>
                <SelectItem value="name" className="text-sm dark:text-gray-200 dark:focus:bg-gray-800">Nombre</SelectItem>
                <SelectItem value="sku" className="text-sm dark:text-gray-200 dark:focus:bg-gray-800">Código (SKU)</SelectItem>
                <SelectItem value="price" className="text-sm dark:text-gray-200 dark:focus:bg-gray-800">Precio</SelectItem>
                <SelectItem value="created_at" className="text-sm dark:text-gray-200 dark:focus:bg-gray-800">Fecha</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        
      </div>
      
      {/* Botones de acción */}
      <div className="mt-3 sm:mt-4 flex justify-end gap-2">
        <Button 
          variant="outline" 
          onClick={() => onFiltersChange({
            busqueda: '',
            categoria: null,
            estado: '',
            ordenarPor: 'name',
            mostrarEliminados: false
          })}
          className="text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <span className="hidden sm:inline">Limpiar filtros</span>
          <span className="sm:hidden">Limpiar</span>
        </Button>
      </div>
    </div>
  );
};

export default FiltrosProductos;
