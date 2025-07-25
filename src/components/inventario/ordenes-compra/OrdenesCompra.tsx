'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
// Interfaces definidas para la estructura de datos de órdenes de compra
import {
  OrdenCompra,
} from './types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { 
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious, 
  PaginationEllipsis 
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Importaciones de componentes locales - importamos desde el índice 
// para evitar problemas con extensiones
import { FiltrosOrdenesCompra, ListaOrdenesCompra } from '.';

// Componente temporal de Spinner hasta que esté disponible en la UI
const Spinner = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClass = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  }[size];
  
  return (
    <div className={`animate-spin rounded-full border-2 border-t-transparent ${sizeClass}`} />
  );
};

// Exportamos como default para simplificar las importaciones
interface OrdenesCompraProps {
  isLoading?: boolean;
}

export default function OrdenesCompra({ isLoading: externalLoading }: OrdenesCompraProps = {}) {
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  // Si recibimos isLoading como prop, lo usamos; de lo contrario, usamos nuestro estado interno
  const [internalLoading, setInternalLoading] = useState<boolean>(true);
  const isLoading = externalLoading ?? internalLoading; // Usando el operador de coalescencia nula
  const [error, setError] = useState<string | null>(null);
  
  // Estados para paginación
  const [paginaActual, setPaginaActual] = useState<number>(1);
  const [itemsPorPagina, setItemsPorPagina] = useState<number>(10); // Por defecto 10 items según regla UX
  const [totalItems, setTotalItems] = useState<number>(0);
  
  // Utilizamos FiltrosOrdenCompra para gestionar los filtros de la consulta
  const [filtros, setFiltros] = useState<{
    status: string[];
    proveedor: string;
    fechaDesde: string;
    fechaHasta: string;
    branch: string;
    search: string;
  }>({
    status: [],
    proveedor: '',
    fechaDesde: '',
    fechaHasta: '',
    branch: '',
    search: ''
  });
  
  const { organization } = useOrganization();
  
  // Funciones auxiliares para aplicar filtros
  const aplicarFiltros = useCallback((query: any) => {
    // Aseguramos que status sea un array antes de verificar su longitud
    const statusArray = Array.isArray(filtros.status) ? filtros.status : [];
    if (statusArray.length > 0) {
      query = query.in('status', statusArray);
    }
    
    if (filtros.proveedor) {
      query = query.eq('supplier_id', filtros.proveedor);
    }
    
    if (filtros.branch) {
      query = query.eq('branch_id', filtros.branch);
    }
    
    if (filtros.fechaDesde) {
      query = query.gte('created_at', filtros.fechaDesde);
      
      if (filtros.fechaHasta) {
        query = query.lte('created_at', filtros.fechaHasta);
      }
    }
    
    if (filtros.search && filtros.search.trim() !== '') {
      // Si es un número, buscar por ID
      if (!isNaN(Number(filtros.search))) {
        query = query.eq('id', Number(filtros.search));
      }
    }
    
    return query;
  }, [filtros]);
  
  const cargarOrdenes = useCallback(async () => {
    if (externalLoading === undefined) setInternalLoading(true);
    setError(null);
    
    try {
      const offset = (paginaActual - 1) * itemsPorPagina;
      
      // OPTIMIZACIÓN: Una sola consulta con agregación para obtener lo necesario
      let query = supabase
        .from('purchase_orders')
        .select(`
          id, 
          supplier_id,
          branch_id,
          status,
          expected_date,
          total,
          created_at,
          updated_at,
          organization_id,
          created_by,
          notes,
          suppliers(id, name),
          branches(id, name),
          po_items(id)
        `, { count: 'exact' })
        .eq('organization_id', organization?.id || '')
        .order('created_at', { ascending: false })
        .range(offset, offset + itemsPorPagina - 1);
        
      // Aplicar filtros
      query = aplicarFiltros(query);
      
      if (filtros.search) {
        if (!isNaN(parseInt(filtros.search))) {
          query = query.eq('id', parseInt(filtros.search));
        } else {
          query = query.or(`suppliers.name.ilike.%${filtros.search}%`);
        }
      }
      
      const { data, error, count } = await query;
      
      if (error) {
        console.error('Error en la consulta optimizada:', error);
        throw error;
      }
      
      // Establecer el total de items una sola vez
      setTotalItems(count || 0);
      
      // OPTIMIZACIÓN: Procesamiento simplificado sin bucles adicionales
      const ordenesOptimizadas = (data || []).map((orden: any) => ({
        id: orden.id,
        organization_id: orden.organization_id,
        branch_id: orden.branch_id,
        supplier_id: orden.supplier_id,
        status: orden.status,
        expected_date: orden.expected_date,
        total: orden.total,
        created_at: orden.created_at,
        updated_at: orden.updated_at,
        created_by: orden.created_by,
        notes: orden.notes,
        // Datos relacionados simplificados
        suppliers: orden.suppliers || { id: orden.supplier_id, name: 'N/A' },
        branches: orden.branches || { id: orden.branch_id, name: 'N/A' },
        // Conteo de items calculado directamente
        po_items_count: Array.isArray(orden.po_items) ? orden.po_items.length : 0
      }));
      
      setOrdenes(ordenesOptimizadas);
    } catch (err: any) {
      console.error('Error al cargar órdenes de compra:', err);
      setError(err.message || 'Error al cargar órdenes de compra');
    } finally {
      if (externalLoading === undefined) setInternalLoading(false);
    }
  }, [organization?.id, filtros, paginaActual, itemsPorPagina, externalLoading, aplicarFiltros]);
  
  useEffect(() => {
    if (organization?.id) {
      cargarOrdenes();
    }
  }, [organization?.id, cargarOrdenes]);
  
  // Resetear página cuando cambien los filtros
  useEffect(() => {
    setPaginaActual(1);
  }, [filtros]);
  
  // Función para adaptar los filtros desde el componente FiltrosOrdenesCompra
  const adaptarFiltros = (nuevosFiltros: any) => {
    setFiltros({
      status: nuevosFiltros.status || [],
      proveedor: nuevosFiltros.supplier_id || '',
      fechaDesde: nuevosFiltros.dateRange?.from || '',
      fechaHasta: nuevosFiltros.dateRange?.to || '',
      branch: nuevosFiltros.branch_id || '',
      search: nuevosFiltros.searchTerm || ''
    });
  };
  
  // Funciones auxiliares para la paginación
  const totalPaginas = Math.ceil(totalItems / itemsPorPagina);
  
  const irAPagina = (pagina: number) => {
    if (pagina >= 1 && pagina <= totalPaginas) {
      setPaginaActual(pagina);
    }
  };
  
  const cambiarItemsPorPagina = (nuevosItems: string) => {
    setItemsPorPagina(Number(nuevosItems));
    setPaginaActual(1); // Resetear a la primera página
  };
  
  // Generar números de página para mostrar
  const generarNumerosPagina = () => {
    const paginas: (number | string)[] = [];
    const maxPaginasVisibles = 5;
    
    if (totalPaginas <= maxPaginasVisibles) {
      for (let i = 1; i <= totalPaginas; i++) {
        paginas.push(i);
      }
    } else {
      if (paginaActual <= 3) {
        for (let i = 1; i <= 4; i++) {
          paginas.push(i);
        }
        paginas.push('...');
        paginas.push(totalPaginas);
      } else if (paginaActual >= totalPaginas - 2) {
        paginas.push(1);
        paginas.push('...');
        for (let i = totalPaginas - 3; i <= totalPaginas; i++) {
          paginas.push(i);
        }
      } else {
        paginas.push(1);
        paginas.push('...');
        for (let i = paginaActual - 1; i <= paginaActual + 1; i++) {
          paginas.push(i);
        }
        paginas.push('...');
        paginas.push(totalPaginas);
      }
    }
    
    return paginas;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        <FiltrosOrdenesCompra onFiltrosChange={adaptarFiltros} />
        
        {isLoading ? (
          <div className="flex justify-center items-center p-8">
            <Spinner size="lg" />
            <span className="ml-4">Cargando órdenes...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Encabezado con información de resultados */}
            {totalItems > 0 && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b">
                <div className="text-sm text-muted-foreground">
                  Mostrando {Math.min((paginaActual - 1) * itemsPorPagina + 1, totalItems)} a{' '}
                  {Math.min(paginaActual * itemsPorPagina, totalItems)} de {totalItems} órdenes
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Mostrar</span>
                  <Select value={itemsPorPagina.toString()} onValueChange={cambiarItemsPorPagina}>
                    <SelectTrigger className="w-16 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground">por página</span>
                </div>
              </div>
            )}
            
            {/* Lista de órdenes */}
            <ListaOrdenesCompra ordenes={ordenes} onRefresh={cargarOrdenes} />
            
            {/* Controles de navegación de páginas */}
            {totalItems > 0 && totalPaginas > 1 && (
              <div className="flex justify-center pt-6 border-t">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        disabled={paginaActual === 1}
                        onClick={() => irAPagina(paginaActual - 1)}
                      />
                    </PaginationItem>
                    
                    {generarNumerosPagina().map((pagina, index) => (
                      <PaginationItem key={`pagina-${pagina}-${index}`}>
                        {pagina === '...' ? (
                          <PaginationEllipsis />
                        ) : (
                          <PaginationLink
                            isActive={pagina === paginaActual}
                            onClick={() => irAPagina(pagina as number)}
                          >
                            {pagina}
                          </PaginationLink>
                        )}
                      </PaginationItem>
                    ))}
                    
                    <PaginationItem>
                      <PaginationNext 
                        disabled={paginaActual === totalPaginas}
                        onClick={() => irAPagina(paginaActual + 1)}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
