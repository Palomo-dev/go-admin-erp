'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Eye, 
  Edit, 
  Trash2, 
  CreditCard, 
  Package,
  AlertTriangle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { FacturasCompraService } from './FacturasCompraService';
import { InvoicePurchase, FiltrosFacturasCompra } from './types';
import { formatCurrency, formatDate, cn } from '@/utils/Utils';
import { Pagination } from '@/components/ui/pagination';
import { RegistrarPagoModal } from './RegistrarPagoModal';

export type { FiltrosFacturasCompra };

interface FacturasCompraTableProps {
  filtros: FiltrosFacturasCompra;
}

export function FacturasCompraTable({ filtros }: FacturasCompraTableProps) {
  const router = useRouter();
  const [facturas, setFacturas] = useState<InvoicePurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [showPagoModal, setShowPagoModal] = useState(false);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<InvoicePurchase | null>(null);
  const pageSize = 10;

  // Cargar facturas
  useEffect(() => {
    cargarFacturas();
  }, [filtros, currentPage]);

  const cargarFacturas = async () => {
    try {
      setLoading(true);
      const response = await FacturasCompraService.obtenerFacturas(
        filtros,
        currentPage,
        pageSize
      );
      
      setFacturas(response.facturas);
      setTotal(response.total);
      setTotalPages(response.totalPages);
    } catch (error) {
      console.error('Error cargando facturas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerDetalles = (id: string) => {
    router.push(`/app/finanzas/facturas-compra/${id}`);
  };

  const handleEditarFactura = (id: string) => {
    router.push(`/app/finanzas/facturas-compra/${id}/editar`);
  };

  const handleEliminarFactura = async (id: string) => {
    if (!confirm('¿Está seguro de que desea eliminar esta factura?')) return;

    try {
      await FacturasCompraService.eliminarFactura(id);
      cargarFacturas(); // Recargar la lista
    } catch (error) {
      console.error('Error eliminando factura:', error);
      alert('Error al eliminar la factura. Solo se pueden eliminar facturas en estado borrador.');
    }
  };

  const handleRegistrarPago = (factura: InvoicePurchase) => {
    setFacturaSeleccionada(factura);
    setShowPagoModal(true);
  };

  const handleRecepcionar = (id: string) => {
    // TODO: Implementar navegación a entrada de inventario
    router.push(`/app/inventario/entradas/nueva?factura_id=${id}`);
  };

  const getEstadoBadge = (status: InvoicePurchase['status']) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary" className="dark:bg-gray-700">Borrador</Badge>;
      case 'received':
        return <Badge variant="default" className="bg-blue-500">Recibida</Badge>;
      case 'partial':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Parcial</Badge>;
      case 'paid':
        return <Badge variant="default" className="bg-green-500">Pagada</Badge>;
      case 'void':
        return <Badge variant="destructive">Anulada</Badge>;
      default:
        return <Badge variant="secondary">Desconocido</Badge>;
    }
  };

  const getRowClassName = (factura: InvoicePurchase) => {
    if (factura.status === 'void') {
      return 'opacity-50 bg-red-50 dark:bg-red-900/10';
    }
    
    if (factura.due_date && factura.balance > 0) {
      const vencimiento = new Date(factura.due_date);
      const hoy = new Date();
      const diasVencimiento = Math.ceil((vencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diasVencimiento < 0) {
        return 'bg-red-50 dark:bg-red-900/10 border-l-4 border-red-500';
      } else if (diasVencimiento <= 7) {
        return 'bg-yellow-50 dark:bg-yellow-900/10 border-l-4 border-yellow-500';
      }
    }
    
    return '';
  };

  const changePage = (page: number) => {
    setCurrentPage(page);
  };

  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      
      if (currentPage > 3) {
        pages.push('...');
      }
      
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (currentPage < totalPages - 2) {
        pages.push('...');
      }
      
      pages.push(totalPages);
    }
    
    return pages;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border dark:border-gray-700">
        <Table>
          <TableHeader>
            <TableRow className="dark:border-gray-700">
              <TableHead className="dark:text-gray-300">Núm. Factura</TableHead>
              <TableHead className="dark:text-gray-300">Proveedor</TableHead>
              <TableHead className="dark:text-gray-300">Fecha Emisión</TableHead>
              <TableHead className="dark:text-gray-300">Vencimiento</TableHead>
              <TableHead className="dark:text-gray-300">Total</TableHead>
              <TableHead className="dark:text-gray-300">Balance</TableHead>
              <TableHead className="dark:text-gray-300">Estado</TableHead>
              <TableHead className="dark:text-gray-300">Moneda</TableHead>
              <TableHead className="dark:text-gray-300 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {facturas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No se encontraron facturas de compra
                </TableCell>
              </TableRow>
            ) : (
              facturas.map((factura) => (
                <TableRow 
                  key={factura.id} 
                  className={cn(
                    "dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50",
                    getRowClassName(factura)
                  )}
                >
                  <TableCell className="font-medium dark:text-gray-200">
                    <div className="flex items-center space-x-2">
                      <span>{factura.number_ext}</span>
                      {factura.due_date && factura.balance > 0 && new Date(factura.due_date) < new Date() && (
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="dark:text-gray-300">
                    <div>
                      <div className="font-medium">{factura.supplier?.name}</div>
                      {factura.supplier?.nit && (
                        <div className="text-sm text-gray-500">{factura.supplier.nit}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="dark:text-gray-300">
                    {factura.issue_date ? formatDate(new Date(factura.issue_date)) : '-'}
                  </TableCell>
                  <TableCell className="dark:text-gray-300">
                    {factura.due_date ? formatDate(new Date(factura.due_date)) : '-'}
                  </TableCell>
                  <TableCell className="dark:text-gray-300">
                    {formatCurrency(factura.total, factura.currency)}
                  </TableCell>
                  <TableCell className="dark:text-gray-300">
                    <span className={cn(
                      factura.balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                    )}>
                      {formatCurrency(factura.balance, factura.currency)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {getEstadoBadge(factura.status)}
                  </TableCell>
                  <TableCell className="dark:text-gray-300">
                    {factura.currency}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleVerDetalles(factura.id)}
                        className="h-8 w-8 p-0 dark:hover:bg-gray-700"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      
                      {factura.status === 'draft' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditarFactura(factura.id)}
                          className="h-8 w-8 p-0 dark:hover:bg-gray-700"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      
                      {factura.status === 'received' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRecepcionar(factura.id)}
                          className="h-8 w-8 p-0 dark:hover:bg-gray-700"
                          title="Recepcionar a Inventario"
                        >
                          <Package className="h-4 w-4" />
                        </Button>
                      )}
                      
                      {factura.balance > 0 && ['received', 'partial'].includes(factura.status) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRegistrarPago(factura)}
                          className="h-8 w-8 p-0 dark:hover:bg-gray-700"
                          title="Registrar Pago"
                        >
                          <CreditCard className="h-4 w-4" />
                        </Button>
                      )}
                      
                      {factura.status === 'draft' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEliminarFactura(factura.id)}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-gray-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Mostrando {((currentPage - 1) * pageSize) + 1} a {Math.min(currentPage * pageSize, total)} de {total} facturas
          </div>
          
          <Pagination>
            <Button
              variant="outline"
              size="sm"
              onClick={() => changePage(currentPage - 1)}
              disabled={currentPage === 1}
              className="dark:border-gray-600 dark:text-gray-300"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>

            <div className="flex items-center space-x-1">
              {getPageNumbers().map((pageNum, index) => (
                <React.Fragment key={index}>
                  {pageNum === '...' ? (
                    <span className="px-2 py-1 text-gray-500">...</span>
                  ) : (
                    <Button
                      variant={currentPage === pageNum ? "default" : "outline"}
                      size="sm"
                      onClick={() => changePage(pageNum as number)}
                      className={cn(
                        "h-8 w-8 p-0",
                        currentPage === pageNum 
                          ? "bg-blue-600 text-white" 
                          : "dark:border-gray-600 dark:text-gray-300"
                      )}
                    >
                      {pageNum}
                    </Button>
                  )}
                </React.Fragment>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => changePage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="dark:border-gray-600 dark:text-gray-300"
            >
              Siguiente
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Pagination>
        </div>
      )}

      {/* Modal de registro de pago */}
      {facturaSeleccionada && (
        <RegistrarPagoModal
          open={showPagoModal}
          onOpenChange={setShowPagoModal}
          factura={facturaSeleccionada}
          onPagoRegistrado={cargarFacturas}
        />
      )}
    </div>
  );
}
