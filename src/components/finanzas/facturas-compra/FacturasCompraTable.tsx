'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
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
  const pathname = usePathname();
  const [facturas, setFacturas] = useState<InvoicePurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [showPagoModal, setShowPagoModal] = useState(false);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<InvoicePurchase | null>(null);
  const pageSize = 10;

  // Detectar si estamos en inventario o finanzas
  const basePath = pathname.includes('/inventario/') 
    ? '/app/inventario/facturas-compra' 
    : '/app/finanzas/facturas-compra';

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
    router.push(`${basePath}/${id}`);
  };

  const handleEditarFactura = (id: string) => {
    router.push(`${basePath}/${id}/editar`);
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
        return <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 dark:bg-gray-700 dark:text-gray-300">Borrador</Badge>;
      case 'received':
        return <Badge variant="default" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700">Recibida</Badge>;
      case 'partial':
        return <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-400">Parcial</Badge>;
      case 'paid':
        return <Badge variant="default" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700">Pagada</Badge>;
      case 'void':
        return <Badge variant="destructive" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 dark:bg-red-900/30 dark:text-red-400">Anulada</Badge>;
      default:
        return <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 dark:bg-gray-700 dark:text-gray-300">Desconocido</Badge>;
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
      <div className="space-y-4">
        {/* Skeleton de tabla */}
        <div className="rounded-lg border dark:border-gray-700 overflow-hidden">
          {/* Header skeleton */}
          <div className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 p-4">
            <div className="flex gap-4">
              {[100, 150, 80, 80, 90, 70, 80].map((w, i) => (
                <div key={i} className={`h-4 bg-gray-200 dark:bg-gray-600 rounded animate-pulse`} style={{ width: w }}></div>
              ))}
            </div>
          </div>
          {/* Rows skeleton */}
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="border-b dark:border-gray-700 p-4 flex items-center gap-4 animate-pulse" style={{ animationDelay: `${i * 100}ms` }}>
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-600 rounded"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 bg-gray-200 dark:bg-gray-600 rounded"></div>
                <div className="h-3 w-24 bg-gray-100 dark:bg-gray-700 rounded"></div>
              </div>
              <div className="h-4 w-20 bg-gray-200 dark:bg-gray-600 rounded"></div>
              <div className="h-4 w-20 bg-gray-200 dark:bg-gray-600 rounded"></div>
              <div className="h-6 w-16 bg-blue-100 dark:bg-blue-900/30 rounded-full"></div>
              <div className="flex gap-1">
                <div className="h-8 w-8 bg-gray-100 dark:bg-gray-700 rounded"></div>
                <div className="h-8 w-8 bg-gray-100 dark:bg-gray-700 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="rounded-md border dark:border-gray-700 overflow-x-auto -mx-2 sm:mx-0">
        <Table>
          <TableHeader>
            <TableRow className="dark:border-gray-700 border-b border-gray-200">
              <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">Núm. Factura</TableHead>
              <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">Proveedor</TableHead>
              <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap hidden md:table-cell">Fecha Emisión</TableHead>
              <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap hidden lg:table-cell">Vencimiento</TableHead>
              <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap text-right">Total</TableHead>
              <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap text-right hidden sm:table-cell">Balance</TableHead>
              <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">Estado</TableHead>
              <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap hidden xl:table-cell">Moneda</TableHead>
              <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {facturas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-6 sm:py-8 text-sm text-gray-500 dark:text-gray-400">
                  No se encontraron facturas de compra
                </TableCell>
              </TableRow>
            ) : (
              facturas.map((factura) => (
                <TableRow 
                  key={factura.id} 
                  className={cn(
                    "dark:border-gray-800 border-b border-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/50",
                    getRowClassName(factura)
                  )}
                >
                  <TableCell className="font-medium text-xs sm:text-sm text-gray-900 dark:text-gray-200 py-2 sm:py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate max-w-[120px] sm:max-w-none">{factura.number_ext}</span>
                      {factura.due_date && factura.balance > 0 && new Date(factura.due_date) < new Date() && (
                        <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4 text-red-500 dark:text-red-400 flex-shrink-0" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs sm:text-sm text-gray-900 dark:text-gray-300 py-2 sm:py-3">
                    <div>
                      <div className="font-medium truncate max-w-[150px] sm:max-w-[200px]">{factura.supplier?.name}</div>
                      {factura.supplier?.nit && (
                        <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-500">{factura.supplier.nit}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs sm:text-sm text-gray-900 dark:text-gray-300 py-2 sm:py-3 hidden md:table-cell whitespace-nowrap">
                    {factura.issue_date ? formatDate(new Date(factura.issue_date)) : '-'}
                  </TableCell>
                  <TableCell className="text-xs sm:text-sm text-gray-900 dark:text-gray-300 py-2 sm:py-3 hidden lg:table-cell whitespace-nowrap">
                    {factura.due_date ? formatDate(new Date(factura.due_date)) : '-'}
                  </TableCell>
                  <TableCell className="text-xs sm:text-sm text-gray-900 dark:text-gray-300 py-2 sm:py-3 text-right font-medium whitespace-nowrap">
                    {formatCurrency(factura.total, factura.currency)}
                  </TableCell>
                  <TableCell className="text-xs sm:text-sm py-2 sm:py-3 text-right font-semibold whitespace-nowrap hidden sm:table-cell">
                    <span className={cn(
                      factura.balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                    )}>
                      {formatCurrency(factura.balance, factura.currency)}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 sm:py-3">
                    {getEstadoBadge(factura.status)}
                  </TableCell>
                  <TableCell className="text-xs sm:text-sm text-gray-900 dark:text-gray-300 py-2 sm:py-3 hidden xl:table-cell">
                    {factura.currency}
                  </TableCell>
                  <TableCell className="text-right py-2 sm:py-3">
                    <div className="flex justify-end gap-0.5 sm:gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleVerDetalles(factura.id)}
                        className="h-7 w-7 sm:h-8 sm:w-8 p-0 dark:hover:bg-gray-700 dark:text-gray-300"
                        title="Ver detalles"
                      >
                        <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                      
                      {factura.status === 'draft' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditarFactura(factura.id)}
                          className="h-7 w-7 sm:h-8 sm:w-8 p-0 dark:hover:bg-gray-700 dark:text-gray-300"
                          title="Editar"
                        >
                          <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </Button>
                      )}
                      
                      {factura.status === 'received' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRecepcionar(factura.id)}
                          className="h-7 w-7 sm:h-8 sm:w-8 p-0 dark:hover:bg-gray-700 dark:text-gray-300"
                          title="Recepcionar a Inventario"
                        >
                          <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </Button>
                      )}
                      
                      {factura.balance > 0 && ['received', 'partial'].includes(factura.status) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRegistrarPago(factura)}
                          className="h-7 w-7 sm:h-8 sm:w-8 p-0 dark:hover:bg-gray-700 dark:text-gray-300"
                          title="Registrar Pago"
                        >
                          <CreditCard className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </Button>
                      )}
                      
                      {factura.status === 'draft' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEliminarFactura(factura.id)}
                          className="h-7 w-7 sm:h-8 sm:w-8 p-0 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-gray-700"
                          title="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
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
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 text-center sm:text-left">
            Mostrando {((currentPage - 1) * pageSize) + 1} a {Math.min(currentPage * pageSize, total)} de {total} facturas
          </div>
          
          <Pagination>
            <div className="flex items-center gap-1 sm:gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => changePage(currentPage - 1)}
                disabled={currentPage === 1}
                className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-1" />
                <span className="hidden sm:inline">Anterior</span>
              </Button>

              <div className="flex items-center gap-1">
                {getPageNumbers().map((pageNum, index) => (
                  <React.Fragment key={index}>
                    {pageNum === '...' ? (
                      <span className="px-1 sm:px-2 py-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400">...</span>
                    ) : (
                      <Button
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="sm"
                        onClick={() => changePage(pageNum as number)}
                        className={cn(
                          "h-7 w-7 sm:h-8 sm:w-8 p-0 text-xs sm:text-sm",
                          currentPage === pageNum 
                            ? "bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-600 dark:hover:bg-blue-700" 
                            : "dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
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
                className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <span className="hidden sm:inline">Siguiente</span>
                <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:ml-1" />
              </Button>
            </div>
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
