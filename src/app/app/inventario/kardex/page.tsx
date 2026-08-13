'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { format } from 'date-fns';
import {
  kardexService,
  type KardexEntry,
  type KardexStats as KardexStatsType,
  type KardexFilters as KardexFiltersType,
  type ProductInfo,
} from '@/lib/services/kardexService';
import {
  KardexHeader,
  KardexStats,
  KardexFilters,
  KardexTable,
} from '@/components/inventario/kardex';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { PageHeaderSkeleton, DetailSkeleton } from '@/components/common/PageSkeletons';

export default function KardexPage() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { organization, isLoading: loadingOrg } = useOrganization();

  // Obtener productId del query param
  const productIdParam = searchParams.get('producto');
  const productId = productIdParam ? parseInt(productIdParam) : null;

  // Estados de datos
  const [entries, setEntries] = useState<KardexEntry[]>([]);
  const [stats, setStats] = useState<KardexStatsType>({
    totalIn: 0,
    totalOut: 0,
    balance: 0,
    valueIn: 0,
    valueOut: 0,
    totalMovements: 0,
  });
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  // Estados de filtros
  const [branchId, setBranchId] = useState('all');
  const [source, setSource] = useState('all');
  const [direction, setDirection] = useState('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // UI
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Source types (mismo mapa que en MovimientosTable)
  const sourceTypes = [
    { value: 'sale', label: 'Venta' },
    { value: 'purchase', label: 'Compra' },
    { value: 'transfer', label: 'Transferencia' },
    { value: 'adjustment', label: 'Ajuste' },
    { value: 'initial', label: 'Inventario Inicial' },
    { value: 'invoice_sale', label: 'Venta (Factura)' },
    { value: 'folio_item', label: 'Folio' },
    { value: 'room_consumption', label: 'Consumo Habitación' },
    { value: 'mesa_sale', label: 'Venta Mesa' },
  ];

  // buildFilters (igual patrón que movimientos pero sin searchTerm)
  const buildFilters = useCallback((): KardexFiltersType => {
    const filters: KardexFiltersType = {};
    if (branchId !== 'all') filters.branchId = parseInt(branchId);
    if (source !== 'all') filters.source = source;
    if (direction !== 'all') filters.direction = direction as 'in' | 'out';
    if (dateFrom) filters.dateFrom = format(dateFrom, 'yyyy-MM-dd');
    if (dateTo) filters.dateTo = format(dateTo, 'yyyy-MM-dd');
    return filters;
  }, [branchId, source, direction, dateFrom, dateTo]);

  // refreshData: cargar entries y stats
  const refreshData = useCallback(async () => {
    if (!organization?.id || !productId) return;
    try {
      setIsRefreshing(true);
      const filters = buildFilters();
      const [kardexData, statsData] = await Promise.all([
        kardexService.getKardex(organization.id, productId, filters, currentPage, pageSize),
        kardexService.getKardexStats(organization.id, productId, filters),
      ]);
      setEntries(kardexData.data);
      setTotalCount(kardexData.count);
      setStats(statsData);
    } catch (error) {
      console.error('Error refrescando kardex:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo actualizar el kardex',
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [organization?.id, productId, buildFilters, currentPage, pageSize]);

  // loadData inicial: cargar productInfo, branches, y luego refreshData
  const loadData = useCallback(async () => {
    if (!organization?.id || !productId) return;
    try {
      setIsLoading(true);
      const [info, branchesData] = await Promise.all([
        kardexService.getProductInfo(productId),
        kardexService.getBranches(organization.id),
      ]);
      setProductInfo(info);
      setBranches(branchesData);
      await refreshData();
    } catch (error) {
      console.error('Error cargando datos del kardex:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo cargar el kardex',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, productId, refreshData]);

  // handlePageSizeChange
  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1);
  };

  // handleExport
  const handleExport = () => {
    if (!productInfo || entries.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No hay datos para exportar',
      });
      return;
    }
    try {
      const csv = kardexService.exportKardexToCSV(entries, productInfo.name);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `kardex_${productInfo.sku}_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      toast({
        title: 'Exportación exitosa',
        description: 'El archivo CSV ha sido descargado',
      });
    } catch (error) {
      console.error('Error exportando:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo exportar',
      });
    }
  };

  // handleClearFilters
  const handleClearFilters = () => {
    setBranchId('all');
    setSource('all');
    setDirection('all');
    setDateFrom(undefined);
    setDateTo(undefined);
    setCurrentPage(1);
  };

  const hasActiveFilters =
    branchId !== 'all' ||
    source !== 'all' ||
    direction !== 'all' ||
    dateFrom !== undefined ||
    dateTo !== undefined;

  const totalPages = Math.ceil(totalCount / pageSize);

  // useEffect para cargar datos iniciales
  useEffect(() => {
    if (organization?.id && productId) {
      loadData();
    }
  }, [organization?.id, productId, loadData]);

  // useEffect para refrescar cuando cambian filtros
  useEffect(() => {
    if (organization?.id && productId && !isLoading) {
      setCurrentPage(1);
      refreshData();
    }
  }, [branchId, source, direction, dateFrom, dateTo]);

  // useEffect para refrescar cuando cambia la página
  useEffect(() => {
    if (organization?.id && productId && !isLoading) {
      refreshData();
    }
  }, [currentPage, pageSize]);

  // Render loading
  if (loadingOrg || isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <DetailSkeleton />
      </div>
    );
  }

  // Render sin productId
  if (!productId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center bg-gray-50 dark:bg-gray-900 min-h-screen">
        <p className="text-gray-500 dark:text-gray-400">No se especificó un producto</p>
      </div>
    );
  }

  // Render producto no encontrado
  if (!productInfo) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center bg-gray-50 dark:bg-gray-900 min-h-screen">
        <p className="text-gray-500 dark:text-gray-400">Producto no encontrado</p>
      </div>
    );
  }

  // Render principal
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <KardexHeader
        productName={productInfo.name}
        productSku={productInfo.sku}
        productUuid={productInfo.uuid}
        onRefresh={refreshData}
        onExport={handleExport}
        isLoading={isRefreshing}
      />

      {/* Estadísticas */}
      <KardexStats stats={stats} isLoading={isRefreshing} />

      {/* Filtros */}
      <KardexFilters
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

      {/* Contador */}
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Mostrando {entries.length} de {totalCount} movimientos
        {currentPage > 1 && ` (página ${currentPage} de ${totalPages})`}
      </div>

      {/* Tabla */}
      <KardexTable data={entries} isLoading={isRefreshing} />

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
