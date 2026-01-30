'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { MoreVertical, Eye, Printer, Mail, Send, AlertTriangle, ChevronDown, ChevronRight, CreditCard, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { formatCurrency } from '@/utils/Utils';
import DetalleFactura from './id/DetalleFactura';
import { PagosFactura } from './PagosFactura';
import { ElectronicInvoiceStatus } from '@/components/finanzas/facturacion-electronica';

// Función para formatear fechas sin usar Date (evita errores de tipo)
const formatearFecha = (fechaStr: string | null): string => {
  if (!fechaStr) return 'N/A';
  try {
    // Formatear directamente el string de fecha
    const partes = fechaStr.split('T')[0].split('-');
    if (partes.length !== 3) return fechaStr;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  } catch (e) {
    return fechaStr || 'N/A';
  }
};

// Tipo para las facturas
// Tipo para los filtros
export interface FiltrosFacturas {
  busqueda: string;
  estado: string;
  fechaInicio?: Date;
  fechaFin?: Date;
  montoMin?: number;
  montoMax?: number;
  customer_id?: string;
  payment_method?: string;
}

interface Factura {
  id: string; // UUID en Supabase
  number: string;
  customer_id: string; // UUID del cliente
  customer_name: string; // Campo calculado para mostrar
  sale_id?: string; // UUID opcional de la venta relacionada
  issue_date: string;
  due_date: string;
  subtotal?: number;
  tax_total?: number;
  total: number;
  balance: number;
  status: 'draft' | 'issued' | 'paid' | 'partial' | 'void' | 'overdue';
  currency: string;
  payment_method: string;
  payment_method_name: string; // Campo calculado para mostrar
  notes?: string;
  created_at?: string;
  tax_included?: boolean;
  payment_terms?: number;
}

interface FacturasTableProps {
  filtros?: FiltrosFacturas;
}

// Función para obtener el color del badge según el estado
const getStatusColor = (status: string) => {
  switch (status) {
    case 'draft': return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    case 'issued': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    case 'void': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    case 'overdue': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    case 'paid': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'partial': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
    default: return 'bg-gray-200 text-gray-800';
  }
};

// Función para obtener el texto en español según el estado
const getStatusText = (status: string) => {
  switch (status) {
    case 'draft': return 'Borrador';
    case 'issued': return 'Emitida';
    case 'void': return 'Anulada';
    case 'overdue': return 'Vencida';
    case 'paid': return 'Pagada';
    case 'partial': return 'Pago Parcial';
    default: return 'Desconocido';
  }
};

export function FacturasTable({ filtros }: FacturasTableProps = {}) {
  const router = useRouter();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [facturaSeleccionadaId, setFacturaSeleccionadaId] = useState<string | null>(null);
  const [mostrarDetalles, setMostrarDetalles] = useState(false);
  const [filasExpandidas, setFilasExpandidas] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  
  // Estado para la paginación
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const pageSizeOptions = [5, 10, 20, 50, 100];

  // Aplicar filtros a las facturas
  const facturasFiltradas = React.useMemo(() => {
    if (!filtros || !facturas.length) return facturas;
    
    return facturas.filter(factura => {
      // Filtro de búsqueda (número, cliente)
      if (filtros.busqueda && filtros.busqueda.trim() !== '') {
        const busquedaLower = filtros.busqueda.toLowerCase();
        const numberMatch = factura.number.toLowerCase().includes(busquedaLower);
        const clientMatch = factura.customer_name.toLowerCase().includes(busquedaLower);
        if (!numberMatch && !clientMatch) return false;
      }
      
      // Filtro de estado
      if (filtros.estado && filtros.estado !== 'todos' && filtros.estado !== factura.status) {
        return false;
      }
      
      // Filtro de fecha de emisión
      if (filtros.fechaInicio) {
        const fechaEmision = new Date(factura.issue_date);
        if (fechaEmision < filtros.fechaInicio) return false;
      }
      
      if (filtros.fechaFin) {
        const fechaEmision = new Date(factura.issue_date);
        if (fechaEmision > filtros.fechaFin) return false;
      }
      
      // Filtro de monto
      if (filtros.montoMin !== undefined && factura.total < filtros.montoMin) {
        return false;
      }
      
      if (filtros.montoMax !== undefined && factura.total > filtros.montoMax) {
        return false;
      }
      
      // Filtro de cliente
      if (filtros.customer_id && filtros.customer_id.trim() !== '') {
        const clienteLower = filtros.customer_id.toLowerCase();
        if (!factura.customer_name.toLowerCase().includes(clienteLower)) {
          return false;
        }
      }
      
      // Filtro de método de pago
      if (filtros.payment_method && filtros.payment_method !== 'todos' && filtros.payment_method !== factura.payment_method) {
        return false;
      }
      
      return true;
    });
  }, [facturas, filtros]);
  
  // Obtener el número total de páginas
  const totalItems = facturasFiltradas.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  
  // Obtener elementos de la página actual
  const getCurrentPageItems = () => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItems);
    return facturasFiltradas.slice(startIndex, endIndex);
  };
  
  const facturasPaginadas = getCurrentPageItems();
  
  // Cambiar página
  const changePage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };
  
  // Generar array de páginas para mostrar
  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxPagesToShow = 5;
    
    if (totalPages <= maxPagesToShow) {
      // Si hay pocas páginas, mostrarlas todas
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      // Siempre mostrar la primera página
      pageNumbers.push(1);
      
      // Calcular el rango de páginas cercanas a la actual
      let startPage = Math.max(2, currentPage - 1);
      let endPage = Math.min(totalPages - 1, currentPage + 1);
      
      // Si estamos en las primeras páginas
      if (currentPage <= 2) {
        endPage = Math.min(4, totalPages - 1);
      } 
      // Si estamos en las últimas páginas
      else if (currentPage >= totalPages - 1) {
        startPage = Math.max(2, totalPages - 3);
      }
      
      // Agregar elipsis después de la primera página si es necesario
      if (startPage > 2) {
        pageNumbers.push('ellipsis-start');
      }
      
      // Agregar páginas centrales (empezando desde startPage, no desde 2)
      for (let i = startPage; i <= endPage; i++) {
        if (i !== 1 && i !== totalPages) {
          pageNumbers.push(i);
        }
      }
      
      // Agregar elipsis antes de la última página si es necesario
      if (endPage < totalPages - 1) {
        pageNumbers.push('ellipsis-end');
      } else if (endPage === totalPages - 1) {
        pageNumbers.push(totalPages - 1);
      }
      
      // Siempre mostrar la última página
      pageNumbers.push(totalPages);
    }
    
    return pageNumbers;
  };
  
  // Función para alternar el estado expandido de una fila
  const toggleFilaExpandida = (facturaId: string) => {
    const nuevasFilasExpandidas = new Set(filasExpandidas);
    if (nuevasFilasExpandidas.has(facturaId)) {
      nuevasFilasExpandidas.delete(facturaId);
    } else {
      nuevasFilasExpandidas.add(facturaId);
    }
    setFilasExpandidas(nuevasFilasExpandidas);
  };
  
  // Manejar cambio de tamaño de página
  const handlePageSizeChange = (value: string) => {
    const newSize = parseInt(value);
    setPageSize(newSize);
    setCurrentPage(1); // Volver a la primera página cuando cambia el tamaño
  };
  
  useEffect(() => {
    const cargarFacturas = async () => {
      try {
        const organizationId = getOrganizationId();
        
        if (!organizationId) {
          setError('No se pudo determinar la organización actual');
          setCargando(false);
          return;
        }

        // Ejecutar queries en paralelo para optimizar rendimiento
        const [facturaResult, customersResult, paymentMethodsResult] = await Promise.all([
          // Query 1: Obtener todas las facturas
          supabase
            .from('invoice_sales')
            .select(`
              id,
              number,
              customer_id,
              sale_id,
              issue_date,
              due_date,
              subtotal,
              tax_total,
              total,
              balance,
              status,
              currency,
              payment_method,
              notes,
              created_at,
              tax_included,
              payment_terms
            `)
            .eq('organization_id', organizationId)
            .order('issue_date', { ascending: false }),
          
          // Query 2: Obtener todos los clientes de la organización
          supabase
            .from('customers')
            .select('id, full_name, first_name, last_name')
            .eq('organization_id', organizationId),
          
          // Query 3: Obtener todos los métodos de pago
          supabase
            .from('payment_methods')
            .select('code, name')
        ]);

        if (facturaResult.error) {
          throw facturaResult.error;
        }

        // Crear mapas para búsqueda rápida
        const customersMap = new Map();
        if (customersResult.data) {
          customersResult.data.forEach(customer => {
            customersMap.set(customer.id, customer);
          });
        }

        const paymentMethodsMap = new Map();
        if (paymentMethodsResult.data) {
          paymentMethodsResult.data.forEach(method => {
            paymentMethodsMap.set(method.code, method);
          });
        }

        // Formatear los datos para la tabla usando los mapas
        const facturasFormateadas = facturaResult.data.map(item => {
          // Obtener nombre del cliente usando el mapa
          let customerName = 'Cliente sin nombre';
          const customer = customersMap.get(item.customer_id);
          if (customer) {
            customerName = customer.full_name || 
              `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 
              `Cliente #${item.customer_id}`;
          } else if (item.customer_id) {
            customerName = `Cliente #${item.customer_id}`;
          }

          // Obtener nombre del método de pago usando el mapa
          let paymentMethodName = 'No especificado';
          const paymentMethod = paymentMethodsMap.get(item.payment_method);
          if (paymentMethod && paymentMethod.name) {
            paymentMethodName = paymentMethod.name;
          } else if (item.payment_method) {
            paymentMethodName = item.payment_method;
          }

          return {
            id: item.id,
            number: item.number,
            customer_id: item.customer_id,
            customer_name: customerName,
            sale_id: item.sale_id,
            issue_date: item.issue_date,
            due_date: item.due_date,
            subtotal: item.subtotal,
            tax_total: item.tax_total,
            total: item.total,
            balance: item.balance,
            status: item.status,
            currency: item.currency || 'COP',
            payment_method: item.payment_method || 'cash',
            payment_method_name: paymentMethodName,
            notes: item.notes,
            created_at: item.created_at,
            tax_included: item.tax_included,
            payment_terms: item.payment_terms
          };
        });

        setFacturas(facturasFormateadas);
      } catch (err: any) {
        console.error('Error al cargar facturas:', err);
        setError('Error al cargar las facturas: ' + err.message);
        
        toast({
          title: 'Error',
          description: 'No se pudieron cargar las facturas',
          variant: 'destructive',
        });
      } finally {
        setCargando(false);
      }
    };

    cargarFacturas();
  }, [toast]);

  // Renderizado condicional para el estado de carga
  if (cargando) {
    return <TableSkeleton />;
  }

  // Renderizado condicional para el estado de error
  if (error) {
    return (
      <div className="text-center py-12 px-4">
        <div className="max-w-md mx-auto">
          <div className="rounded-full bg-red-50 dark:bg-red-900/20 p-4 w-fit mx-auto mb-4">
            <AlertTriangle className="h-10 w-10 sm:h-12 sm:w-12 text-red-500 dark:text-red-400" />
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Error al cargar datos
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-6">{error}</p>
          <Button 
            variant="outline" 
            size="sm"
            className="
              bg-white dark:bg-gray-800
              border-gray-300 dark:border-gray-600
              hover:bg-gray-50 dark:hover:bg-gray-700
              text-gray-700 dark:text-gray-200
            "
            onClick={() => window.location.reload()}
          >
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  // Renderizado cuando no hay facturas
  if (facturas.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <div className="max-w-md mx-auto">
          <div className="rounded-full bg-gray-100 dark:bg-gray-800 p-4 w-fit mx-auto mb-4">
            <FileText className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            No hay facturas
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
            No se encontraron facturas de venta para mostrar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
          Mostrando <span className="font-medium text-gray-900 dark:text-gray-100">{facturasPaginadas.length}</span> de <span className="font-medium text-gray-900 dark:text-gray-100">{facturasFiltradas.length}</span> facturas
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Mostrar</span>
          <Select
            value={pageSize.toString()}
            onValueChange={handlePageSizeChange}
          >
            <SelectTrigger className="h-8 w-16 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
              <SelectValue placeholder="10" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={size.toString()} className="text-gray-900 dark:text-gray-100">
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">filas</span>
        </div>
      </div>
      
      {/* Tabla responsive */}
      <div className="overflow-x-auto -mx-3 sm:mx-0 rounded-lg border border-gray-200 dark:border-gray-700">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
            <TableHead className="w-8 sm:w-12 text-gray-700 dark:text-gray-300"></TableHead>
            <TableHead className="w-8 sm:w-12 text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">#</TableHead>
            <TableHead className="min-w-[120px] text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">Número</TableHead>
            <TableHead className="min-w-[150px] text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">Cliente</TableHead>
            <TableHead className="min-w-[100px] text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">Emitida</TableHead>
            <TableHead className="min-w-[100px] text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">Vencimiento</TableHead>
            <TableHead className="min-w-[100px] text-right text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">Total</TableHead>
            <TableHead className="min-w-[100px] text-right text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">Saldo</TableHead>
            <TableHead className="min-w-[120px] text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">Método</TableHead>
            <TableHead className="min-w-[100px] text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">Estado</TableHead>
            <TableHead className="min-w-[90px] text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">FE</TableHead>
            <TableHead className="w-16 text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {facturasPaginadas.map((factura, index) => {
            const estaExpandida = filasExpandidas.has(factura.id);
            return (
              <React.Fragment key={factura.id}>
                <TableRow 
                  className="
                    hover:bg-gray-50 dark:hover:bg-gray-800/50 
                    border-b border-gray-200 dark:border-gray-700
                    transition-colors
                  "
                >
                  <TableCell className="w-8 sm:w-12">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="
                        h-6 w-6 p-0
                        hover:bg-gray-200 dark:hover:bg-gray-700
                        text-gray-600 dark:text-gray-400
                      "
                      onClick={() => toggleFilaExpandida(factura.id)}
                    >
                      {estaExpandida ? (
                        <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4" />
                      ) : (
                        <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="text-center font-medium text-gray-500 dark:text-gray-400 w-8 sm:w-12 text-xs sm:text-sm">
                    {(currentPage - 1) * pageSize + index + 1}
                  </TableCell>
              <TableCell className="font-semibold text-gray-900 dark:text-gray-100 text-xs sm:text-sm">
                {factura.number}
              </TableCell>
              <TableCell className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm truncate max-w-[200px]">{factura.customer_name}</TableCell>
              <TableCell className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm whitespace-nowrap">{formatearFecha(factura.issue_date)}</TableCell>
              <TableCell className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm whitespace-nowrap">{formatearFecha(factura.due_date)}</TableCell>
              <TableCell className="text-right font-medium text-gray-900 dark:text-gray-100 text-xs sm:text-sm whitespace-nowrap">
                {formatCurrency(factura.total, factura.currency)}
              </TableCell>
              <TableCell className="text-right font-medium text-gray-900 dark:text-gray-100 text-xs sm:text-sm whitespace-nowrap">
                {formatCurrency(factura.balance, factura.currency)}
              </TableCell>
              <TableCell className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm">
                <span className="truncate max-w-[120px] inline-block">{factura.payment_method_name}</span>
              </TableCell>
              <TableCell>
                <Badge className={`text-[10px] sm:text-xs px-2 py-0.5 ${getStatusColor(factura.status)}`}>
                  {getStatusText(factura.status)}
                </Badge>
              </TableCell>
              <TableCell>
                <ElectronicInvoiceStatus
                  invoiceId={factura.id}
                  size="sm"
                  showTooltip={true}
                />
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="
                        h-7 w-7 sm:h-8 sm:w-8 p-0 
                        hover:bg-gray-200 dark:hover:bg-gray-700
                        text-gray-600 dark:text-gray-400
                      "
                    >
                      <span className="sr-only">Abrir menú</span>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent 
                    align="end" 
                    className="
                      bg-white dark:bg-gray-800 
                      border-gray-200 dark:border-gray-700
                      shadow-lg
                    "
                  >
                    <DropdownMenuItem
                      className="
                        cursor-pointer text-sm
                        text-gray-700 dark:text-gray-200 
                        hover:bg-gray-100 dark:hover:bg-gray-700
                        focus:bg-gray-100 dark:focus:bg-gray-700
                      "
                      onClick={() => {
                        router.push(`/app/finanzas/facturas-venta/${factura.id}`);
                      }}
                    >
                      <Eye className="mr-2 h-4 w-4 flex-shrink-0" />
                      <span>Ver</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="
                        cursor-pointer text-sm
                        text-gray-700 dark:text-gray-200 
                        hover:bg-gray-100 dark:hover:bg-gray-700
                        focus:bg-gray-100 dark:focus:bg-gray-700
                      "
                      onClick={() => {
                        toast({
                          title: "Enviar factura",
                          description: `La factura ${factura.number} será enviada por email al cliente.`
                        });
                      }}
                    >
                      <Mail className="mr-2 h-4 w-4 flex-shrink-0" />
                      <span>Enviar por email</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="
                        cursor-pointer text-sm
                        text-gray-700 dark:text-gray-200 
                        hover:bg-gray-100 dark:hover:bg-gray-700
                        focus:bg-gray-100 dark:focus:bg-gray-700
                      "
                      onClick={() => {
                        toast({
                          title: "Enviar factura",
                          description: `La factura ${factura.number} será enviada por WhatsApp al cliente.`
                        });
                      }}
                    >
                      <Send className="mr-2 h-4 w-4 flex-shrink-0" />
                      <span>Enviar por WhatsApp</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
            
            {/* Fila expandida para mostrar los pagos */}
            {estaExpandida && (
              <TableRow className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                <TableCell colSpan={12} className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    <span className="text-xs sm:text-sm font-semibold text-blue-600 dark:text-blue-400">Historial de Pagos</span>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-2 sm:p-3">
                    <PagosFactura facturaId={factura.id} factura={factura} />
                  </div>
                </TableCell>
              </TableRow>
            )}
          </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
      </div>
      
      {/* Paginación */}
      {totalPages > 1 && (
        <div className="
          flex flex-col gap-3 py-4 px-2
          sm:flex-row sm:items-center sm:justify-between
          border-t border-gray-200 dark:border-gray-700
          bg-gray-50/50 dark:bg-gray-900/30
        ">
          {/* Información de paginación - oculta en móvil muy pequeño */}
          <div className="hidden sm:block text-xs sm:text-sm text-gray-600 dark:text-gray-400">
            Mostrando <span className="font-semibold text-gray-900 dark:text-gray-100">{((currentPage - 1) * pageSize) + 1}</span> a <span className="font-semibold text-gray-900 dark:text-gray-100">{Math.min(currentPage * pageSize, facturasFiltradas.length)}</span> de <span className="font-semibold text-gray-900 dark:text-gray-100">{facturasFiltradas.length}</span> facturas
          </div>
          
          {/* Info simplificada para móvil */}
          <div className="sm:hidden text-xs text-center text-gray-600 dark:text-gray-400">
            Página <span className="font-semibold text-gray-900 dark:text-gray-100">{currentPage}</span> de <span className="font-semibold text-gray-900 dark:text-gray-100">{totalPages}</span>
          </div>
          
          {/* Controles de paginación */}
          <Pagination>
            <PaginationContent className="flex-wrap justify-center gap-1">
              {/* Botón Anterior */}
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => changePage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className={`
                    h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm
                    transition-all duration-200
                    ${currentPage <= 1 
                      ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600' 
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 border-gray-300 dark:border-gray-600'
                    }
                  `}
                />
              </PaginationItem>
              
              {/* Números de página */}
              {getPageNumbers().map((pageNumber, index) => (
                <PaginationItem key={index} className="hidden sm:inline-flex">
                  {typeof pageNumber === 'string' ? (
                    <PaginationEllipsis className="text-gray-500 dark:text-gray-400" />
                  ) : (
                    <PaginationLink
                      onClick={() => changePage(pageNumber as number)}
                      isActive={pageNumber === currentPage}
                      className={`
                        h-8 sm:h-9 min-w-[32px] sm:min-w-[36px] px-2 sm:px-3 text-xs sm:text-sm
                        transition-all duration-200
                        ${pageNumber === currentPage
                          ? 'bg-blue-600 dark:bg-blue-600 text-white font-semibold shadow-md hover:bg-blue-700 dark:hover:bg-blue-500 border-blue-600 dark:border-blue-500'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 border-gray-300 dark:border-gray-600'
                        }
                      `}
                    >
                      {pageNumber}
                    </PaginationLink>
                  )}
                </PaginationItem>
              ))}
              
              {/* Indicador de página actual para móvil */}
              <PaginationItem className="sm:hidden">
                <div className="
                  h-8 min-w-[32px] px-3 
                  flex items-center justify-center
                  text-xs font-semibold
                  bg-blue-600 dark:bg-blue-600 text-white
                  rounded-md
                ">
                  {currentPage}
                </div>
              </PaginationItem>
              
              {/* Botón Siguiente */}
              <PaginationItem>
                <PaginationNext
                  onClick={() => changePage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className={`
                    h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm
                    transition-all duration-200
                    ${currentPage >= totalPages 
                      ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600' 
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 border-gray-300 dark:border-gray-600'
                    }
                  `}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}

// Componente para el estado de carga
function TableSkeleton() {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="dark:border-gray-700">
            <TableHead className="dark:text-gray-300">Número</TableHead>
            <TableHead className="dark:text-gray-300">Cliente</TableHead>
            <TableHead className="dark:text-gray-300">Emitida</TableHead>
            <TableHead className="dark:text-gray-300">Vencimiento</TableHead>
            <TableHead className="dark:text-gray-300">Total</TableHead>
            <TableHead className="dark:text-gray-300">Saldo</TableHead>
            <TableHead className="dark:text-gray-300">Método de pago</TableHead>
            <TableHead className="dark:text-gray-300">Estado</TableHead>
            <TableHead className="dark:text-gray-300">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...Array(5)].map((_, index) => (
            <TableRow key={index} className="dark:border-gray-700">
              <TableCell><Skeleton className="h-4 w-20 dark:bg-gray-700" /></TableCell>
              <TableCell><Skeleton className="h-4 w-32 dark:bg-gray-700" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24 dark:bg-gray-700" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24 dark:bg-gray-700" /></TableCell>
              <TableCell><Skeleton className="h-4 w-20 dark:bg-gray-700" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24 dark:bg-gray-700" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24 dark:bg-gray-700" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24 dark:bg-gray-700" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24 dark:bg-gray-700" /></TableCell>
              <TableCell><Skeleton className="h-8 w-8 rounded-full dark:bg-gray-700" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

