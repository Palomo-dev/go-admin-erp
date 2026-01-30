'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { stockService, type StockLevel, type StockStats as StockStatsType } from '@/lib/services/stockService';
import { StockHeader, StockStats, StockFilters, StockTable } from '@/components/inventario/stock';
import { Loader2 } from 'lucide-react';

export default function StockPage() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const { organization, isLoading: loadingOrg } = useOrganization();

  // Estados de datos
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([]);
  const [stats, setStats] = useState<StockStatsType>({
    totalProducts: 0,
    totalValue: 0,
    belowMinimum: 0,
    outOfStock: 0,
    totalBranches: 0
  });
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);

  // Estados de filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [branchId, setBranchId] = useState('all');
  const [categoryId, setCategoryId] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');

  // Estados de UI
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Cargar datos iniciales
  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    try {
      setIsLoading(true);

      // Cargar sucursales y categorías
      const [branchesData, categoriesData] = await Promise.all([
        stockService.getBranches(organization.id),
        stockService.getCategories(organization.id)
      ]);

      setBranches(branchesData);
      setCategories(categoriesData);

      // Cargar stock y estadísticas
      await refreshData();
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron cargar los datos de stock'
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id]);

  // Refrescar datos de stock
  const refreshData = useCallback(async () => {
    if (!organization?.id) return;

    try {
      setIsRefreshing(true);

      const selectedBranchId = branchId !== 'all' ? parseInt(branchId) : undefined;

      const [stockData, statsData] = await Promise.all([
        stockService.getStockLevelsSimple(organization.id, selectedBranchId),
        stockService.getStockStats(organization.id, selectedBranchId)
      ]);

      if (stockData.error) throw stockData.error;

      setStockLevels(stockData.data);
      setStats(statsData);
    } catch (error) {
      console.error('Error refrescando datos:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron actualizar los datos de stock'
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [organization?.id, branchId]);

  // Efecto para cargar datos iniciales
  useEffect(() => {
    if (organization?.id) {
      loadData();
    }
  }, [organization?.id, loadData]);

  // Efecto para refrescar cuando cambia la sucursal
  useEffect(() => {
    if (organization?.id && !isLoading) {
      refreshData();
    }
  }, [branchId, refreshData]);

  // Filtrar datos localmente
  const filteredData = React.useMemo(() => {
    let filtered = [...stockLevels];

    // Filtro por búsqueda
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.products?.name?.toLowerCase().includes(term) ||
        item.products?.sku?.toLowerCase().includes(term) ||
        item.products?.barcode?.toLowerCase().includes(term)
      );
    }

    // Filtro por categoría
    if (categoryId !== 'all') {
      filtered = filtered.filter(item =>
        item.products?.category_id?.toString() === categoryId
      );
    }

    // Filtro por estado de stock
    if (stockFilter === 'available') {
      filtered = filtered.filter(item => (item.qty_on_hand || 0) > 0);
    } else if (stockFilter === 'low') {
      filtered = filtered.filter(item =>
        (item.qty_on_hand || 0) > 0 && (item.qty_on_hand || 0) < (item.min_level || 0)
      );
    } else if (stockFilter === 'out') {
      filtered = filtered.filter(item => (item.qty_on_hand || 0) <= 0);
    }

    return filtered;
  }, [stockLevels, searchTerm, categoryId, stockFilter]);

  // Exportar a CSV
  const handleExport = async () => {
    if (!organization?.id) return;

    try {
      const selectedBranchId = branchId !== 'all' ? parseInt(branchId) : undefined;
      const csv = await stockService.exportStockToCSV(organization.id, selectedBranchId);

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
      link.download = `stock_${new Date().toISOString().split('T')[0]}.csv`;
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
    setCategoryId('all');
    setStockFilter('all');
  };

  const hasActiveFilters = searchTerm !== '' || branchId !== 'all' || categoryId !== 'all' || stockFilter !== 'all';

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
      <StockHeader
        onExport={handleExport}
        onRefresh={refreshData}
        isLoading={isRefreshing}
      />

      {/* Estadísticas */}
      <StockStats stats={stats} isLoading={isRefreshing} />

      {/* Filtros */}
      <StockFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        branchId={branchId}
        onBranchChange={setBranchId}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        stockFilter={stockFilter}
        onStockFilterChange={setStockFilter}
        branches={branches}
        categories={categories}
        onClearFilters={handleClearFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Tabla con paginación integrada */}
      <StockTable
        data={filteredData}
        isLoading={isRefreshing}
      />
    </div>
  );
}
