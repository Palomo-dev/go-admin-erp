'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { format } from 'date-fns';
import { 
  stockService, 
  type StockMovement, 
  type MovementStats as MovementStatsType,
  type MovementFilters as MovementFiltersType
} from '@/lib/services/stockService';
import { 
  MovimientosHeader, 
  MovimientosStats, 
  MovimientosFilters, 
  MovimientosTable 
} from '@/components/inventario/movimientos';
import { Loader2 } from 'lucide-react';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

export default function MovimientosPage() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const { organization, isLoading: loadingOrg } = useOrganization();

  // Estados de datos
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [stats, setStats] = useState<MovementStatsType>({
    totalMovements: 0,
    totalIn: 0,
    totalOut: 0,
    valueIn: 0,
    valueOut: 0
  });
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  // Estados de filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [branchId, setBranchId] = useState('all');
  const [source, setSource] = useState('all');
  const [direction, setDirection] = useState('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // Estados de paginación
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Estados de UI
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Obtener tipos de origen
  const sourceTypes = stockService.getSourceTypes();

  // Construir filtros
  const buildFilters = useCallback((): MovementFiltersType => {
    const filters: MovementFiltersType = {};

    if (branchId !== 'all') {
      filters.branchId = parseInt(branchId);
    }

    if (source !== 'all') {
      filters.source = source;
    }

    if (direction !== 'all') {
      filters.direction = direction as 'in' | 'out';
    }

    if (dateFrom) {
      filters.dateFrom = format(dateFrom, 'yyyy-MM-dd');
    }

    if (dateTo) {
      filters.dateTo = format(dateTo, 'yyyy-MM-dd');
    }

    if (searchTerm) {
      filters.searchTerm = searchTerm;
    }

    return filters;
  }, [branchId, source, direction, dateFrom, dateTo, searchTerm]);

  // Cargar datos iniciales
  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    try {
      setIsLoading(true);

      // Cargar sucursales
      const branchesData = await stockService.getBranches(organization.id);
      setBranches(branchesData);

      // Cargar movimientos y estadísticas
      await refreshData();
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron cargar los datos de movimientos'
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id]);

  // Refrescar datos de movimientos
  const refreshData = useCallback(async () => {
    if (!organization?.id) return;

    try {
      setIsRefreshing(true);

      const filters = buildFilters();

      const [movementsData, statsData] = await Promise.all([
        stockService.getStockMovements(organization.id, filters, currentPage, pageSize),
        stockService.getMovementStats(organization.id, filters)
      ]);

      if (movementsData.error) throw movementsData.error;

      setMovements(movementsData.data);
      setTotalCount(movementsData.count);
      setStats(statsData);
    } catch (error) {
      console.error('Error refrescando datos:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron actualizar los datos de movimientos'
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [organization?.id, buildFilters, currentPage, pageSize]);

  // Efecto para cargar datos iniciales
  useEffect(() => {
    if (organization?.id) {
      loadData();
    }
  }, [organization?.id, loadData]);

  // Efecto para refrescar cuando cambian los filtros
  useEffect(() => {
    if (organization?.id && !isLoading) {
      setCurrentPage(1);
      refreshData();
    }
  }, [branchId, source, direction, dateFrom, dateTo]);

  // Efecto para refrescar cuando cambia la página
  useEffect(() => {
    if (organization?.id && !isLoading) {
      refreshData();
    }
  }, [currentPage]);

  // Efecto para búsqueda con debounce
  useEffect(() => {
    if (organization?.id && !isLoading) {
      const timer = setTimeout(() => {
        setCurrentPage(1);
        refreshData();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [searchTerm]);

  // Exportar a CSV
  const handleExport = async () => {
    if (!organization?.id) return;

    try {
      const filters = buildFilters();
      const csv = await stockService.exportMovementsToCSV(organization.id, filters);

      if (!csv) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'No hay datos para exportar'
        });
        return;
      }

      // Crear y descargar archivo
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `movimientos_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();

      toast({
        title: 'Exportación exitosa',
        description: 'El archivo CSV ha sido descargado'
      });
    } catch (error) {
      console.error('Error exportando:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo exportar el archivo'
      });
    }
  };

  // Limpiar filtros
  const handleClearFilters = () => {
    setSearchTerm('');
    setBranchId('all');
    setSource('all');
    setDirection('all');
    setDateFrom(undefined);
    setDateTo(undefined);
    setCurrentPage(1);
  };

  const hasActiveFilters = 
    searchTerm !== '' || 
    branchId !== 'all' || 
    source !== 'all' || 
    direction !== 'all' || 
    dateFrom !== undefined || 
    dateTo !== undefined;

  // Calcular páginas
  const totalPages = Math.ceil(totalCount / pageSize);

  // Loading inicial
  if (loadingOrg || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Cargando...</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-6 p-6 ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'} min-h-screen`}>
      {/* Header */}
      <MovimientosHeader
        onExport={handleExport}
        onRefresh={refreshData}
        isLoading={isRefreshing}
      />

      {/* Estadísticas */}
      <MovimientosStats stats={stats} isLoading={isRefreshing} />

      {/* Filtros */}
      <MovimientosFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        branchId={branchId}
        onBranchChange={setBranchId}
        source={source}
        onSourceChange={setSource}
        direction={direction}
        onDirectionChange={setDirection}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        branches={branches}
        sourceTypes={sourceTypes}
        onClearFilters={handleClearFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Contador de resultados */}
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Mostrando {movements.length} de {totalCount} movimientos
        {currentPage > 1 && ` (página ${currentPage} de ${totalPages})`}
      </div>

      {/* Tabla */}
      <MovimientosTable
        data={movements}
        isLoading={isRefreshing}
      />

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>

              {/* Mostrar páginas */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <PaginationItem key={pageNum}>
                    <PaginationLink
                      onClick={() => setCurrentPage(pageNum)}
                      isActive={currentPage === pageNum}
                      className="cursor-pointer"
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}

              <PaginationItem>
                <PaginationNext
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
