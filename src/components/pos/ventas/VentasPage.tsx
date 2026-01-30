'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  RefreshCw,
  Download,
  ArrowLeft,
  FileText
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { VentasService } from './VentasService';
import { VentasTable } from './VentasTable';
import { VentasFilters } from './VentasFilters';
import { SaleWithDetails, SalesFilter } from './types';
import { PrintService } from '@/lib/services/printService';

export function VentasPage() {
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const [sales, setSales] = useState<SaleWithDetails[]>([]);
  const [totalSales, setTotalSales] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<SalesFilter>({});
  const limit = 20;

  const loadSales = useCallback(async () => {
    if (!organization?.id) return;
    
    setIsLoading(true);
    try {
      const { data, total } = await VentasService.getSales(filters, currentPage, limit);
      setSales(data);
      setTotalSales(total);
    } catch (error) {
      console.error('Error loading sales:', error);
    } finally {
      setIsLoading(false);
    }
  }, [organization, filters, currentPage]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  const handleView = (sale: SaleWithDetails) => {
    router.push(`/app/pos/ventas/${sale.id}`);
  };

  const handleDuplicate = async (sale: SaleWithDetails) => {
    const result = await VentasService.duplicateSale(sale.id);
    if (result) {
      // Guardar en sessionStorage para cargar en nueva venta
      sessionStorage.setItem('duplicateSaleItems', JSON.stringify(result.items));
      router.push('/app/pos/ventas/nuevo?duplicate=true');
    }
  };

  const handleCancel = async (sale: SaleWithDetails) => {
    if (!confirm('¿Está seguro de anular esta venta? Esta acción no se puede deshacer.')) {
      return;
    }

    const reason = prompt('Ingrese el motivo de la anulación:');
    const success = await VentasService.cancelSale(sale.id, reason || undefined);
    
    if (success) {
      loadSales();
      alert('Venta anulada correctamente');
    } else {
      alert('Error al anular la venta');
    }
  };

  const handlePrint = async (sale: SaleWithDetails) => {
    try {
      const fullSale = await VentasService.getSaleById(sale.id);
      if (fullSale) {
        PrintService.smartPrint(
          fullSale,
          fullSale.items || [],
          fullSale.customer,
          fullSale.payments || [],
          organization?.name || 'Mi Empresa',
          ''
        );
      }
    } catch (error) {
      console.error('Error printing sale:', error);
      alert('Error al imprimir');
    }
  };

  const handleCreateReturn = (sale: SaleWithDetails) => {
    router.push(`/app/pos/devoluciones/nuevo?sale_id=${sale.id}`);
  };

  const handleFiltersChange = (newFilters: SalesFilter) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setFilters({});
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(totalSales / limit);

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/app/pos">
            <Button variant="ghost" size="icon" className="dark:text-gray-400 dark:hover:text-white">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
              Historial de Ventas
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {totalSales} ventas encontradas
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={loadSales} className="dark:border-gray-700 dark:text-gray-300">
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Link href="/app/pos/ventas/nuevo">
            <Button className="bg-blue-500 hover:bg-blue-600 text-white">
              <Plus className="h-4 w-4 mr-2" />
              Nueva Venta
            </Button>
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-4">
          <VentasFilters
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onClearFilters={handleClearFilters}
          />
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-0">
          <VentasTable
            sales={sales}
            onView={handleView}
            onDuplicate={handleDuplicate}
            onCancel={handleCancel}
            onPrint={handlePrint}
            onCreateReturn={handleCreateReturn}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Mostrando {((currentPage - 1) * limit) + 1} - {Math.min(currentPage * limit, totalSales)} de {totalSales}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="dark:border-gray-700 dark:text-gray-300"
            >
              Anterior
            </Button>
            <span className="flex items-center px-3 text-sm dark:text-gray-300">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="dark:border-gray-700 dark:text-gray-300"
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
