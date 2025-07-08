'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
// Interfaces definidas para la estructura de datos de órdenes de compra
import { OrdenCompra, FiltrosOrdenCompra, OrdenCompraFiltros } from './types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

// Definición del tipo para los datos que realmente retorna Supabase
type SupabaseOrderResponse = {
  id: number;
  organization_id: number;
  branch_id: number;
  supplier_id: number;
  status: string;
  expected_date: string | null;
  total: number;
  created_at: string;
  updated_at: string | null;
  created_by: number | null;
  notes: string | null;
  // En Supabase, con joins, estos campos llegan como arrays con los nombres definidos en la consulta
  supplier: { id: number; name: string }[];
  branch: { id: number; name: string }[];
  // Este campo puede no existir inicialmente
  po_items_count?: number;
};

// Importaciones de componentes locales - importamos desde el índice 
// para evitar problemas con extensiones
import { FiltrosOrdenesCompra, ListaOrdenesCompra } from './';

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
  // Utilizamos FiltrosOrdenCompra para gestionar los filtros de la consulta
  const [filtros, setFiltros] = useState<FiltrosOrdenCompra>({
    status: [],
    supplier_id: null,
    branch_id: null,
    dateRange: { from: null, to: null },
    search: ''
  });
  
  const { organization } = useOrganization();
  
  useEffect(() => {
    if (organization?.id) {
      cargarOrdenes();
    }
  }, [organization?.id, filtros]);
  
  // Funciones auxiliares para aplicar filtros y obtener conteo de items
  const aplicarFiltros = (query: any) => {
    // Aseguramos que status sea un array antes de verificar su longitud
    const statusArray = Array.isArray(filtros.status) ? filtros.status : [];
    if (statusArray.length > 0) {
      query = query.in('status', statusArray);
    }
    
    if (filtros.supplier_id) {
      query = query.eq('supplier_id', filtros.supplier_id);
    }
    
    if (filtros.branch_id) {
      query = query.eq('branch_id', filtros.branch_id);
    }
    
    if (filtros.dateRange?.from) {
      query = query.gte('created_at', filtros.dateRange.from.toISOString());
      
      if (filtros.dateRange.to) {
        query = query.lte('created_at', filtros.dateRange.to.toISOString());
      }
    }
    
    if (filtros.search && filtros.search.trim() !== '') {
      // Si es un número, buscar por ID
      if (!isNaN(Number(filtros.search))) {
        query = query.eq('id', Number(filtros.search));
      }
    }
    
    return query;
  };
  
  const obtenerConteoPorOrden = async (ordenes: any[]) => {
    if (!Array.isArray(ordenes) || ordenes.length === 0) return;
    
    for (const orden of ordenes) {
      if (orden && typeof orden === 'object' && 'id' in orden) {
        const { count, error: countError } = await supabase
          .from('po_items')
          .select('*', { count: 'exact', head: true })
          .eq('purchase_order_id', orden.id);
          
        if (countError) {
          console.error(`Error al obtener el conteo de items para orden ${orden.id}:`, countError);
        } else {
          orden.po_items_count = count || 0;
        }
      }
    }
  };
  
  const cargarOrdenes = async () => {
    if (externalLoading === undefined) setInternalLoading(true);
    setError(null);
    console.log('Cargando órdenes para organización:', organization?.id);
    
    try {
      // Crear y aplicar filtros a la consulta - seleccionamos solo campos existentes
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
          supplier:suppliers(id, name),
          branch:branches(id, name)
        `)
        .eq('organization_id', organization?.id || '')
        .order('created_at', { ascending: false });
        
      // Aplicar todos los filtros a través de la función auxiliar
      query = aplicarFiltros(query);
      if (filtros.search) {
        // Buscar por ID de orden 
        const searchTerm = `%${filtros.search}%`;
        if (!isNaN(parseInt(filtros.search))) {
          query = query.eq('id', parseInt(filtros.search));
        } else {
          query = query.or(`suppliers.name.ilike.${searchTerm}`);
        }
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Error en la consulta:', error);
        throw error;
      }
      
      console.log('Datos recibidos:', data?.length || 0, 'órdenes');
      
      // Obtener el conteo de items para cada orden
      if (Array.isArray(data) && data.length > 0) {
        await obtenerConteoPorOrden(data);
      }
      
      // Procesamiento de los datos para adaptarlos a nuestra interfaz
      const ordenesConConteo = Array.isArray(data) ? 
        data.map((orden: SupabaseOrderResponse) => {
          // Crear el objeto con tipado correcto
          const ordenProcesada: OrdenCompra = {
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
            
            // Extraer el proveedor del array si existe
            suppliers: Array.isArray(orden.supplier) && orden.supplier.length > 0 
              ? { id: orden.supplier[0].id, name: orden.supplier[0].name } 
              : undefined,
            
            // Extraer la sucursal del array si existe
            branches: Array.isArray(orden.branch) && orden.branch.length > 0 
              ? { id: orden.branch[0].id, name: orden.branch[0].name } 
              : undefined,
              
            // Asignar el conteo de ítems o 0 si no existe
            po_items_count: orden.po_items_count ?? 0
          };
          
          return ordenProcesada;
        }) : [];
      
      setOrdenes(ordenesConConteo);
    } catch (err: any) {
      console.error('Error al cargar órdenes de compra:', err);
      setError(err.message || 'Error al cargar órdenes de compra');
    } finally {
      if (externalLoading === undefined) setInternalLoading(false);
    }
  };
  
  // Función auxiliar para convertir de los filtros antiguos al nuevo formato
  // Nota: Esta función se mantiene por compatibilidad mientras se completa la migración
  const convertirFiltros = (filtrosAntiguos: OrdenCompraFiltros): FiltrosOrdenCompra => {
    return {
      status: filtrosAntiguos.status || [],
      supplier_id: filtrosAntiguos.supplier_id,
      branch_id: filtrosAntiguos.branch_id,
      dateRange: {
        from: filtrosAntiguos.dateRange?.from || null,
        to: filtrosAntiguos.dateRange?.to || null
      },
      search: filtrosAntiguos.searchTerm || ''
    };
  };

  // Función para adaptar los filtros desde el componente FiltrosOrdenesCompra
  // Utilizamos la interfaz OrdenCompraFiltros aunque está marcada como deprecated
  // para mantener compatibilidad con componentes existentes
  const adaptarFiltros = (nuevosFiltros: OrdenCompraFiltros): void => {
    // Convertimos de OrdenCompraFiltros a FiltrosOrdenCompra
    setFiltros(convertirFiltros(nuevosFiltros));
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
          <ListaOrdenesCompra ordenes={ordenes} onRefresh={cargarOrdenes} />
        )}
      </div>
    </div>
  );
}
