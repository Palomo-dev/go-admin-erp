'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
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
import { DataTablePagination } from '@/components/ui/DataTablePagination';

export default function MovimientosPage() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const { organization, isLoading: loadingOrg } = useOrganization();
  const { branchFilter } = useBranch();

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
  const [pageSize, setPageSize] = useState(50);

  // Estados de UI
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [onlyIngredients, setOnlyIngredients] = useState(false);

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

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1);
  };

  // Sincronizar el filtro local con la sucursal seleccionada globalmente (header)
  useEffect(() => {
    setBranchId(branchFilter ? String(branchFilter) : 'all');
  }, [branchFilter]);

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
    setOnlyIngredients(false);
    setCurrentPage(1);
  };

  const hasActiveFilters = 
    searchTerm !== '' || 
    branchId !== 'all' || 
    source !== 'all' || 
    direction !== 'all' || 
    dateFrom !== undefined || 
    dateTo !== undefined ||
    onlyIngredients;

  // Filtrar movimientos por "Solo ingredientes" (client-side)
  const filteredMovements = onlyIngredients
    ? movements.filter((m) => m.note?.includes('Ingrediente de producto'))
    : movements;

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
    <div className="flex flex-col gap-6 p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
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
        onlyIngredients={onlyIngredients}
        onOnlyIngredientsChange={setOnlyIngredients}
      />

      {/* Contador de resultados */}
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Mostrando {filteredMovements.length} de {totalCount} movimientos
        {currentPage > 1 && ` (página ${currentPage} de ${totalPages})`}
      </div>

      {/* Tabla */}
      <MovimientosTable
        data={filteredMovements}
        isLoading={isRefreshing}
      />

      {/* Paginación */}
      <DataTablePagination
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalItems={totalCount}
        onPageChange={setCurrentPage}
        onPageSizeChange={handlePageSizeChange}
        pageSizeOptions={[10, 25, 50, 100]}
      />
    </div>
  );
}
