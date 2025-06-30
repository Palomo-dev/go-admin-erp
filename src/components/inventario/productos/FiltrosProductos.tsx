"use client";

import React, { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
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
import { FiltrosProductos as FiltrosProductosType, Categoria } from './types';
import { supabase } from '@/lib/supabase/config';
import { debounce } from '@/utils/Utils';

interface FiltrosProductosProps {
  filters: FiltrosProductosType;
  onFiltersChange: (filters: FiltrosProductosType) => void;
}

/**
 * Componente para filtros de búsqueda de productos
 */
const FiltrosProductos: React.FC<FiltrosProductosProps> = ({ filters, onFiltersChange }) => {
  const { theme } = useTheme();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [busquedaLocal, setBusquedaLocal] = useState<string>(filters.busqueda);
  
  // Cargar categorías desde Supabase
  useEffect(() => {
    const fetchCategorias = async () => {
      try {
        // Obtener el ID de organización del almacenamiento local
        let organizationId = null;
        
        if (typeof window !== 'undefined') {
          // Obtener directamente el currentOrganizationId guardado durante la autenticación
          const orgId = localStorage.getItem('currentOrganizationId');
          if (orgId) {
            organizationId = parseInt(orgId, 10);
          }
          
          // Si no existe en localStorage, buscar en sessionStorage
          if (!organizationId) {
            const sessionOrgId = sessionStorage.getItem('currentOrganizationId');
            if (sessionOrgId) {
              organizationId = parseInt(sessionOrgId, 10);
            }
          }
          
          // Si aún no hay ID, buscar en el formato anterior (selectedOrganization)
          if (!organizationId) {
            // Intentar formato anterior (compatibilidad)
            const storedOrg = localStorage.getItem('selectedOrganization');
            if (storedOrg) {
              try {
                const parsedOrg = JSON.parse(storedOrg);
                organizationId = parsedOrg.id || parsedOrg.organization_id;
              } catch (e) {
                console.error('Error al parsear organización del localStorage:', e);
              }
            }

            // Verificar en sessionStorage con formato anterior
            if (!organizationId) {
              const sessionOrg = sessionStorage.getItem('selectedOrganization');
              if (sessionOrg) {
                try {
                  const parsedOrg = JSON.parse(sessionOrg);
                  organizationId = parsedOrg.id || parsedOrg.organization_id;
                } catch (e) {
                  console.error('Error al parsear organización del sessionStorage:', e);
                }
              }
            }
          }
        }

        if (!organizationId) {
          throw new Error('No se encontró el ID de la organización');
        }

        const { data, error } = await supabase
          .from('categories')
          .select('*')
          .eq('organization_id', organizationId)
          .order('name');
          
        if (error) throw error;
        
        setCategorias(data || []);
      } catch (error) {
        console.error('Error al cargar categorías:', error);
      }
    };

    fetchCategorias();
  }, []);

  // Función debounce para la búsqueda
  const debouncedSearch = React.useCallback(
    debounce((value: string) => {
      onFiltersChange({ ...filters, busqueda: value });
    }, 500),
    [filters, onFiltersChange]
  );

  // Manejadores de cambios en filtros
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

  const handleEstadoChange = (value: string) => {
    onFiltersChange({ ...filters, estado: value });
  };

  const handleOrdenarPorChange = (value: string) => {
    onFiltersChange({ ...filters, ordenarPor: value });
  };

  return (
    <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-900/50 border-gray-800' : 'bg-gray-50/80 border-gray-200'}`}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Búsqueda */}
        <div className="relative">
          <Search className={`absolute left-3 top-3 h-4 w-4 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} />
          <Input
            value={busquedaLocal}
            onChange={handleBusquedaChange}
            placeholder="Buscar por nombre, código o barcode"
            className={`pl-10 ${theme === 'dark' ? 'bg-gray-950 border-gray-800' : ''}`}
          />
        </div>
        
        {/* Filtro de categoría */}
        <div>
          <Select 
            value={filters.categoria?.toString() || "todos"} 
            onValueChange={handleCategoriaChange}
          >
            <SelectTrigger className={theme === 'dark' ? 'bg-gray-950 border-gray-800' : ''}>
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent className={theme === 'dark' ? 'bg-gray-950 border-gray-800' : ''}>
              <SelectGroup>
                <SelectItem value="todos">Todas las categorías</SelectItem>
                {categorias.map((categoria) => (
                  <SelectItem key={categoria.id} value={categoria.id.toString()}>
                    {categoria.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        
        {/* Filtro de estado */}
        <div>
          <Select 
            value={filters.estado || "todos"} 
            onValueChange={handleEstadoChange}
          >
            <SelectTrigger className={theme === 'dark' ? 'bg-gray-950 border-gray-800' : ''}>
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent className={theme === 'dark' ? 'bg-gray-950 border-gray-800' : ''}>
              <SelectGroup>
                <SelectItem value="todos">Todos los estados</SelectItem>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="inactive">Inactivo</SelectItem>
                <SelectItem value="discontinued">Descontinuado</SelectItem>
                <SelectItem value="deleted">Eliminado</SelectItem>
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
            <SelectTrigger className={theme === 'dark' ? 'bg-gray-950 border-gray-800' : ''}>
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent className={theme === 'dark' ? 'bg-gray-950 border-gray-800' : ''}>
              <SelectGroup>
                <SelectItem value="name">Nombre</SelectItem>
                <SelectItem value="sku">Código (SKU)</SelectItem>
                <SelectItem value="price">Precio</SelectItem>
                <SelectItem value="created_at">Fecha de creación</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        
      </div>
      
      {/* Botones de acción */}
      <div className="mt-4 flex justify-end gap-2">
        <Button 
          variant="outline" 
          onClick={() => onFiltersChange({
            busqueda: '',
            categoria: null,
            estado: '',
            ordenarPor: 'name'
          })}
          className={theme === 'dark' ? 'dark:border-gray-700 dark:text-gray-300' : ''}
        >
          Limpiar filtros
        </Button>
      </div>
    </div>
  );
};

export default FiltrosProductos;
