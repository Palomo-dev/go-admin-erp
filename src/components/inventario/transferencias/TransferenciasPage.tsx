'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Truck, RefreshCw } from 'lucide-react';
import { TransferenciasTable } from './TransferenciasTable';
import { TransferenciasFiltros } from './TransferenciasFiltros';
import { TransferenciasService } from './TransferenciasService';
import { InventoryTransfer, FiltrosTransferencias } from './types';
import { useToast } from '@/components/ui/use-toast';
import { DataTablePagination } from '@/components/ui/DataTablePagination';

export function TransferenciasPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [transferencias, setTransferencias] = useState<InventoryTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [filtros, setFiltros] = useState<FiltrosTransferencias>({
    busqueda: '',
    estado: 'todos',
    origen: 'todos',
    destino: 'todos',
    fechaDesde: '',
    fechaHasta: ''
  });

  useEffect(() => {
    cargarTransferencias();
  }, [filtros, currentPage, pageSize]);

  const cargarTransferencias = async () => {
    try {
      setLoading(true);
      const response = await TransferenciasService.obtenerTransferencias(
        filtros,
        currentPage,
        pageSize
      );
      setTransferencias(response.transferencias);
      setTotal(response.total);
      setTotalPages(response.totalPages);
    } catch (error) {
      console.error('Error cargando transferencias:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las transferencias',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleNuevaTransferencia = () => {
    router.push('/app/inventario/transferencias/nuevo');
  };

  const handleMarcarEnTransito = async (id: number) => {
    if (!confirm('¿Confirmar envío de la transferencia? Se descontará el stock del origen.')) {
      return;
    }

    try {
      await TransferenciasService.actualizarEstado(id, 'in_transit');
      toast({
        title: 'Transferencia enviada',
        description: 'La transferencia está ahora en tránsito'
      });
      cargarTransferencias();
    } catch (error) {
      console.error('Error marcando en tránsito:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado',
        variant: 'destructive'
      });
    }
  };

  const handleCancelar = async (id: number) => {
    if (!confirm('¿Está seguro de cancelar esta transferencia?')) {
      return;
    }

    try {
      await TransferenciasService.cancelarTransferencia(id);
      toast({
        title: 'Transferencia cancelada',
        description: 'La transferencia ha sido cancelada'
      });
      cargarTransferencias();
    } catch (error) {
      console.error('Error cancelando transferencia:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cancelar la transferencia',
        variant: 'destructive'
      });
    }
  };

  const handleFiltrosChange = (nuevosFiltros: FiltrosTransferencias) => {
    setFiltros(nuevosFiltros);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1);
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
            <Truck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Transferencias de Inventario
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Gestión de transferencias entre sucursales
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={cargarTransferencias}
            disabled={loading}
            className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button
            onClick={handleNuevaTransferencia}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nueva Transferencia
          </Button>
        </div>
      </div>

      {/* Contenido */}
      <Card className="p-6 dark:bg-gray-800/50 dark:border-gray-700 bg-white border-gray-200">
        <TransferenciasFiltros onFiltrosChange={handleFiltrosChange} />
        
        <TransferenciasTable
          transferencias={transferencias}
          loading={loading}
          onMarcarEnTransito={handleMarcarEnTransito}
          onCancelar={handleCancelar}
        />

        {/* Paginación */}
        <DataTablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={total}
          onPageChange={setCurrentPage}
          onPageSizeChange={handlePageSizeChange}
          pageSizeOptions={[10, 25, 50, 100]}
        />
      </Card>
    </div>
  );
}
